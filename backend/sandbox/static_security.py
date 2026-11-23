"""Report-only static security scan of generated build code (Foundation C).

docs/architecture/agent-collaboration-plan.md, Revision 3: decision F, §11
(static security is report-only; a scanner error is recorded as skipped and
has no quality effect), §16.8, §16.9 and §18.2 (flag
``static_security_report``, default off).

Two scanners, both deterministic and free (no provider call, no credits):

* **bandit** on the generated ``.py`` files. The files are copied into a
  fresh temporary directory under generated names (``0000.py`` ...) and bandit
  runs as a subprocess with a hard timeout. Bandit only parses the files into
  an AST; nothing generated is ever imported or executed. The interpreter runs
  in isolated mode (``-I``) so the scan directory is never on ``sys.path``,
  and ``--ignore-nosec`` stops generated code from silencing its own findings.
* **curated rules**: regular-expression checks for JS/TS (and a few for
  Python and config files) plus moderation's hard-coded secret patterns
  (``sandbox/moderation.py``), reused rather than copied.

The result is a plain dict (see ``scan_static_security``). Nothing here can
fail a build: every error, timeout or missing binary becomes a scanner status
of ``skipped`` with a reason. Excerpts never carry a secret in clear: they are
masked before they are truncated. Rules are never promoted to blocking here;
per-rule promotion happens only after measurement (plan §17.4).
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
import logging
import os
import re
import shutil
# Runs the bandit CLI only, never generated code.
import subprocess  # nosec B404
import sys
import tempfile
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, FrozenSet, Iterable, List, Optional, Pattern, Tuple

from sandbox.moderation import (
    _LINE_RULES as _MODERATION_LINE_RULES,
    _PRIVATE_KEY_RE,
    _SECRET_ASSIGN_RE,
    _is_placeholder,
)

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1

SOURCE_BANDIT = "bandit"
SOURCE_RULE = "rule"

SEVERITY_HIGH = "high"
SEVERITY_MEDIUM = "medium"
SEVERITY_LOW = "low"
_SEVERITIES = (SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW)

STATUS_COMPLETED = "completed"
STATUS_PARTIAL = "partial"
STATUS_SKIPPED = "skipped"
STATUS_NOT_APPLICABLE = "not_applicable"

# --- Bounds. Generated apps are small; these keep a pathological build cheap.
MAX_FILES = 500                 # files examined, in path order
MAX_FILE_BYTES = 200_000        # same per-file cap as moderation
MAX_TOTAL_BYTES = 3_000_000     # across all examined files
MAX_BANDIT_FILES = 200
MAX_LINE_CHARS = 4_000          # rules see at most this much of one line
MAX_FINDINGS = 300              # findings kept in the report (counts cover all)
MAX_EXCERPT_CHARS = 160
DEFAULT_BANDIT_TIMEOUT_S = 20.0
# Time the rules and the bookkeeping may take on top of the bandit timeout
# before the whole scan is abandoned and recorded as skipped.
_OVERALL_GRACE_S = 30.0

# Bandit checks not worth reporting on generated code. B101 (assert_used)
# fires on every generated test file.
_BANDIT_SKIP = ("B101",)

_JS_EXTS = frozenset({
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts",
    ".vue", ".svelte", ".html", ".htm",
})
_PY_EXTS = frozenset({".py"})
_CONFIG_EXTS = frozenset({
    ".json", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".sh",
    ".env", ".properties",
})
_CONFIG_NAMES = frozenset({"dockerfile", "procfile", "makefile"})
_EXCLUDED_NAMES = frozenset({
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
    "pipfile.lock", "composer.lock",
})
_EXCLUDED_SEGMENTS = frozenset({"node_modules", ".git", "__pycache__", ".venv", "venv"})

LANG_JS = "js"
LANG_PY = "py"
LANG_CONFIG = "config"
_ALL_LANGS = frozenset({LANG_JS, LANG_PY, LANG_CONFIG})


def _language(path: str) -> Optional[str]:
    """The rule language of a generated file, or None when it is out of scope."""
    normalized = path.replace("\\", "/")
    segments = [s for s in normalized.split("/") if s]
    if not segments or any(s in _EXCLUDED_SEGMENTS for s in segments[:-1]):
        return None
    name = segments[-1].lower()
    if name in _EXCLUDED_NAMES or name.endswith(".min.js"):
        return None
    if name in _CONFIG_NAMES or name == ".env" or name.startswith(".env."):
        return LANG_CONFIG
    ext = os.path.splitext(name)[1]
    if ext in _JS_EXTS:
        return LANG_JS
    if ext in _PY_EXTS:
        return LANG_PY
    if ext in _CONFIG_EXTS:
        return LANG_CONFIG
    return None


# ---------------------------------------------------------------------------
# Secret masking. Applied to every excerpt, bandit's included, before the
# excerpt is truncated (a truncated secret might no longer match).
# ---------------------------------------------------------------------------

_MASK = "****"

# Moderation's vendor-specific secret patterns. The first four characters of
# each match are a public prefix (AKIA, sk_l, xoxb, ghp_, aws_ ...), so keeping
# them tells the reader which kind of secret it was without revealing it.
_VENDOR_SECRET_PATTERNS: Tuple[Pattern[str], ...] = tuple(
    pattern for category, _sev, pattern, _msg in _MODERATION_LINE_RULES if category == "secret"
)

_SECRET_NAME_HINT_RE = re.compile(
    r"(?i)password|passwd|pwd|secret|token|api[_\-]?key|apikey|access[_\-]?key|"
    r"private[_\-]?key|credential"
)
# A name token, an assignment or comparison, then a quoted literal. The
# lookbehind makes each token start the only place a match can begin, which
# keeps this linear on long lines; the name is checked in Python.
_MASK_NAMED_LITERAL_RE = re.compile(
    r"(?<![A-Za-z0-9_\-])([A-Za-z0-9_\-]+[\"'`]?\s*(?:===?|!==?|[:=])\s*)([\"'`])([^\"'`\n]+)(\2)"
)
_MASK_BEARER_RE = re.compile(r"(?i)(bearer\s+)([A-Za-z0-9\-._~+/]{8,}=*)")
_MASK_URL_CREDENTIALS_RE = re.compile(r"(://[^/\s:@\"'`]+:)([^@\s\"'`/]+)(@)")
_MASK_TOKEN_LIKE_RE = re.compile(r"(?<![A-Za-z0-9+/=_\-])[A-Za-z0-9+/=_\-]{32,}(?![A-Za-z0-9+/=_\-])")
# Excerpts are cut to MAX_EXCERPT_CHARS after masking; masking more of the
# line than this is wasted work.
_MASK_INPUT_CHARS = 1_000


def _mask_named_literal(match: "re.Match[str]") -> str:
    if _SECRET_NAME_HINT_RE.search(match.group(1)):
        return match.group(1) + match.group(2) + _MASK + match.group(4)
    return match.group(0)


def _mask_token_like(match: "re.Match[str]") -> str:
    value = match.group(0)
    # Long runs with both letters and digits look like keys; long plain
    # identifiers (no digits) are left readable.
    if any(c.isdigit() for c in value) and any(c.isalpha() for c in value):
        return value[:4] + _MASK
    return value


def mask_secrets(text: str) -> str:
    """Mask anything secret-shaped in ``text``. Over-masking is acceptable;
    leaking is not."""
    for pattern in _VENDOR_SECRET_PATTERNS:
        text = pattern.sub(lambda m: m.group(0)[:4] + _MASK, text)
    text = _PRIVATE_KEY_RE.sub("-----BEGIN PRIVATE KEY [masked]-----", text)
    text = _MASK_NAMED_LITERAL_RE.sub(_mask_named_literal, text)
    text = _MASK_BEARER_RE.sub(lambda m: m.group(1) + _MASK, text)
    text = _MASK_URL_CREDENTIALS_RE.sub(lambda m: m.group(1) + _MASK + m.group(3), text)
    text = _MASK_TOKEN_LIKE_RE.sub(_mask_token_like, text)
    return text


def _excerpt(line: str) -> str:
    masked = mask_secrets(line.strip()[:_MASK_INPUT_CHARS])
    if len(masked) > MAX_EXCERPT_CHARS:
        masked = masked[:MAX_EXCERPT_CHARS] + "..."
    return masked


# ---------------------------------------------------------------------------
# Findings and report
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StaticFinding:
    rule_id: str
    severity: str
    confidence: str
    file: str
    line: int
    excerpt: str
    message: str
    source: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "severity": self.severity,
            "confidence": self.confidence,
            "file": self.file,
            "line": self.line,
            "excerpt": self.excerpt,
            "message": self.message,
            "source": self.source,
        }


def _sort_key(f: StaticFinding) -> Tuple[str, int, str, str]:
    return (f.file, f.line, f.source, f.rule_id)


def _scanner_entry(status: str, reason: Optional[str] = None, **extra: Any) -> Dict[str, Any]:
    entry: Dict[str, Any] = {"status": status, "reason": reason}
    entry.update(extra)
    return entry


def _empty_report(status: str, reason: Optional[str]) -> Dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "report_only": True,
        "status": status,
        "reason": reason,
        "scanners": {},
        "files_scanned": 0,
        "files_skipped": 0,
        "counts": {s: 0 for s in _SEVERITIES},
        "findings": [],
        "truncated": False,
        "duration_ms": 0,
    }


def skipped_report(reason: str) -> Dict[str, Any]:
    """The report recorded when the scan as a whole could not run."""
    return _empty_report(STATUS_SKIPPED, reason)


# ---------------------------------------------------------------------------
# Curated rules
# ---------------------------------------------------------------------------

# A matcher receives (content, lines, language) and yields 1-based line
# numbers. Comment-only lines are filtered by the caller.
Matcher = Callable[[str, List[str], str], Iterable[int]]


@dataclass(frozen=True)
class Rule:
    rule_id: str
    severity: str
    confidence: str
    message: str
    langs: FrozenSet[str]
    matcher: Matcher


def _is_comment_line(line: str, lang: str) -> bool:
    stripped = line.lstrip()
    if lang == LANG_JS:
        return stripped.startswith(("//", "/*", "*", "<!--"))
    if lang in (LANG_PY, LANG_CONFIG):
        return stripped.startswith("#")
    return False


def _line_of(content: str, pos: int) -> int:
    return content.count("\n", 0, pos) + 1


def _line_rule(pattern: Pattern[str], keep: Optional[Callable[["re.Match[str]", str], bool]] = None,
               file_requires: Optional[Pattern[str]] = None) -> Matcher:
    """A matcher that tests each line (capped at MAX_LINE_CHARS) against
    ``pattern``; ``keep`` filters matches; ``file_requires`` limits the rule
    to files that contain it (e.g. a child_process import)."""

    def match(content: str, lines: List[str], _lang: str) -> Iterable[int]:
        if file_requires is not None and not file_requires.search(content):
            return
        for number, line in enumerate(lines, start=1):
            capped = line[:MAX_LINE_CHARS]
            for m in pattern.finditer(capped):
                if keep is None or keep(m, capped):
                    yield number
                    break

    return match


# --- helpers for "is this expression safe?" decisions ---

_STATIC_LITERAL_RE = re.compile(
    r"""^\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\$]|\\.|\$(?!\{))*`)\s*\)?\s*;?\s*(?://.*)?$"""
)
_SANITIZER_RE = re.compile(r"(?i)\b(?:dompurify|purify|sanitiz\w*|xss|escape\w*)\s*[.(]")


def _is_static_literal(expr: str) -> bool:
    return bool(_STATIC_LITERAL_RE.match(expr))


def _is_sanitized(expr: str) -> bool:
    return bool(_SANITIZER_RE.search(expr))


# --- dynamic code execution ---
_EVAL_RE = re.compile(r"(?<![\w$])eval\s*\(")
_NEW_FUNCTION_RE = re.compile(r"\bnew\s+Function\s*\(")
_STRING_TIMER_RE = re.compile(r"(?<![\w$])set(?:Timeout|Interval)\s*\(\s*[\"'`]")

# --- XSS sinks ---
_DANGEROUS_HTML_RE = re.compile(r"dangerouslySetInnerHTML\s*=\s*\{")
_HTML_PROP_RE = re.compile(r"__html\s*:\s*")


def _dangerously_set_inner_html(content: str, _lines: List[str], _lang: str) -> Iterable[int]:
    for m in _DANGEROUS_HTML_RE.finditer(content):
        window = content[m.end():m.end() + 400]
        prop = _HTML_PROP_RE.search(window)
        if prop is None:
            # An object passed in whole: its __html cannot be checked here.
            yield _line_of(content, m.start())
            continue
        expr = window[prop.end():]
        end = expr.find("}")
        expr = expr if end == -1 else expr[:end]
        expr = expr.strip().rstrip(",").strip()
        if _is_static_literal(expr) or _is_sanitized(expr):
            continue
        yield _line_of(content, m.start())


_INNER_HTML_RE = re.compile(r"\.(?:inner|outer)HTML\s*\+?=(?!=)(?P<rhs>.*)")
_INSERT_ADJACENT_RE = re.compile(r"\.insertAdjacentHTML\s*\(\s*[^,]+,(?P<rhs>.*)")


def _unsafe_html_rhs(m: "re.Match[str]", _line: str) -> bool:
    rhs = m.group("rhs")
    return not (_is_static_literal(rhs) or _is_sanitized(rhs))


def _dom_inner_html(content: str, lines: List[str], lang: str) -> Iterable[int]:
    yield from _merge(
        _line_rule(_INNER_HTML_RE, _unsafe_html_rhs)(content, lines, lang),
        _line_rule(_INSERT_ADJACENT_RE, _unsafe_html_rhs)(content, lines, lang),
    )


def _merge(*streams: Iterable[int]) -> Iterable[int]:
    seen = set()
    for stream in streams:
        for number in stream:
            if number not in seen:
                seen.add(number)
                yield number


_DOCUMENT_WRITE_RE = re.compile(r"(?<![\w$])document\s*\.\s*write(?:ln)?\s*\(")

# --- token storage ---
_TOKENISH_KEY_RE = re.compile(
    r"(?i)(?:token|jwt|auth(?!or)|session|secret|passw(?:or)?d|credential|api[_\-]?key|bearer)"
)
_STORAGE_SET_ITEM_RE = re.compile(
    r"(?<![\w$])(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*(?P<key>[^,)]+)"
)
_STORAGE_INDEX_RE = re.compile(
    r"(?<![\w$])(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\s*\[\s*(?P<key>[^\]]+)\]\s*=(?!=)"
)
_STORAGE_PROP_RE = re.compile(
    r"(?<![\w$])(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\s*\.\s*(?P<key>[A-Za-z_$][\w$]*)\s*=(?!=)"
)


def _tokenish_key(m: "re.Match[str]", _line: str) -> bool:
    return bool(_TOKENISH_KEY_RE.search(m.group("key")))


def _web_storage_token(content: str, lines: List[str], lang: str) -> Iterable[int]:
    for number, line in enumerate(lines, start=1):
        capped = line[:MAX_LINE_CHARS]
        for pattern in (_STORAGE_SET_ITEM_RE, _STORAGE_INDEX_RE, _STORAGE_PROP_RE):
            if any(_tokenish_key(m, capped) for m in pattern.finditer(capped)):
                yield number
                break


# --- CORS: any origin together with credentials ---
_JS_CORS_ANY_ORIGIN = (
    re.compile(r"Access-Control-Allow-Origin[\"'`]?\s*[,:=]\s*[\"'`]\*[\"'`]", re.IGNORECASE),
    re.compile(r"\borigin\s*:\s*(?:[\"'`]\*[\"'`]|true\b)"),
)
_JS_CORS_CREDENTIALS = (
    re.compile(r"Access-Control-Allow-Credentials[\"'`]?\s*[,:=]\s*[\"'`]?true", re.IGNORECASE),
    re.compile(r"\bcredentials\s*:\s*true\b"),
)
_PY_CORS_ANY_ORIGIN = (
    re.compile(r"\ballow_origins\s*=\s*\[\s*[\"']\*[\"']\s*\]"),
    re.compile(r"\ballow_origin_regex\s*=\s*r?[\"']\.\*[\"']"),
    re.compile(r"\borigins\s*=\s*[\"']\*[\"']"),
    re.compile(r"[\"']Access-Control-Allow-Origin[\"']\s*\]?\s*[,:=]\s*[\"']\*[\"']", re.IGNORECASE),
)
_PY_CORS_CREDENTIALS = (
    re.compile(r"\ballow_credentials\s*=\s*True\b"),
    re.compile(r"\bsupports_credentials\s*=\s*True\b"),
    re.compile(r"[\"']Access-Control-Allow-Credentials[\"']\s*\]?\s*[,:=]\s*[\"']true[\"']", re.IGNORECASE),
)


# Credentials must be enabled within this many lines of the any-origin
# setting: one cors({...}) object, one add_middleware(...) call, or adjacent
# setHeader calls.
_CORS_PROXIMITY_LINES = 8


def _cors_wildcard_credentials(content: str, lines: List[str], lang: str) -> Iterable[int]:
    origin_patterns, credential_patterns = (
        (_PY_CORS_ANY_ORIGIN, _PY_CORS_CREDENTIALS) if lang == LANG_PY
        else (_JS_CORS_ANY_ORIGIN, _JS_CORS_CREDENTIALS)
    )
    origin_lines: List[int] = []
    credential_lines: List[int] = []
    for number, line in enumerate(lines, start=1):
        if _is_comment_line(line, lang):
            continue
        capped = line[:MAX_LINE_CHARS]
        if any(p.search(capped) for p in origin_patterns):
            origin_lines.append(number)
        if any(p.search(capped) for p in credential_patterns):
            credential_lines.append(number)
    for number in origin_lines:
        if any(abs(number - c) <= _CORS_PROXIMITY_LINES for c in credential_lines):
            yield number


# --- child_process with an interpolated command ---
_CHILD_PROCESS_IMPORT_RE = re.compile(
    r"(?:require\s*\(\s*|from\s+|import\s*\(\s*)[\"'`](?:node:)?child_process[\"'`]"
)
_EXEC_CALL_RE = re.compile(r"(?<![\w$])(?:exec|execSync|execAsync)\s*\(\s*(?P<arg>.*)")
_QUOTED_RE = re.compile(r"\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*'")


def _interpolated_command(m: "re.Match[str]", _line: str) -> bool:
    arg = m.group("arg")
    if arg.startswith("`"):
        close = arg.find("`", 1)
        body = arg[1:] if close == -1 else arg[1:close]
        return "${" in body
    # The first argument (up to the first comma outside a string literal)
    # built by concatenation.
    first = _QUOTED_RE.sub('""', arg).split(",", 1)[0]
    return "+" in first


# --- plaintext endpoints ---
_PLAINTEXT_URL_RE = re.compile(
    r"(?P<q>[\"'`])(?P<scheme>http|ws)://(?P<host>[^/\"'`\s:?#]+)[^\"'`\s]*(?P=q)"
)
_NETWORK_CONTEXT_RE = re.compile(
    r"(?i)(?:\bfetch\s*\(|\baxios\b|\.(?:get|post|put|patch|delete|request|head|open)\s*\(|"
    r"(?:base|api|server|backend|service)_?(?:url|uri|endpoint|host)|\bendpoint\b|"
    r"\bnew\s+WebSocket\s*\(|\bEventSource\s*\(|\burlopen\s*\(|\b(?:requests|httpx|aiohttp)\.)"
)
_LOCAL_HOST_RE = re.compile(
    r"(?i)^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\]|10(?:\.\d{1,3}){3}|"
    r"192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|"
    r".*\.(?:local|localhost|test|internal|example|invalid)|(?:.*\.)?example\.(?:com|org|net))$"
)


def _insecure_endpoint(m: "re.Match[str]", line: str) -> bool:
    host = m.group("host")
    if "." not in host or _LOCAL_HOST_RE.match(host):
        # Local, private-network, reserved, or a bare service name (docker
        # compose "http://backend:8000").
        return False
    if "${" in host or "{" in host:
        return False
    return bool(_NETWORK_CONTEXT_RE.search(line))


# --- TLS verification disabled ---
_TLS_DISABLED_RE = re.compile(
    r"\brejectUnauthorized\s*:\s*false\b|"
    r"NODE_TLS_REJECT_UNAUTHORIZED[\"'`]?\s*[\]]?\s*[=:]\s*[\"'`]?0\b|"
    r"\bstrictSSL\s*:\s*false\b"
)


# --- secrets (moderation's patterns) ---


def _secret_rule_id(message: str) -> str:
    """Stable id from a moderation message, e.g. "Hardcoded Slack token
    detected" -> "secret-slack-token"."""
    text = message.lower()
    text = re.sub(r"^hardcoded\s+", "", text)
    text = re.sub(r"\s+detected$", "", text)
    return "secret-" + re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def _pattern_matcher(pattern: Pattern[str]) -> Matcher:
    def match(content: str, _lines: List[str], _lang: str) -> Iterable[int]:
        for m in pattern.finditer(content):
            yield _line_of(content, m.start())
    return match


def _generic_secret_assignment(content: str, _lines: List[str], _lang: str) -> Iterable[int]:
    for m in _SECRET_ASSIGN_RE.finditer(content):
        if not _is_placeholder(m.group(2)):
            yield _line_of(content, m.start())


def _secret_rules() -> List[Rule]:
    rules = [
        Rule(
            rule_id=_secret_rule_id(message),
            severity=SEVERITY_HIGH,
            confidence="high",
            message=message + "; move it to a server-side environment variable and rotate it",
            langs=_ALL_LANGS,
            matcher=_pattern_matcher(pattern),
        )
        for category, _sev, pattern, message in _MODERATION_LINE_RULES
        if category == "secret"
    ]
    rules.append(Rule(
        rule_id="secret-private-key",
        severity=SEVERITY_HIGH,
        confidence="high",
        message="Private key material in source; load it from a secret store instead",
        langs=_ALL_LANGS,
        matcher=_pattern_matcher(_PRIVATE_KEY_RE),
    ))
    rules.append(Rule(
        rule_id="secret-generic-assignment",
        severity=SEVERITY_MEDIUM,
        confidence="low",
        message="High-entropy value assigned to a secret-named variable",
        langs=_ALL_LANGS,
        matcher=_generic_secret_assignment,
    ))
    return rules


_JS = frozenset({LANG_JS})
_JS_PY = frozenset({LANG_JS, LANG_PY})
_JS_CONFIG = frozenset({LANG_JS, LANG_CONFIG})

RULES: Tuple[Rule, ...] = tuple([
    Rule("js-eval", SEVERITY_HIGH, "medium",
         "eval() runs a string as code; parse data with JSON.parse or remove it", _JS,
         _line_rule(_EVAL_RE)),
    Rule("js-new-function", SEVERITY_HIGH, "high",
         "new Function() compiles a string into code, like eval()", _JS,
         _line_rule(_NEW_FUNCTION_RE)),
    Rule("js-string-timer", SEVERITY_MEDIUM, "high",
         "setTimeout/setInterval with a string argument evaluates it as code; pass a function", _JS,
         _line_rule(_STRING_TIMER_RE)),
    Rule("react-dangerously-set-inner-html", SEVERITY_HIGH, "medium",
         "dangerouslySetInnerHTML with a value that is not a literal and not sanitized (e.g. DOMPurify.sanitize) is an XSS sink",
         _JS, _dangerously_set_inner_html),
    Rule("dom-inner-html", SEVERITY_MEDIUM, "medium",
         "HTML built from a non-literal value is assigned to innerHTML/outerHTML/insertAdjacentHTML (XSS sink); use textContent or sanitize",
         _JS, _dom_inner_html),
    Rule("dom-document-write", SEVERITY_MEDIUM, "medium",
         "document.write() injects raw HTML into the page (XSS sink)", _JS,
         _line_rule(_DOCUMENT_WRITE_RE)),
    Rule("web-storage-token", SEVERITY_MEDIUM, "medium",
         "An auth token or secret is stored in localStorage/sessionStorage, readable by any script on the page; prefer an httpOnly cookie",
         _JS, _web_storage_token),
    Rule("cors-wildcard-credentials", SEVERITY_HIGH, "medium",
         "CORS allows any origin while also allowing credentials, so any site can make authenticated requests; list the allowed origins",
         _JS_PY, _cors_wildcard_credentials),
    Rule("child-process-exec-interpolation", SEVERITY_HIGH, "medium",
         "child_process exec() with an interpolated or concatenated command string allows shell injection; use execFile/spawn with an argument array",
         _JS, _line_rule(_EXEC_CALL_RE, _interpolated_command, file_requires=_CHILD_PROCESS_IMPORT_RE)),
    Rule("insecure-http-endpoint", SEVERITY_MEDIUM, "medium",
         "Plaintext http:// or ws:// endpoint: requests and credentials can be read or changed in transit; use https:// or wss://",
         _JS_PY, _line_rule(_PLAINTEXT_URL_RE, _insecure_endpoint)),
    Rule("tls-verification-disabled", SEVERITY_HIGH, "high",
         "TLS certificate verification is disabled, which allows man-in-the-middle attacks", _JS_CONFIG,
         _line_rule(_TLS_DISABLED_RE)),
] + _secret_rules())

RULE_IDS: FrozenSet[str] = frozenset(r.rule_id for r in RULES)


def scan_rules(files: Dict[str, str]) -> List[StaticFinding]:
    """Run the curated rules over already-bounded ``path -> content`` files.
    Synchronous, deterministic, no I/O."""
    findings: List[StaticFinding] = []
    for path in sorted(files):
        content = files[path]
        lang = _language(path)
        if lang is None:
            continue
        lines = content.split("\n")
        for rule in RULES:
            if lang not in rule.langs:
                continue
            reported = set()
            for number in rule.matcher(content, lines, lang):
                if number in reported or not 1 <= number <= len(lines):
                    continue
                line = lines[number - 1]
                if _is_comment_line(line, lang):
                    continue
                reported.add(number)
                findings.append(StaticFinding(
                    rule_id=rule.rule_id,
                    severity=rule.severity,
                    confidence=rule.confidence,
                    file=path,
                    line=number,
                    excerpt=_excerpt(line),
                    message=rule.message,
                    source=SOURCE_RULE,
                ))
    return findings


# ---------------------------------------------------------------------------
# bandit
# ---------------------------------------------------------------------------


class BanditSkipped(Exception):
    """Bandit could not produce a result; ``str(exc)`` is the reason."""


def _resolve_bandit_command() -> Optional[List[str]]:
    """The argv prefix that runs bandit, or None when it is not installed.
    Prefers this interpreter's own bandit module (isolated mode, so the scan
    directory is never importable), then a bandit executable on PATH."""
    if importlib.util.find_spec("bandit") is not None:
        return [sys.executable, "-I", "-m", "bandit"]
    path = shutil.which("bandit")
    return [path] if path else None


def _subprocess_env() -> Dict[str, str]:
    """A minimal environment: the scan needs no credentials, so none of the
    worker's environment (API keys, database URLs) is passed on."""
    env = {
        "PATH": os.environ.get("PATH", os.defpath),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    if "SYSTEMROOT" in os.environ:  # required by Python on Windows
        env["SYSTEMROOT"] = os.environ["SYSTEMROOT"]
    return env


def _bandit_severity(value: Any) -> str:
    lowered = str(value or "").lower()
    return lowered if lowered in _SEVERITIES else SEVERITY_LOW


def _bandit_confidence(value: Any) -> str:
    lowered = str(value or "").lower()
    return lowered if lowered in ("high", "medium", "low") else "low"


def _run_bandit_sync(py_files: Dict[str, str], timeout_s: float) -> Tuple[List[StaticFinding], int]:
    """Run bandit over ``py_files`` (original path -> content). Returns the
    findings and the number of files bandit could not parse. Raises
    BanditSkipped with a reason on any failure."""
    command = _resolve_bandit_command()
    if not command:
        raise BanditSkipped("bandit is not installed")

    with tempfile.TemporaryDirectory(prefix="forge-static-security-") as root:
        src = os.path.join(root, "src")
        os.mkdir(src)
        by_name: Dict[str, str] = {}
        targets: List[str] = []
        for index, path in enumerate(sorted(py_files)):
            name = f"{index:04d}.py"
            target = os.path.join(src, name)
            with open(target, "w", encoding="utf-8", errors="replace") as handle:
                handle.write(py_files[path])
            by_name[name] = path
            targets.append(target)

        argv = command + [
            "-f", "json", "-q", "--ignore-nosec",
            "--skip", ",".join(_BANDIT_SKIP),
            *targets,
        ]
        try:
            # Fixed argv, no shell; the generated files are only parsed.
            proc = subprocess.run(  # nosec B603
                argv,
                cwd=root,
                env=_subprocess_env(),
                stdin=subprocess.DEVNULL,
                capture_output=True,
                timeout=timeout_s,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise BanditSkipped(f"bandit timed out after {timeout_s:g}s") from None
        except OSError as exc:
            raise BanditSkipped(f"bandit could not be started ({type(exc).__name__})") from None

    try:
        payload = json.loads(proc.stdout.decode("utf-8", "replace") or "null")
    except ValueError:
        payload = None
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise BanditSkipped(f"bandit produced no JSON report (exit code {proc.returncode})")

    findings: List[StaticFinding] = []
    for result in payload["results"]:
        if not isinstance(result, dict):
            continue
        path = by_name.get(os.path.basename(str(result.get("filename") or "")))
        if path is None:
            continue
        try:
            line_no = int(result.get("line_number") or 0)
        except (TypeError, ValueError):
            line_no = 0
        lines = py_files[path].split("\n")
        line = lines[line_no - 1] if 1 <= line_no <= len(lines) else ""
        test_id = str(result.get("test_id") or "bandit")
        text = str(result.get("issue_text") or result.get("test_name") or test_id)
        findings.append(StaticFinding(
            rule_id=test_id,
            severity=_bandit_severity(result.get("issue_severity")),
            confidence=_bandit_confidence(result.get("issue_confidence")),
            file=path,
            line=line_no,
            excerpt=_excerpt(line),
            message=mask_secrets(text)[:300],
            source=SOURCE_BANDIT,
        ))
    errors = payload.get("errors")
    parse_errors = len(errors) if isinstance(errors, list) else 0
    return findings, parse_errors


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def _bounded_files(files: Any) -> Tuple[Dict[str, str], int, bool]:
    """In-scope string files in path order, within MAX_FILES and
    MAX_TOTAL_BYTES; oversized files are truncated to MAX_FILE_BYTES.
    Returns (files, skipped count, truncated?)."""
    if not isinstance(files, dict):
        return {}, 0, False
    candidates = sorted(
        (str(path), content) for path, content in files.items()
        if isinstance(content, str) and _language(str(path)) is not None
    )
    selected: Dict[str, str] = {}
    skipped = 0
    truncated = False
    total = 0
    for path, content in candidates:
        if len(selected) >= MAX_FILES:
            skipped += 1
            truncated = True
            continue
        size = len(content.encode("utf-8", "ignore"))
        if size > MAX_FILE_BYTES:
            content = content[:MAX_FILE_BYTES]
            size = MAX_FILE_BYTES
            truncated = True
        if total + size > MAX_TOTAL_BYTES:
            skipped += 1
            truncated = True
            continue
        total += size
        selected[path] = content
    return selected, skipped, truncated


def _python_files(files: Dict[str, str], originals: Any) -> Tuple[Dict[str, str], int]:
    """Python files for bandit: whole files only (a truncated file would not
    parse), at most MAX_BANDIT_FILES. Returns (files, skipped count)."""
    selected: Dict[str, str] = {}
    skipped = 0
    for path, content in files.items():
        if _language(path) != LANG_PY:
            continue
        original = originals.get(path) if isinstance(originals, dict) else None
        if not isinstance(original, str) or len(original.encode("utf-8", "ignore")) > MAX_FILE_BYTES:
            skipped += 1
            continue
        if len(selected) >= MAX_BANDIT_FILES:
            skipped += 1
            continue
        selected[path] = original
    return selected, skipped


async def scan_static_security(files: Any, *, bandit_timeout_s: float = DEFAULT_BANDIT_TIMEOUT_S) -> Dict[str, Any]:
    """Scan generated ``path -> content`` files. Never raises.

    The scan runs in a worker thread, so neither the rules nor bandit block
    the event loop, and it is abandoned (recorded as skipped) if it outlives
    the bandit timeout by more than _OVERALL_GRACE_S.

    Returns::

        {
          "schema_version": 1,
          "report_only": True,
          "status": "completed" | "partial" | "skipped",
          "reason": str | None,          # why the whole scan was skipped
          "scanners": {
            "bandit": {"status": "completed" | "skipped" | "not_applicable",
                       "reason": str | None, "files": int, "parse_errors": int,
                       "files_skipped": int},
            "rules":  {"status": "completed" | "skipped", "reason": str | None,
                       "files": int, "rule_count": int},
          },
          "files_scanned": int,
          "files_skipped": int,
          "counts": {"high": int, "medium": int, "low": int},  # all findings
          "findings": [ {rule_id, severity, confidence, file, line, excerpt,
                         message, source: "bandit" | "rule"}, ... ],
          "truncated": bool,             # a bound was hit
          "duration_ms": int,
        }
    """
    started = time.monotonic()
    try:
        # A shallow copy: the caller may go on to change its dict.
        snapshot = dict(files) if isinstance(files, dict) else {}
        report = await asyncio.wait_for(
            asyncio.to_thread(_scan_sync, snapshot, bandit_timeout_s),
            timeout=bandit_timeout_s + _OVERALL_GRACE_S,
        )
    except asyncio.TimeoutError:
        logger.warning("Static security scan timed out; recorded as skipped.")
        report = skipped_report("static security scan timed out")
    except Exception as exc:  # never let the scanner affect the build
        logger.warning("Static security scan failed; recorded as skipped.", exc_info=True)
        report = skipped_report(f"scanner error ({type(exc).__name__})")
    report["duration_ms"] = int((time.monotonic() - started) * 1000)
    return report


def _scan_sync(files: Dict[str, Any], bandit_timeout_s: float) -> Dict[str, Any]:
    bounded, files_skipped, truncated = _bounded_files(files)
    findings: List[StaticFinding] = []
    scanners: Dict[str, Dict[str, Any]] = {}

    try:
        findings.extend(scan_rules(bounded))
        scanners["rules"] = _scanner_entry(STATUS_COMPLETED, files=len(bounded), rule_count=len(RULES))
    except Exception as exc:
        logger.warning("Static security rules failed; recorded as skipped.", exc_info=True)
        scanners["rules"] = _scanner_entry(
            STATUS_SKIPPED, f"rule engine error ({type(exc).__name__})", files=0, rule_count=len(RULES),
        )

    py_files, py_skipped = _python_files(bounded, files)
    if not py_files:
        scanners["bandit"] = _scanner_entry(
            STATUS_NOT_APPLICABLE, None, files=0, parse_errors=0, files_skipped=py_skipped,
        )
    else:
        try:
            bandit_findings, parse_errors = _run_bandit_sync(py_files, bandit_timeout_s)
            findings.extend(bandit_findings)
            scanners["bandit"] = _scanner_entry(
                STATUS_COMPLETED, None, files=len(py_files), parse_errors=parse_errors, files_skipped=py_skipped,
            )
        except BanditSkipped as exc:
            scanners["bandit"] = _scanner_entry(
                STATUS_SKIPPED, str(exc), files=0, parse_errors=0, files_skipped=py_skipped,
            )
        except Exception as exc:
            logger.warning("bandit scan failed; recorded as skipped.", exc_info=True)
            scanners["bandit"] = _scanner_entry(
                STATUS_SKIPPED, f"bandit error ({type(exc).__name__})", files=0, parse_errors=0,
                files_skipped=py_skipped,
            )

    unique = sorted({(f.source, f.rule_id, f.file, f.line): f for f in findings}.values(), key=_sort_key)
    counts = {s: sum(1 for f in unique if f.severity == s) for s in _SEVERITIES}
    if len(unique) > MAX_FINDINGS:
        unique = unique[:MAX_FINDINGS]
        truncated = True

    ran = [s for s in scanners.values() if s["status"] != STATUS_NOT_APPLICABLE]
    skipped = [s for s in ran if s["status"] == STATUS_SKIPPED]
    if ran and len(skipped) == len(ran):
        status, reason = STATUS_SKIPPED, "; ".join(s["reason"] for s in skipped if s["reason"])
    elif skipped:
        status, reason = STATUS_PARTIAL, None
    else:
        status, reason = STATUS_COMPLETED, None

    report = _empty_report(status, reason)
    report.update({
        "scanners": scanners,
        "files_scanned": len(bounded),
        "files_skipped": files_skipped,
        "counts": counts,
        "findings": [f.to_dict() for f in unique],
        "truncated": truncated,
    })
    return report


# ---------------------------------------------------------------------------
# Build integration (core/orchestrator.py calls these two, nothing else)
# ---------------------------------------------------------------------------


def snapshot_config(settings: Any) -> Optional[Dict[str, Any]]:
    """The Foundation C settings for one build attempt, read once when it
    starts: None when ``static_security_report`` is off (no scan at all)."""
    try:
        if not bool(getattr(settings, "static_security_report", False)):
            return None
        timeout = float(getattr(settings, "static_security_bandit_timeout_s", DEFAULT_BANDIT_TIMEOUT_S))
    except (TypeError, ValueError):
        timeout = DEFAULT_BANDIT_TIMEOUT_S
    return {"bandit_timeout_s": min(max(timeout, 1.0), 120.0)}


async def attach_report(build: Any, validation: Any, files: Any, config: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Orchestrator hook, called once after the final files are known.

    With ``config`` None (flag off) it does nothing. Otherwise it scans
    ``files`` and stores the report on ``build.static_security`` (persisted
    with the build) and in ``validation["static_security"]`` (sent with
    BUILD_COMPLETE). It changes nothing else: no build status, no quality
    verdict, no credits, no provider call. Never raises."""
    if config is None:
        return None
    try:
        report = await scan_static_security(
            files, bandit_timeout_s=float(config.get("bandit_timeout_s", DEFAULT_BANDIT_TIMEOUT_S)),
        )
    except Exception as exc:
        report = skipped_report(f"scanner error ({type(exc).__name__})")
    try:
        build.static_security = report
    except Exception:
        logger.warning("Could not attach the static security report to the build.", exc_info=True)
    if isinstance(validation, dict):
        validation["static_security"] = report
    return report
