"""
Test suite for SSRF protection on user-supplied webhook URLs (SEC-012).
"""
import pytest
import asyncio

from core.security import validate_webhook_url


class TestWebhookSSRFValidation:
    """Test validate_webhook_url blocks private/internal targets."""

    async def test_valid_https_url_accepted(self, monkeypatch):
        async def resolve_public_host(*_args, **_kwargs):
            return [(2, 1, 6, "", ("93.184.216.34", 0))]

        # A unit test must not depend on the runner's external DNS access.
        monkeypatch.setattr(asyncio.get_event_loop(), "getaddrinfo", resolve_public_host)
        valid, error = await validate_webhook_url("https://example.com/hook")
        assert valid is True
        assert error == ""

    async def test_rejects_non_http_scheme(self):
        valid, error = await validate_webhook_url("ftp://example.com/hook")
        assert valid is False
        assert "http" in error.lower()

    async def test_rejects_file_scheme(self):
        valid, error = await validate_webhook_url("file:///etc/passwd")
        assert valid is False

    async def test_rejects_missing_hostname(self):
        valid, error = await validate_webhook_url("https:///path-only")
        assert valid is False

    async def test_rejects_loopback_ip_literal(self):
        valid, error = await validate_webhook_url("http://127.0.0.1:8000/hook")
        assert valid is False
        assert "private" in error.lower() or "loopback" in error.lower() or "reserved" in error.lower()

    async def test_rejects_localhost_hostname(self):
        # "localhost" resolves to a loopback address without needing network access
        valid, error = await validate_webhook_url("http://localhost:8000/hook")
        assert valid is False

    async def test_rejects_private_ip_ranges(self):
        for host in ("10.0.0.1", "172.16.0.1", "192.168.1.1"):
            valid, error = await validate_webhook_url(f"http://{host}/hook")
            assert valid is False, f"{host} should be rejected"

    async def test_rejects_cloud_metadata_endpoint(self):
        # 169.254.169.254 is link-local and is how AWS/GCP/Azure expose instance
        # credentials -- this is the single most damaging SSRF target.
        valid, error = await validate_webhook_url("http://169.254.169.254/latest/meta-data/")
        assert valid is False

    async def test_rejects_unspecified_address(self):
        valid, error = await validate_webhook_url("http://0.0.0.0/hook")
        assert valid is False

    async def test_rejects_multicast_address(self):
        valid, error = await validate_webhook_url("http://224.0.0.1/hook")
        assert valid is False

    async def test_rejects_unresolvable_hostname(self):
        valid, error = await validate_webhook_url("https://this-host-should-not-resolve.invalid/hook")
        assert valid is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
