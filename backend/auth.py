from datetime import timedelta
from core.models import utcnow
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from core.config import get_settings
import uuid

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
    token_type: str = "access",
) -> str:
    to_encode = data.copy()
    expire = utcnow() + (expires_delta or timedelta(minutes=settings.jwt_expire_minutes))
    to_encode.update({
        "exp": expire,
        "type": token_type,
        "jti": str(uuid.uuid4()),  # Unique token ID for blacklisting
    })
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = utcnow() + timedelta(days=30)
    to_encode.update({
        "exp": expire,
        "type": "refresh",
        "jti": str(uuid.uuid4()),  # Unique token ID for blacklisting
    })
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Optional[dict]:
    try:
        # The `algorithms` parameter enforces that the token's `alg` header
        # matches one of the expected algorithms. This prevents `alg: "none"`
        # attacks because "none" is not in the allowed list.
        # `verify_exp` ensures expired tokens are rejected.
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={
                "verify_signature": True,
                "verify_exp": True,
            },
        )
    except JWTError:
        return None
