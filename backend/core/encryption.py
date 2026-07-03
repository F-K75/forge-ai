from cryptography.fernet import Fernet
from core.config import get_settings
import base64
import logging

logger = logging.getLogger(__name__)

settings = get_settings()

# Use dedicated FIELD_ENCRYPTION_KEY (64 hex chars = 32 bytes) instead of
# deriving from JWT_SECRET. This ensures that a JWT secret leak does not
# compromise encrypted fields (github_tokens, etc.).
_key_bytes = bytes.fromhex(settings.field_encryption_key)
_key = base64.urlsafe_b64encode(_key_bytes)
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