"""
Test suite for SSRF protection on user-supplied BYOK openai_compatible base URLs
(SEC: BYOK endpoint SSRF). A BYOK base_url is the literal HTTP endpoint our LLM
client connects to, so it must be blocked from pointing at internal/private
addresses or the cloud metadata service, and must require HTTPS.
"""
import pytest
import asyncio

from core.security import validate_byok_base_url


class TestByokBaseUrlSSRFValidation:
    async def test_valid_https_url_accepted(self, monkeypatch):
        async def resolve_public_host(*_args, **_kwargs):
            return [(2, 1, 6, "", ("93.184.216.34", 0))]

        # A unit test must not depend on the runner's external DNS access.
        monkeypatch.setattr(asyncio.get_event_loop(), "getaddrinfo", resolve_public_host)
        valid, error = await validate_byok_base_url("https://api.openai-compatible.example/v1")
        assert valid is True
        assert error == ""

    async def test_rejects_http_scheme(self):
        valid, error = await validate_byok_base_url("http://api.example.com/v1")
        assert valid is False
        assert "https" in error.lower()

    async def test_rejects_file_scheme(self):
        valid, error = await validate_byok_base_url("file:///etc/passwd")
        assert valid is False

    async def test_rejects_missing_hostname(self):
        valid, error = await validate_byok_base_url("https:///path-only")
        assert valid is False

    async def test_rejects_loopback_ip_literal(self):
        valid, error = await validate_byok_base_url("https://127.0.0.1:8000/v1")
        assert valid is False
        assert "private" in error.lower() or "loopback" in error.lower() or "reserved" in error.lower()

    async def test_rejects_private_ip_ranges(self):
        for host in ("10.0.0.1", "172.16.0.1", "192.168.1.1"):
            valid, error = await validate_byok_base_url(f"https://{host}/v1")
            assert valid is False, f"{host} should be rejected"

    async def test_rejects_cloud_metadata_endpoint(self):
        valid, error = await validate_byok_base_url("https://169.254.169.254/latest/meta-data/")
        assert valid is False

    async def test_rejects_unspecified_address(self):
        valid, error = await validate_byok_base_url("https://0.0.0.0/v1")
        assert valid is False

    async def test_rejects_multicast_address(self):
        valid, error = await validate_byok_base_url("https://224.0.0.1/v1")
        assert valid is False

    async def test_rejects_unresolvable_hostname(self):
        valid, error = await validate_byok_base_url("https://this-host-should-not-resolve.invalid/v1")
        assert valid is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
