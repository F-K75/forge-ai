"""Pytest configuration: set required env vars before any test module imports.

Without this file, every test file that imports ``core.database`` (directly or
transitively) crashes at collection time because ``Settings()`` validates
``MONGODB_URL`` and ``JWT_SECRET`` at module-import time and rejects empty
values outside ``CI_TEST_MODE``.

The env vars set here match the guards in ``core/config.py``:

- ``CI_TEST_MODE`` — allows ``mongodb_url`` to be empty (falls back to
  ``mongodb://localhost:27017/forge``).
- ``TESTING`` — allows ``jwt_secret`` to be empty (falls back to a test-only
  dummy value).
- ``MONGODB_URL`` — explicit test DB URL so tests don't depend on a local
  MongoDB being present (tests that need a real DB use ``mongomock`` or
  ``pytest-mongo``).
- ``JWT_SECRET`` — explicit test secret so JWT encoding/decoding tests work
  without relying on the fallback path.
- ``FIELD_ENCRYPTION_KEY`` — 64 hex chars for the encryption module.
- ``APP_ENV`` — set to ``development`` so production-only validators
  (replicaSet requirement, localhost guard) don't fire.
"""

import os

# Must be set before ANY module that imports core.config is loaded.
os.environ.setdefault("CI_TEST_MODE", "1")
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/forge-test")
os.environ.setdefault(
    "JWT_SECRET",
    "test-secret-key-for-ci-purposes-only-32chars",
)
os.environ.setdefault(
    "FIELD_ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
)