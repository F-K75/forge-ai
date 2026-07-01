"""
Test suite for encryption/decryption flows
"""
import pytest
from datetime import datetime
from core.encryption import encrypt_field, decrypt_field, mask_token
from core.security import sanitize_string, validate_password_strength, generate_csrf_token, sanitize_prompt


class TestEncryption:
    """Test field encryption and decryption"""

    async def test_encrypt_decrypt_github_token(self):
        """Test GitHub token encryption/decryption"""
        original_token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
        
        encrypted = encrypt_field(original_token)
        
        # Verify it's encrypted (should not match original)
        assert encrypted != original_token
        assert encrypted.startswith("gAAAAA")  # Fernet prefix
        
        # Decrypt and verify
        decrypted = decrypt_field(encrypted)
        assert decrypted == original_token

    async def test_encrypt_empty_string(self):
        """Test encryption of empty string"""
        assert encrypt_field("") == ""
        assert encrypt_field(None) is None

    async def test_encrypt_special_characters(self):
        """Test encryption with special characters"""
        special_token = "ghp_!@#$%^&*()_+-=[]{}|;:,.<>?"
        
        encrypted = encrypt_field(special_token)
        decrypted = decrypt_field(encrypted)
        
        assert decrypted == special_token

    async def test_encrypt_long_token(self):
        """Test encryption of long tokens"""
        long_token = "x" * 1000
        
        encrypted = encrypt_field(long_token)
        decrypted = decrypt_field(encrypted)
        
        assert decrypted == long_token

    async def test_decrypt_invalid_token(self):
        """Test decryption of invalid token"""
        invalid_token = "not_a_valid_encrypted_token"
        
        # Should return as-is if decryption fails
        result = decrypt_field(invalid_token)
        assert result == invalid_token


class TestTokenMasking:
    """Test token masking for logging"""

    async def test_mask_short_token(self):
        """Test masking of short token"""
        short_token = "abc123"
        masked = mask_token(short_token)
        assert masked == "****"

    async def test_mask_normal_token(self):
        """Test masking of normal token"""
        token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
        masked = mask_token(token)
        
        assert masked.startswith("ghp_1234")
        assert masked.endswith("wxyz")
        assert "..." in masked

    async def test_mask_none_token(self):
        """Test masking of None"""
        assert mask_token(None) == "****"
        assert mask_token("") == "****"


class TestInputSanitization:
    """Test input sanitization"""

    async def test_sanitize_normal_string(self):
        """Test sanitization of normal string"""
        result = sanitize_string("Hello World")
        assert result == "Hello\\ World"

    async def test_sanitize_null_bytes(self):
        """Test removal of null bytes"""
        result = sanitize_string("Hello\x00World\x00")
        assert result == "HelloWorld"

    async def test_sanitize_length_limit(self):
        """Test length limiting"""
        long_string = "a" * 2000
        result = sanitize_string(long_string, max_length=100)
        assert len(result) == 100

    async def test_sanitize_regex_chars(self):
        """Test regex character escaping"""
        result = sanitize_string("test[regex]special", max_length=50)
        # Should escape regex special characters
        assert "\\[" in result or "[" not in result


class TestPromptSanitization:
    """Test prompt sanitization for LLM injection prevention"""

    async def test_sanitize_normal_prompt(self):
        """Test sanitization of normal prompt"""
        result = sanitize_prompt("Build a todo app with React and Firebase")
        assert result == "Build a todo app with React and Firebase"

    async def test_sanitize_null_bytes(self):
        """Test removal of null bytes"""
        result = sanitize_prompt("Build a\x00todo\x00app")
        assert result == "Build atodoapp"

    async def test_sanitize_control_chars(self):
        """Test removal of control characters"""
        result = sanitize_prompt("Build\u0000\u0001\u0002app")
        assert "\x00" not in result
        assert "\x01" not in result

    async def test_sanitize_length_limit(self):
        """Test length limiting"""
        long_string = "a" * 100000
        result = sanitize_prompt(long_string, max_length=50000)
        assert len(result) == 50000


class TestPasswordValidation:
    """Test password strength validation"""

    async def test_valid_password(self):
        """Test valid password"""
        valid, msg = validate_password_strength("SecurePass123!")
        assert valid is True
        assert msg == ""

    async def test_too_short(self):
        """Test password too short"""
        valid, msg = validate_password_strength("Short1!")
        assert valid is False
        assert "12 characters" in msg

    async def test_missing_uppercase(self):
        """Test missing uppercase letter"""
        valid, msg = validate_password_strength("lowercase123!")
        assert valid is False
        assert "uppercase" in msg.lower()

    async def test_missing_lowercase(self):
        """Test missing lowercase letter"""
        valid, msg = validate_password_strength("UPPERCASE123!")
        assert valid is False
        assert "lowercase" in msg.lower()

    async def test_missing_number(self):
        """Test missing number"""
        valid, msg = validate_password_strength("NoNumber!ButLong")
        assert valid is False
        assert "number" in msg.lower()

    async def test_missing_special_char(self):
        """Test missing special character"""
        valid, msg = validate_password_strength("NoSpecial123")
        assert valid is False
        assert "special" in msg.lower()

    async def test_complex_valid_password(self):
        """Test complex valid password"""
        valid, msg = validate_password_strength("MyStr0ng!Pass#2024")
        assert valid is True
        assert msg == ""


class TestCSRFToken:
    """Test CSRF token generation"""

    async def test_generate_csrf_token(self):
        """Test CSRF token generation"""
        token1 = generate_csrf_token()
        token2 = generate_csrf_token()
        
        # Tokens should be different
        assert token1 != token2
        
        # Tokens should be 43 characters (32 bytes base64 encoded)
        assert len(token1) == 43
        assert len(token2) == 43

    async def test_csrf_token_format(self):
        """Test CSRF token is URL-safe"""
        token = generate_csrf_token()
        
        # Should only contain URL-safe characters
        import re
        assert re.match(r'^[A-Za-z0-9_-]+$', token)


# Performance tests
class TestEncryptionPerformance:
    """Test encryption performance"""

    async def test_encryption_speed(self):
        """Test encryption is fast enough for production"""
        import time
        
        token = "ghp_" + "x" * 100
        
        start = time.time()
        for _ in range(1000):
            encrypted = encrypt_field(token)
            decrypted = decrypt_field(encrypted)
        elapsed = time.time() - start
        
        # Should complete 1000 encryptions in < 1 second
        assert elapsed < 1.0
        assert decrypted == token


if __name__ == "__main__":
    pytest.main([__file__, "-v"])