"""Redactor for adjudication material (docs/architecture/agent-collaboration-
plan.md §17.3; Revision 2 amended §12.3, PV-3: "seeded secrets never appear
in excerpts").

Everything an adjudicator can read (excerpts, expanded artifacts, finding
messages, blueprint fragments, label notes) is produced through
``redact_text`` / ``redact_structure``. Over-redaction is acceptable;
leaking is not.

Rules, in order (each replaces the match with ``[REDACTED:<rule>]`` and is
counted in the report):

1. Private-key PEM blocks, including a block cut by the excerpt window
   (only a BEGIN or only an END marker). Line count is preserved so excerpt
   line numbers stay true.
2. Moderation's vendor secret rules (``sandbox.moderation._LINE_RULES``,
   category ``secret``: AWS, Stripe, Google, Slack, GitHub ...).
3. JSON Web Tokens.
4. URLs with credentials (any ``scheme://userinfo@``) and secret-named query
   parameters (``?token=``, ``&api_key=`` ...).
5. ``Bearer`` / ``Basic`` authorization values.
6. Environment-variable values: shell/dotenv ``NAME=value`` lines in any
   text; in env-like files (``.env*``, Dockerfiles, compose/YAML, shell,
   ini/toml/properties) every ``NAME = value``, ``ENV NAME value`` and
   upper-case YAML ``NAME: value``; and literal fallbacks or assignments in
   code (``process.env.X || "..."``, ``os.getenv("X", "...")``,
   ``os.environ["X"] = "..."``).
7. The static-security secret checks: moderation's generic secret
   assignment and static-security's secret-named literal masking
   (``sandbox.static_security``).
8. Email addresses.
9. Long token-like runs with both letters and digits (static-security's
   token heuristic).

The report never contains a redacted value: only rule names, counts and the
1-based line numbers (relative to the redacted text) where redactions were
made.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Pattern, Tuple

from sandbox.moderation import _LINE_RULES as _MODERATION_LINE_RULES
from sandbox.moderation import _SECRET_ASSIGN_RE
from sandbox.static_security import (
    _MASK_NAMED_LITERAL_RE,
    _MASK_TOKEN_LIKE_RE,
    _SECRET_NAME_HINT_RE,
    _secret_rule_id,
)

REDACTOR_VERSION = 1
_PREFIX = "[REDACTED:"

# --------------------------------------------------------------------------- #
# Patterns
# --------------------------------------------------------------------------- #

_PEM_BLOCK_RE = re.compile(
    r"-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----.*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----",
    re.DOTALL,
)
_PEM_BEGIN_TO_END_OF_TEXT_RE = re.compile(r"-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----.*\Z", re.DOTALL)
_PEM_START_OF_TEXT_TO_END_RE = re.compile(r"\A.*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----", re.DOTALL)

_VENDOR_RULES: Tuple[Tuple[str, Pattern[str]], ...] = tuple(
    (_secret_rule_id(message), pattern)
    for category, _sev, pattern, message in _MODERATION_LINE_RULES
    if category == "secret"
)

_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_\-]{5,}\.eyJ[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}")
_URL_USERINFO_RE = re.compile(r"(?P<scheme>\b[A-Za-z][A-Za-z0-9+.\-]*://)(?P<userinfo>[^\s/@\"'`<>]+)@")
_URL_SECRET_PARAM_RE = re.compile(
    r"(?i)(?P<key>[?&](?:access_token|refresh_token|id_token|token|api_key|apikey|key|secret|client_secret|"
    r"password|passwd|pwd|auth|sig|signature|x-amz-signature|x-amz-credential|code)=)(?P<value>[^&\s\"'#<>`]+)"
)
_AUTH_HEADER_RE = re.compile(r"(?i)\b(?P<scheme>bearer|basic)(?P<sep>\s+)(?P<value>[A-Za-z0-9\-._~+/]{8,}=*)")

# Shell / dotenv assignment: NAME=value with no space before '=' (shell
# syntax), optionally exported. Safe to apply to any text.
_SHELL_ENV_RE = re.compile(
    r"(?m)^(?P<lead>[ \t]*(?:export[ \t]+|-[ \t]+)?[\"']?[A-Z][A-Z0-9_]*[\"']?=)(?P<value>[^\n]*\S)"
)
# Env-like files: also NAME = value, ENV/ARG NAME value, and YAML NAME: value.
_ENV_FILE_ASSIGN_RE = re.compile(
    r"(?m)^(?P<lead>[ \t]*(?:export[ \t]+|-[ \t]+|(?:ENV|ARG)[ \t]+)?[\"']?[A-Za-z_][A-Za-z0-9_.\-]*[\"']?"
    r"[ \t]*=[ \t]*)(?P<value>[^\n]*\S)"
)
_DOCKER_ENV_RE = re.compile(r"(?m)^(?P<lead>[ \t]*(?:ENV|ARG)[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]+)(?P<value>[^=\n][^\n]*\S)")
_YAML_ENV_RE = re.compile(r"(?m)^(?P<lead>[ \t]*-?[ \t]*[A-Z][A-Z0-9_]{1,}[ \t]*:[ \t]*)(?P<value>[^\s#][^\n]*?)[ \t]*$")
# Code: literal fallbacks/assignments for environment variables.
_CODE_ENV_FALLBACK_RE = re.compile(
    r"(?P<lead>(?:process\.env|import\.meta\.env)(?:\.[A-Za-z_$][\w$]*|\[[\"'`][^\"'`\]]+[\"'`]\])"
    r"\s*(?:\|\||\?\?|=(?!=))\s*)(?P<q>[\"'`])(?P<value>[^\"'`\n]*)(?P=q)"
)
_CODE_ENV_GET_RE = re.compile(
    r"(?P<lead>\b(?:os\.environ\.get|os\.getenv|environ\.get|getenv|env)\(\s*[\"'][^\"'\n]+[\"']\s*,\s*"
    r"(?:default\s*=\s*)?)(?P<q>[\"'])(?P<value>[^\"'\n]*)(?P=q)"
)
_CODE_ENV_SET_RE = re.compile(
    r"(?P<lead>\bos\.environ\[\s*[\"'][^\"'\n]+[\"']\s*\]\s*=\s*)(?P<q>[\"'])(?P<value>[^\"'\n]*)(?P=q)"
)

_EMAIL_RE = re.compile(r"(?<![A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}\b")

_ENV_LIKE_NAME_RE = re.compile(
    r"(?i)(?:^|/)(?:\.env(?:\.[^/]*)?|[^/]*\.env|dockerfile(?:\.[^/]*)?|[^/]*\.dockerfile|"
    r"docker-compose[^/]*|compose\.ya?ml|procfile|[^/]*\.(?:ya?ml|sh|bash|zsh|ini|cfg|conf|toml|properties|envrc))$"
)


def is_env_like_path(path: Optional[str]) -> bool:
    return bool(path) and bool(_ENV_LIKE_NAME_RE.search(path))


# --------------------------------------------------------------------------- #
# Engine
# --------------------------------------------------------------------------- #


def _token(rule: str) -> str:
    return f"{_PREFIX}{rule}]"


@dataclass
class RedactionResult:
    text: str
    report: Dict[str, Any] = field(default_factory=dict)

    @property
    def total(self) -> int:
        return int(self.report.get("total", 0))


class _Tracker:
    def __init__(self) -> None:
        self.counts: Dict[str, int] = {}
        self.lines: Dict[str, List[int]] = {}

    def hit(self, rule: str, text: str, pos: int) -> None:
        self.counts[rule] = self.counts.get(rule, 0) + 1
        line = text.count("\n", 0, pos) + 1
        bucket = self.lines.setdefault(rule, [])
        if line not in bucket and len(bucket) < 200:
            bucket.append(line)

    def report(self) -> Dict[str, Any]:
        return {
            "redactor_version": REDACTOR_VERSION,
            "total": sum(self.counts.values()),
            "counts": dict(sorted(self.counts.items())),
            "lines": {k: sorted(v) for k, v in sorted(self.lines.items())},
        }


def _keep_newlines(rule: str, matched: str) -> str:
    """A replacement with the same number of lines as ``matched``."""
    return "\n".join(_token(rule) for _ in range(matched.count("\n") + 1))


def _sub(text: str, pattern: Pattern[str], rule: str, tracker: _Tracker,
         replace: Callable[["re.Match[str]"], Optional[str]]) -> str:
    """Substitute with a callback that returns the replacement, or None to
    keep the match. Counted only when something is replaced."""
    out: List[str] = []
    last = 0
    for m in pattern.finditer(text):
        repl = replace(m)
        if repl is None or repl == m.group(0):
            continue
        out.append(text[last:m.start()])
        out.append(repl)
        tracker.hit(rule, text, m.start())
        last = m.end()
    if not out:
        return text
    out.append(text[last:])
    return "".join(out)


def _value_rule(rule: str):
    """Replace the ``value`` group (keeping ``lead`` and quotes)."""

    def replace(m: "re.Match[str]") -> Optional[str]:
        value = m.group("value")
        if not value or value.startswith(_PREFIX):
            return None
        start, end = m.span("value")
        base = m.start()
        whole = m.group(0)
        return whole[: start - base] + _token(rule) + whole[end - base:]

    return replace


def _auth_header(m: "re.Match[str]") -> Optional[str]:
    value = m.group("value")
    if value.startswith(_PREFIX):
        return None
    # "basic" is also an English word: require something credential-shaped.
    if m.group("scheme").lower() == "basic" and not (
        len(value) >= 20 or any(c.isdigit() or c in "=+/" for c in value)
    ):
        return None
    return m.group("scheme") + m.group("sep") + _token("auth-header")


def _named_literal(m: "re.Match[str]") -> Optional[str]:
    if not _SECRET_NAME_HINT_RE.search(m.group(1)) or m.group(3).startswith(_PREFIX):
        return None
    return m.group(1) + m.group(2) + _token("secret-literal") + m.group(4)


def _generic_assign(m: "re.Match[str]") -> Optional[str]:
    value = m.group(2)
    if value.startswith(_PREFIX):
        return None
    start, end = m.span(2)
    whole = m.group(0)
    return whole[: start - m.start()] + _token("secret-assignment") + whole[end - m.start():]


def _token_like(m: "re.Match[str]") -> Optional[str]:
    value = m.group(0)
    if any(c.isdigit() for c in value) and any(c.isalpha() for c in value):
        return _token("token")
    return None


def redact_text(text: Optional[str], *, path: Optional[str] = None) -> RedactionResult:
    """Redact ``text``. ``path`` (the file the text comes from, if any)
    enables the env-file rules. Line count is preserved."""
    if not text:
        return RedactionResult(text="" if text is None else text, report=_Tracker().report())
    t = _Tracker()
    s = str(text)

    # 1. Private keys: whole blocks, then a block cut by the window.
    s = _sub(s, _PEM_BLOCK_RE, "private-key", t, lambda m: _keep_newlines("private-key", m.group(0)))
    s = _sub(s, _PEM_START_OF_TEXT_TO_END_RE, "private-key", t, lambda m: _keep_newlines("private-key", m.group(0)))
    s = _sub(s, _PEM_BEGIN_TO_END_OF_TEXT_RE, "private-key", t, lambda m: _keep_newlines("private-key", m.group(0)))
    # 2. Moderation's vendor secret rules.
    for rule, pattern in _VENDOR_RULES:
        s = _sub(s, pattern, rule, t, lambda m, rule=rule: _token(rule))
    # 3. JWTs.
    s = _sub(s, _JWT_RE, "jwt", t, lambda m: _token("jwt"))
    # 4. URL credentials and secret query parameters.
    s = _sub(s, _URL_USERINFO_RE, "url-credentials", t,
             lambda m: None if m.group("userinfo").startswith(_PREFIX)
             else m.group("scheme") + _token("url-credentials") + "@")
    s = _sub(s, _URL_SECRET_PARAM_RE, "url-secret-param", t, _value_rule("url-secret-param"))
    # 5. Authorization header values.
    s = _sub(s, _AUTH_HEADER_RE, "auth-header", t, _auth_header)
    # 6. Environment-variable values.
    if is_env_like_path(path):
        s = _sub(s, _ENV_FILE_ASSIGN_RE, "env-value", t, _value_rule("env-value"))
        s = _sub(s, _DOCKER_ENV_RE, "env-value", t, _value_rule("env-value"))
        s = _sub(s, _YAML_ENV_RE, "env-value", t, _value_rule("env-value"))
    else:
        s = _sub(s, _SHELL_ENV_RE, "env-value", t, _value_rule("env-value"))
    for pattern in (_CODE_ENV_FALLBACK_RE, _CODE_ENV_GET_RE, _CODE_ENV_SET_RE):
        s = _sub(s, pattern, "env-value", t, _value_rule("env-value"))
    # 7. Static-security secret checks.
    s = _sub(s, _SECRET_ASSIGN_RE, "secret-assignment", t, _generic_assign)
    s = _sub(s, _MASK_NAMED_LITERAL_RE, "secret-literal", t, _named_literal)
    # 8. Emails.
    s = _sub(s, _EMAIL_RE, "email", t, lambda m: _token("email"))
    # 9. Token-like runs.
    s = _sub(s, _MASK_TOKEN_LIKE_RE, "token", t, _token_like)
    return RedactionResult(text=s, report=t.report())


def merge_reports(reports: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Combine per-field reports into one ``redaction_report``."""
    counts: Dict[str, int] = {}
    for rep in reports.values():
        for rule, n in (rep.get("counts") or {}).items():
            counts[rule] = counts.get(rule, 0) + int(n)
    return {
        "redactor_version": REDACTOR_VERSION,
        "total": sum(counts.values()),
        "counts": dict(sorted(counts.items())),
        "fields": {name: rep for name, rep in reports.items()},
    }


def redact_structure(value: Any, *, path: Optional[str] = None, _tracker: Optional[Dict[str, int]] = None) -> Tuple[Any, Dict[str, Any]]:
    """Redact every string (keys included) in a JSON-like structure.
    Returns ``(redacted, report)``."""
    counts: Dict[str, int] = {} if _tracker is None else _tracker

    def walk(v: Any) -> Any:
        if isinstance(v, str):
            r = redact_text(v, path=path)
            for rule, n in r.report["counts"].items():
                counts[rule] = counts.get(rule, 0) + n
            return r.text
        if isinstance(v, dict):
            return {walk(str(k)): walk(x) for k, x in v.items()}
        if isinstance(v, (list, tuple)):
            return [walk(x) for x in v]
        return v

    redacted = walk(value)
    return redacted, {
        "redactor_version": REDACTOR_VERSION,
        "total": sum(counts.values()),
        "counts": dict(sorted(counts.items())),
    }
