"""Secret masking and redaction on streamed WebSocket build logs.

 intercepts log lines emitted by the build pipeline and redacts
 any strings that match known secret patterns (Stripe keys, MongoDB
 connection strings, JWT secrets, etc.) before they are sent to
 the connected client over WebSocket.

 The redaction replaces the secret value with ``<REDACTED>`` while
 preserving the surrounding text so that the log remains readable.
"""

import logging
import re
from typing import List, Tuple

logger = logging.getLogger(__name__)

# Patterns copied from the pre-commit secret scanner so that the
# log streamer and the scanner stay in sync.  Each entry is a
# (compiled_regex, replacement) pair.
_SECRET_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"sk_live_[a-zA-Z0-9]{10,}"), "sk_live_<REDACTED>"),
    (re.compile(r"sk_test_[a-zA-Z0-9]{10,}"), "sk_test_<REDACTED>"),
    (re.compile(r"pk_live_[a-zA-Z0-9]{10,}"), "pk_live_<REDACTED>"),
    (re.compile(r"pk_test_[a-zA-Z0-9]{10,}"), "pk_test_<REDACTED>"),
    (re.compile(r"whsec_[a-zA-Z0-9]{10,}"), "whsec_<REDACTED>"),
    (re.compile(r"mongodb://[^\s]+:[^\s]+@"), "mongodb://<REDACTED>@"),
    (re.compile(r"mongodb\+srv://[^\s]+:[^\s]+@"), "mongodb+srv://<REDACTED>@"),
    (re.compile(r"redis://:[^\s]+@"), "redis://:<REDACTED>@"),
    (re.compile(r"[Pp]assword\s*=\s*[^\s\"]{6,}"), "Password=<REDACTED>"),
    (re.compile(r"[Ss]ecret\s*=\s*[^\s\"]{6,}"), "Secret=<REDACTED>"),
    (re.compile(r"[Aa][Pp][Ii]_KEY\s*=\s*[^\s\"]{6,}"), "API_KEY=<REDACTED>"),
]

# Fallback: any remaining token-like strings that look like credentials
# but didn't match a specific pattern above.
_FALLBACK_PATTERN = re.compile(r"\b(secret|token|key|password|passwd|apikey|api_key)\s*[:=]\s*(\S+)")


def redact_secrets(text: str) -> str:
    """Redact known secret patterns from a log line.

    Applies each compiled regex pattern in order, replacing matches
    with their corresponding redaction placeholder.  After all
    specific patterns are applied a fallback pass catches any
    remaining ``key=value`` or ``key: value`` pairs that look like
    credentials.

    Args:
        text: A single line of build log output.

    Returns:
        The line with secrets replaced by ``<REDACTED>`` placeholders.
    """
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)

    # Fallback pass for anything that looks like a credential assignment.
    text = _FALLBACK_PATTERN.sub(r"\1=<REDACTED>", text)

    return text


async def stream_logs_with_redaction(
    log_source: str,
    emit,
) -> None:
    """Read log lines from a source and emit them with secrets redacted.

    This is a helper that wraps an async log source (e.g. a subprocess
    stdout reader) so that every line is redacted before being sent
    over the WebSocket.

    Args:
        log_source: An async iterable of log lines (strings).
        emit: Async callable that sends WSEvent to connected clients.
    """
    async for line in log_source:
        redacted = redact_secrets(line)
        await emit(redacted)