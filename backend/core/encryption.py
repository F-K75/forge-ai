from cryptography.fernet import Fernet
from core.config import get_settings
import base64
import logging

logger = logging.getLogger(__name__)

settings = get_settings()


def normalize_fernet_key(value: str) -> bytes:
    """Return a Fernet-compatible key from either supported setting format."""
    try:
        raw_key = bytes.fromhex(value)
    except ValueError:
        raw_key = b""

    if len(raw_key) == 32:
        return base64.urlsafe_b64encode(raw_key)

    try:
        decoded = base64.urlsafe_b64decode(value.encode())
    except (ValueError, TypeError) as exc:
        raise ValueError("Invalid FIELD_ENCRYPTION_KEY") from exc
    if len(decoded) != 32:
        raise ValueError("FIELD_ENCRYPTION_KEY must decode to 32 bytes")
    return value.encode()


# Use a dedicated key instead of deriving one from JWT_SECRET. Both formats
# accepted by Settings are normalized here to Fernet's URL-safe base64 form.
_key = normalize_fernet_key(settings.field_encryption_key)
cipher = Fernet(_key)
logger.info("Encryption initialized with dedicated FIELD_ENCRYPTION_KEY")


def encrypt_field(value: str) -> str:
    """Encrypt a sensitive field value."""
    if not value:
        return value
    return cipher.encrypt(value.encode()).decode()


def decrypt_field(encrypted_value: str) -> str:
    """Decrypt a sensitive field value."""
    if not encrypted_value:
        return encrypted_value
    try:
        return cipher.decrypt(encrypted_value.encode()).decode()
    except Exception:
        return encrypted_value  # Return as-is if decryption fails


def mask_token(token: str, visible_chars: int = 8) -> str:
    """Mask a token for logging/display purposes."""
    if not token or len(token) <= visible_chars:
        return "****"
    return f"{token[:visible_chars]}...{token[-4:]}"
