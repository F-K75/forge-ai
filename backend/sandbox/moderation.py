from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, Any, List, Tuple

# Severity levels for a moderation finding.
SEVERITY_BLOCK = "block"  # Should be remediated before the app is considered valid.
SEVERITY_WARN = "warn"  # Surfaced to the user; does not block the build.

# Hints that a string literal is a placeholder rather than a real secret. Used
# to keep the generic "secret variable assignment" rule from flagging obvious
# stand-ins (e.g. `api_key = "YOUR_KEY_HERE"`).
_PLACEHOLDER_HINTS = (
    "your", "example", "changeme", "change_me", "placeholder", "xxxx",
    "todo", "insert", "replace", "here", "dummy", "test", "sample",
    "api_key_here", "key_here", "token_here", "secret_here", "fixme",
)

# Per-file scan cap. Generated apps are small; capping avoids pathological cost
# on a single huge generated blob while still covering realistic code.
_MAX_SCAN_BYTES = 200_000


def _is_placeholder(value: str) -> bool:
    lowered = value.lower()
    # A literal containing a clear placeholder token is not a real secret.
    if any(hint in lowered for hint in _PLACEHOLDER_HINTS):
        return True
    # A short literal is almost certainly not a high-entropy secret.
    if len(value) < 16:
        return True
    return False


@dataclass
class Finding:
    category: str
    severity: str
    file: str
    line: int
    snippet: str
    message: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": self.category,
            "severity": self.severity,
            "file": self.file,
            "line": self.line,
            "snippet": self.snippet,
            "message": self.message,
        }


@dataclass
class ModerationReport:
    findings: List[Finding] = field(default_factory=list)

    @property
    def has_blocking(self) -> bool:
        return any(f.severity == SEVERITY_BLOCK for f in self.findings)

    def blocking_lines(self) -> List[str]:
        """Render blocking findings as sandbox-error lines so the existing
        PM debug loop attempts to remediate them (remove the leaked secret,
        replace the destructive command, etc.)."""
        lines = []
        for f in self.findings:
            if f.severity == SEVERITY_BLOCK:
                lines.append(
                    f"[moderation:{f.category}] {f.file}:{f.line} — {f.message}"
                )
        return lines

    def to_dict(self) -> Dict[str, Any]:
        return {
            "blocking": self.has_blocking,
            "counts": {
                SEVERITY_BLOCK: sum(1 for f in self.findings if f.severity == SEVERITY_BLOCK),
                SEVERITY_WARN: sum(1 for f in self.findings if f.severity == SEVERITY_WARN),
            },
            "findings": [f.to_dict() for f in self.findings],
        }


# (category, severity, regex, message). Line-based rules are matched per file
# with MULTILINE so we can report the offending line number.
_LINE_RULES: List[Tuple[str, str, "re.Pattern[str]", str]] = [
    # --- Hardcoded secrets (blocking) ---
    ("secret", SEVERITY_BLOCK, re.compile(r"AKIA[0-9A-Z]{16}"),
     "Hardcoded AWS Access Key ID detected"),
    ("secret", SEVERITY_BLOCK,
     re.compile(r"(?:aws_secret_access_key|aws_secret_key)\s*[:=]\s*[\"'][A-Za-z0-9/+]{40}[\"']"),
     "Hardcoded AWS secret access key detected"),
    ("secret", SEVERITY_BLOCK, re.compile(r"sk_live_[0-9a-zA-Z]{16,}"),
     "Hardcoded Stripe live secret key detected"),
    ("secret", SEVERITY_BLOCK, re.compile(r"rk_live_[0-9a-zA-Z]{16,}"),
     "Hardcoded Stripe restricted key detected"),
    ("secret", SEVERITY_BLOCK, re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
     "Hardcoded Google API key detected"),
    ("secret", SEVERITY_BLOCK, re.compile(r"xox[baprs]-[0-9A-Za-z\-]{10,}"),
     "Hardcoded Slack token detected"),
    ("secret", SEVERITY_BLOCK,
     re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}\b"),
     "Hardcoded GitHub personal access token detected"),
    ("secret", SEVERITY_BLOCK, re.compile(r"github_pat_[0-9A-Za-z_]{20,}"),
     "Hardcoded GitHub fine-grained PAT detected"),
    # --- Catastrophic destructive operations (blocking) ---
    ("destructive", SEVERITY_BLOCK,
     re.compile(r"rm\s+-rf\s+[\"']?(?:/|\*|\~|/\*)"),
     "Destructive 'rm -rf' targeting filesystem root/home detected"),
    ("destructive", SEVERITY_BLOCK,
     re.compile(r"shutil\.rmtree\(\s*[\"'](?:/|/[\*\s]|\~)[\"']"),
     "shutil.rmtree targeting filesystem root/home detected"),
    ("destructive", SEVERITY_BLOCK, re.compile(r"os\.remove\(\s*[\"']/[\"']"),
     "os.remove targeting filesystem root detected"),
    ("destructive", SEVERITY_BLOCK,
     re.compile(r":\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:"),
     "Bash fork bomb detected"),
    ("destructive", SEVERITY_BLOCK, re.compile(r"dd\s+if=.*of=/dev/(?:sd|hd|nvme|vda)"),
     "Raw 'dd' overwrite of a disk device detected"),
    ("destructive", SEVERITY_BLOCK,
     re.compile(r"os\.system\(\s*[\"'](?:shutdown|halt|reboot|poweroff)"),
     "os.system invoking a power/shutdown command detected"),
    # --- Supply-chain / dynamic-execution risks (warning) ---
    ("supply_chain", SEVERITY_WARN,
     re.compile(r"(?:curl|wget)[^\n|]*\|\s*(?:ba)?sh\b"),
     "Piping a downloaded script straight to a shell is a supply-chain risk"),
    ("dynamic_execution", SEVERITY_WARN, re.compile(r"\beval\("),
     "Use of eval() enables dynamic code execution"),
    ("dynamic_execution", SEVERITY_WARN, re.compile(r"\bexec\("),
     "Use of exec() enables dynamic code execution"),
]

# Generic high-entropy assignment to a secret-looking variable name. Warned
# (not blocked) and placeholder-filtered to avoid false positives.
_SECRET_ASSIGN_RE = re.compile(
    r"(api_key|apikey|api_secret|secret_key|client_secret|private_key|"
    r"access_token|auth_token|password|passwd|secret)\s*[:=]\s*[\"']([^\s\"'<>\n]{16,})[\"']"
)

# Private-key PEM blocks can span lines; match the BEGIN marker (multiline).
_PRIVATE_KEY_RE = re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----")


def _line_of(content: str, pos: int) -> int:
    return content.count("\n", 0, pos) + 1


def _snippet_at(content: str, pos: int, length: int = 160) -> str:
    line_start = content.rfind("\n", 0, pos) + 1
    line_end = content.find("\n", pos)
    if line_end == -1:
        line_end = len(content)
    snippet = content[line_start:line_end].strip()
    if len(snippet) > length:
        snippet = snippet[:length] + "..."
    return snippet


def _scan_text(file_path: str, content: str, findings: List[Finding]) -> None:
    for category, severity, pattern, message in _LINE_RULES:
        for match in pattern.finditer(content):
            findings.append(Finding(
                category=category,
                severity=severity,
                file=file_path,
                line=_line_of(content, match.start()),
                snippet=_snippet_at(content, match.start()),
                message=message,
            ))

    # Private-key PEM header (multiline-safe via scanning the whole content).
    for match in _PRIVATE_KEY_RE.finditer(content):
        findings.append(Finding(
            category="secret",
            severity=SEVERITY_BLOCK,
            file=file_path,
            line=_line_of(content, match.start()),
            snippet=_snippet_at(content, match.start()),
            message="Private key material detected in source",
        ))

    # Generic secret assignment (warn; placeholder-filtered).
    for match in _SECRET_ASSIGN_RE.finditer(content):
        value = match.group(2)
        if _is_placeholder(value):
            continue
        findings.append(Finding(
            category="secret",
            severity=SEVERITY_WARN,
            file=file_path,
            line=_line_of(content, match.start()),
            snippet=_snippet_at(content, match.start()),
            message="High-entropy value assigned to a secret-named variable",
        ))


async def scan_code(files: Dict[str, Any]) -> ModerationReport:
    """Scan generated application files for secrets and unsafe operations.

    Deterministic (no LLM call) so it adds no latency or cost to the build
    pipeline. It is a backstop, not a complete guarantee: pattern-based
    detection cannot catch every obfuscation. Blocking findings are folded
    into the build's sandbox errors so the PM debug loop can remediate them;
    warning findings are surfaced in the build report.

    Accepts the same `path -> content` mapping the sandbox runner uses.
    Non-string or oversized entries are skipped.
    """
    findings: List[Finding] = []
    if not isinstance(files, dict):
        return ModerationReport(findings=findings)

    for path, content in files.items():
        if not isinstance(content, str):
            continue
        if len(content.encode("utf-8", "ignore")) > _MAX_SCAN_BYTES:
            content = content[:_MAX_SCAN_BYTES]
        _scan_text(path, content, findings)

    return ModerationReport(findings=findings)
