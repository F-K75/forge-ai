"""Tests for deployment_service.py — dynamic DB isolation."""

import os
import pytest

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/forge-test")

from app.services.deployment_service import (
    get_deployed_db_name,
    get_deployed_db_url,
    _validate_deploy_id,
)


class TestValidateDeployId:
    def test_valid_id_passes(self):
        assert _validate_deploy_id("abc123") == "abc123"

    def test_id_with_hyphens_and_underscores_passes(self):
        assert _validate_deploy_id("my-deploy_01") == "my-deploy_01"

    def test_empty_id_raises(self):
        with pytest.raises(ValueError, match="deploy_id is required"):
            _validate_deploy_id("")

    def test_id_with_slash_raises(self):
        with pytest.raises(ValueError, match="Invalid deploy_id"):
            _validate_deploy_id("abc/123")

    def test_id_with_space_raises(self):
        with pytest.raises(ValueError, match="Invalid deploy_id"):
            _validate_deploy_id("abc 123")

    def test_id_with_dot_raises(self):
        with pytest.raises(ValueError, match="Invalid deploy_id"):
            _validate_deploy_id("abc.123")


class TestGetDeployedDbName:
    def test_returns_app_prefixed_name(self):
        assert get_deployed_db_name("abc123") == "app_abc123"

    def test_returns_app_prefixed_name_with_hyphen(self):
        assert get_deployed_db_name("my-deploy") == "app_my-deploy"


class TestGetDeployedDbUrl:
    def test_replaces_db_name_in_mongodb_url(self):
        url = get_deployed_db_url("abc123")
        assert url.startswith("mongodb://")
        assert url.endswith("/app_abc123")

    def test_replaces_db_name_in_mongodb_srv_url(self):
        os.environ["MONGODB_URL"] = "mongodb+srv://host:27017/forge"
        try:
            url = get_deployed_db_url("abc123")
            assert url.startswith("mongodb+srv://")
            assert url.endswith("/app_abc123")
        finally:
            os.environ["MONGODB_URL"] = "mongodb://localhost:27017/forge-test"

    def test_preserves_auth_in_url(self):
        url = get_deployed_db_url("abc123")
        assert "app_abc123" in url

    def test_invalid_id_raises(self):
        with pytest.raises(ValueError, match="Invalid deploy_id"):
            get_deployed_db_url("abc/123")