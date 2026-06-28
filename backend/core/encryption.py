from cryptography.fernet import Fernet
from core.config import get_settings
import base64
import hashlib

settings = get_settings()

# In production, store this key in a vault (AWS Secrets Manager, HashiCorp Vault)
# For now, derive from JWT_SECRET (not ideal but better than plaintext)
_key = base64.urlsafe_b64encode(
    hashlib.sha256(settings.jwt_secret.encode()).digest()
)
cipher = Fernet(_key)


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