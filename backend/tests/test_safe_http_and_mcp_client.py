"""DNS-pinning (core.safe_http) and MCP Streamable HTTP lifecycle tests.

No real network: DNS is a fake resolver; TCP connects are either recorded and
refused by a recording httpcore backend, or go to a TLS server on 127.0.0.1
inside the test process. The MCP lifecycle tests drive the real `mcp` SDK
server (stateful + stateless, JSON + SSE) through an in-process bridge.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import ipaddress
import json
import ssl
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpcore
import httpx
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import core.safe_http as safe_http  # noqa: E402
from core.a2a_adapter import (  # noqa: E402
    A2ABlockedURLError,
    A2ARemoteClient,
    A2ARemoteError,
    validate_a2a_remote_url,
)
from core.protocol_gateway import (  # noqa: E402
    MCP_CLIENT_PROTOCOL_VERSIONS,
    MCPClientError,
    StreamableHTTPMCPClient,
    validate_mcp_endpoint_url,
)
from core.safe_http import BlockedDestinationError, PinnedTransport, resolve_pinned_addresses  # noqa: E402

from mcp.server.mcpserver import MCPServer  # noqa: E402
from mcp.server.transport_security import TransportSecuritySettings  # noqa: E402

PUBLIC_IP = "93.184.216.34"
PUBLIC_IP_2 = "93.184.216.35"
PRIVATE_IP = "10.0.0.7"


def _gai(*ips: str, port: int = 443) -> List[tuple]:
    out = []
    for ip in ips:
        fam = 10 if ":" in ip else 2
        out.append((fam, 1, 6, "", (ip, port) if fam == 2 else (ip, port, 0, 0)))
    return out


class FlipResolver:
    """DNS rebinding attacker: public answer first, private answer afterwards."""

    def __init__(self, first: str = PUBLIC_IP, then: str = PRIVATE_IP) -> None:
        self.first, self.then, self.calls = first, then, []

    def __call__(self, host: str, port: int):
        self.calls.append((host, port))
        return _gai(self.first if len(self.calls) == 1 else self.then, port=port)


class StaticResolver:
    def __init__(self, table: Dict[str, List[str]]) -> None:
        self.table, self.calls = table, []

    def __call__(self, host: str, port: int):
        self.calls.append((host, port))
        if host not in self.table:
            raise OSError("NXDOMAIN (fake)")
        return _gai(*self.table[host], port=port)


@pytest.fixture(autouse=True)
def _no_system_dns(monkeypatch):
    def _refuse(host, port):
        raise AssertionError(f"system DNS must not be used in tests (asked for {host})")

    monkeypatch.setattr(safe_http, "system_getaddrinfo", _refuse)


class _RecordingStream(httpcore.AsyncNetworkStream):
    def __init__(self, inner: httpcore.AsyncNetworkStream, rec: "RecordingBackend") -> None:
        self._inner, self._rec = inner, rec

    async def read(self, max_bytes: int, timeout: Optional[float] = None) -> bytes:
        return await self._inner.read(max_bytes, timeout)

    async def write(self, buffer: bytes, timeout: Optional[float] = None) -> None:
        await self._inner.write(buffer, timeout)

    async def aclose(self) -> None:
        await self._inner.aclose()

    async def start_tls(self, ssl_context, server_hostname=None, timeout=None):
        self._rec.tls.append(
            {
                "server_hostname": server_hostname,
                "check_hostname": ssl_context.check_hostname,
                "verify_mode": ssl_context.verify_mode,
            }
        )
        return _RecordingStream(await self._inner.start_tls(ssl_context, server_hostname, timeout), self._rec)

    def get_extra_info(self, info: str) -> Any:
        return self._inner.get_extra_info(info)


class RecordingBackend(httpcore.AsyncNetworkBackend):
    """Records what the pinned transport dials. Without `inner` it refuses to connect."""

    def __init__(self, inner: Optional[httpcore.AsyncNetworkBackend] = None, *, fail_hosts=()) -> None:
        self.inner, self.fail_hosts = inner, set(fail_hosts)
        self.connects: List[tuple] = []
        self.tls: List[Dict[str, Any]] = []

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        self.connects.append((host, port))
        if self.inner is None or host in self.fail_hosts:
            raise httpcore.ConnectError("recording backend: no network in tests")
        stream = await self.inner.connect_tcp(
            host, port, timeout=timeout, local_address=local_address, socket_options=socket_options
        )
        return _RecordingStream(stream, self)

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):  # pragma: no cover
        raise httpcore.ConnectError("no unix sockets")

    async def sleep(self, seconds: float) -> None:  # pragma: no cover
        await asyncio.sleep(seconds)


# --------------------------------------------------------------------------- #
# Address policy
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "ip,public",
    [
        ("93.184.216.34", True),
        ("2606:2800:220:1:248:1893:25c8:1946", True),
        ("10.0.0.1", False),
        ("127.0.0.1", False),
        ("169.254.169.254", False),
        ("100.64.0.1", False),
        ("0.0.0.0", False),
        ("224.0.0.1", False),
        ("::1", False),
        ("fe80::1", False),
        ("fc00::1", False),
        ("::ffff:10.0.0.1", False),
        ("::ffff:127.0.0.1", False),
        ("2002:0a00:0001::1", False),  # 6to4 wrapping 10.0.0.1
    ],
)
def test_is_public_address(ip, public):
    assert safe_http.is_public_address(ipaddress.ip_address(ip)) is public


async def test_any_private_record_in_multi_answer_rejects_host():
    resolver = StaticResolver(
        {
            "mixed.example": [PUBLIC_IP, PRIVATE_IP],
            "mapped.example": [PUBLIC_IP, "::ffff:127.0.0.1"],
            "ok.example": [PUBLIC_IP, PUBLIC_IP_2],
        }
    )
    for host in ("mixed.example", "mapped.example"):
        with pytest.raises(BlockedDestinationError, match="non-public"):
            await resolve_pinned_addresses(host, 443, resolver=resolver)
    assert await resolve_pinned_addresses("ok.example", 443, resolver=resolver) == [PUBLIC_IP, PUBLIC_IP_2]

    backend = RecordingBackend()
    client = A2ARemoteClient(resolver=resolver, network_backend=backend)
    with pytest.raises(A2ABlockedURLError, match="non-public"):
        await client.fetch_agent_card("https://mixed.example")
    assert backend.connects == []  # rejected before any TCP connect


async def test_static_policy_blocks_trailing_dot_and_internal_names():
    for url in ("https://localhost./x", "https://svc.internal./x", "https://foo.localhost/x", "https://[::1]/x"):
        ok, _ = safe_http.check_url_static(url)
        assert not ok, url
    assert not validate_mcp_endpoint_url("https://localhost./mcp")[0]


# --------------------------------------------------------------------------- #
# DNS rebinding
# --------------------------------------------------------------------------- #


async def test_rebinding_connect_goes_to_validated_ip_and_revalidates_each_request():
    resolver = FlipResolver()
    backend = RecordingBackend()  # records the dial, then refuses (no network)
    client = A2ARemoteClient(resolver=resolver, network_backend=backend)

    with pytest.raises(A2ARemoteError, match="transport error") as exc_info:
        await client.fetch_agent_card("https://rebind.example")
    assert not isinstance(exc_info.value, A2ABlockedURLError)
    # Resolved exactly once; the TCP connect went to that validated public IP,
    # not to a hostname the HTTP stack could re-resolve.
    assert resolver.calls == [("rebind.example", 443)]
    assert backend.connects == [(PUBLIC_IP, 443)]

    # Next request re-resolves (no cache) and now sees the private answer.
    with pytest.raises(A2ABlockedURLError, match="non-public"):
        await client.fetch_agent_card("https://rebind.example")
    assert len(resolver.calls) == 2
    assert backend.connects == [(PUBLIC_IP, 443)]  # nothing dialled for the private answer


async def test_rebinding_between_precheck_and_request_is_refused():
    resolver = FlipResolver()
    ok, _ = safe_http.validate_url_with_dns("https://rebind.example/rpc", resolver=resolver)
    assert ok  # check time: public
    backend = RecordingBackend()
    client = A2ARemoteClient(resolver=resolver, network_backend=backend)
    with pytest.raises(A2ABlockedURLError):  # connect time: private -> refused
        await client.send_task("https://rebind.example/rpc", task_id="t-1", text="hello there")
    assert backend.connects == []


async def test_mcp_client_uses_the_same_pinning():
    resolver = FlipResolver()
    backend = RecordingBackend()
    client = StreamableHTTPMCPClient(resolver=resolver, network_backend=backend)
    with pytest.raises(MCPClientError, match="transport error"):
        await client.list_tools("https://mcp.rebind.example/mcp")
    assert backend.connects == [(PUBLIC_IP, 443)]
    with pytest.raises(BlockedDestinationError):
        await client.list_tools("https://mcp.rebind.example/mcp")
    assert backend.connects == [(PUBLIC_IP, 443)]


async def test_all_validated_addresses_tried_in_order_and_dns_failure_fails_closed():
    resolver = StaticResolver({"multi.example": [PUBLIC_IP, PUBLIC_IP_2]})
    backend = RecordingBackend()
    client = A2ARemoteClient(resolver=resolver, network_backend=backend)
    with pytest.raises(A2ARemoteError):
        await client.fetch_agent_card("https://multi.example:8443")
    assert backend.connects == [(PUBLIC_IP, 8443), (PUBLIC_IP_2, 8443)]

    with pytest.raises(A2ARemoteError, match="could not be resolved") as exc_info:
        await client.fetch_agent_card("https://nxdomain.example")
    assert not isinstance(exc_info.value, A2ABlockedURLError)
    assert len(backend.connects) == 2


async def test_allowlisted_host_is_still_https_and_pinned():
    resolver = StaticResolver({"partner.corp": [PRIVATE_IP]})
    backend = RecordingBackend()
    client = A2ARemoteClient(
        resolver=resolver, network_backend=backend, allowlisted_hosts=frozenset({"partner.corp"})
    )
    with pytest.raises(A2ARemoteError):
        await client.fetch_agent_card("https://partner.corp")
    assert resolver.calls == [("partner.corp", 443)]  # still resolved by us, once
    assert backend.connects == [(PRIVATE_IP, 443)]  # dialled the pinned IP literal
    with pytest.raises(A2ABlockedURLError, match="https"):
        await client.fetch_agent_card("http://partner.corp")

    transport = PinnedTransport(allowlisted_hosts={"partner.corp"}, resolver=resolver, network_backend=backend)
    async with httpx.AsyncClient(transport=transport) as raw:
        with pytest.raises(BlockedDestinationError, match="https"):
            await raw.get("http://partner.corp/")


def test_tls_verification_cannot_be_disabled():
    with pytest.raises(ValueError, match="cannot be disabled"):
        PinnedTransport(verify=False)


async def test_inner_transport_seam_receives_pinned_address_and_original_host():
    seen: List[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"name": "A", "url": "https://agent.example/rpc"})

    client = A2ARemoteClient(
        transport=httpx.MockTransport(handler), resolver=StaticResolver({"agent.example": [PUBLIC_IP]})
    )
    await client.fetch_agent_card("https://agent.example")
    req = seen[0]
    assert req.headers["host"] == "agent.example"
    assert req.url.host == "agent.example"
    assert req.extensions["forge_pinned_addresses"] == (PUBLIC_IP,)
    assert "sni_hostname" not in req.extensions


# --------------------------------------------------------------------------- #
# Real TLS over the pinned connection (loopback, in-process server)
# --------------------------------------------------------------------------- #


def _issue_certs(tmp_path: Path, hostname: str):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    now = dt.datetime.now(dt.timezone.utc)
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Forge Test CA")])
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True, key_cert_sign=True, crl_sign=True, content_commitment=False,
                key_encipherment=False, data_encipherment=False, key_agreement=False,
                encipher_only=False, decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    leaf_key = ec.generate_private_key(ec.SECP256R1())
    leaf = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)]))
        .issuer_name(ca_name)
        .public_key(leaf_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=1))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(hostname)]), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False
        )
        .sign(ca_key, hashes.SHA256())
    )
    pem = serialization.Encoding.PEM
    ca_path, cert_path, key_path = tmp_path / "ca.pem", tmp_path / f"{hostname}.pem", tmp_path / f"{hostname}.key"
    ca_path.write_bytes(ca_cert.public_bytes(pem))
    cert_path.write_bytes(leaf.public_bytes(pem))
    key_path.write_bytes(
        leaf_key.private_bytes(pem, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    )
    return ca_path, cert_path, key_path


async def _start_tls_server(cert_path: Path, key_path: Path, seen: Dict[str, Any]):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert_path, key_path)

    def _sni(_sslobj, server_name, _ctx):
        seen.setdefault("sni", []).append(server_name)

    ctx.sni_callback = _sni

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            head = await reader.readuntil(b"\r\n\r\n")
        except (asyncio.IncompleteReadError, ConnectionError, ssl.SSLError):
            writer.close()
            return
        lines = head.decode("latin-1").split("\r\n")
        seen.setdefault("request_lines", []).append(lines[0])
        for line in lines[1:]:
            if line.lower().startswith("host:"):
                seen.setdefault("host_headers", []).append(line.split(":", 1)[1].strip())
        body = json.dumps({"name": "Pinned Agent", "url": "https://pinned.test/rpc"}).encode()
        writer.write(
            b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n"
            + f"Content-Length: {len(body)}\r\n\r\n".encode()
            + body
        )
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0, ssl=ctx)
    return server, server.sockets[0].getsockname()[1]


async def test_tls_sni_host_header_and_certificate_verification_use_original_hostname(tmp_path):
    ca_path, cert_path, key_path = _issue_certs(tmp_path, "pinned.test")
    other_dir = tmp_path / "other"
    other_dir.mkdir()
    other_ca, wrong_cert, wrong_key = _issue_certs(other_dir, "other.test")
    client_ctx = ssl.create_default_context(cafile=str(ca_path))
    other_ctx = ssl.create_default_context(cafile=str(other_ca))

    seen: Dict[str, Any] = {}
    server, port = await _start_tls_server(cert_path, key_path, seen)
    try:
        backend = RecordingBackend(inner=httpcore.AnyIOBackend())
        client = A2ARemoteClient(
            resolver=StaticResolver({"pinned.test": ["127.0.0.1"]}),
            allowlisted_hosts=frozenset({"pinned.test"}),
            network_backend=backend,
            verify=client_ctx,
        )
        card = await client.fetch_agent_card(f"https://pinned.test:{port}/.well-known/agent.json")
        assert card["name"] == "Pinned Agent"
        assert backend.connects == [("127.0.0.1", port)]  # TCP to the pinned IP
        assert backend.tls == [
            {"server_hostname": "pinned.test", "check_hostname": True, "verify_mode": ssl.CERT_REQUIRED}
        ]
        assert seen["sni"] == ["pinned.test"]  # what the server actually received
        assert seen["host_headers"] == [f"pinned.test:{port}"]
        assert seen["request_lines"] == ["GET /.well-known/agent.json HTTP/1.1"]
    finally:
        server.close()
        await server.wait_closed()

    # Same pinned IP, but the server presents a valid-chain certificate for a
    # different name: verification is against the hostname, so it must fail.
    seen2: Dict[str, Any] = {}
    server2, port2 = await _start_tls_server(wrong_cert, wrong_key, seen2)
    try:
        client2 = A2ARemoteClient(
            resolver=StaticResolver({"pinned.test": ["127.0.0.1"]}),
            allowlisted_hosts=frozenset({"pinned.test"}),
            verify=other_ctx,  # trusts the CA that signed other.test
        )
        with pytest.raises(A2ARemoteError, match="ConnectError") as exc_info:
            await client2.fetch_agent_card(f"https://pinned.test:{port2}/.well-known/agent.json")
        chain = repr(exc_info.value.__cause__)
        assert "CERTIFICATE_VERIFY_FAILED" in chain or "certificate verify failed" in chain
        assert "host_headers" not in seen2  # no HTTP request was sent over the bad channel
    finally:
        server2.close()
        await server2.wait_closed()


# --------------------------------------------------------------------------- #
# MCP Streamable HTTP lifecycle against the real SDK server
# --------------------------------------------------------------------------- #


def _sdk_server(*, stateless: bool, json_response: bool):
    srv = MCPServer("lifecycle-test")

    @srv.tool(description="Echo a value")
    def echo(value: str) -> str:
        return f"echo:{value}"

    return srv.streamable_http_app(
        json_response=json_response,
        stateless_http=stateless,
        transport_security=TransportSecuritySettings(allowed_hosts=["mcp.test"]),
    )


class _Bridge(httpx.AsyncBaseTransport):
    """Forward to an ASGI app inside a TestClient (runs the SDK lifespan); log everything."""

    def __init__(self, tc: TestClient) -> None:
        self.tc, self.log = tc, []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        body = await request.aread()
        payload = json.loads(body) if body else {}
        resp = await asyncio.to_thread(
            self.tc.request, request.method, str(request.url), content=body, headers=dict(request.headers)
        )
        self.log.append(
            {
                "verb": request.method,
                "method": payload.get("method"),
                "params": payload.get("params"),
                "headers": {k.lower(): v for k, v in request.headers.items()},
                "status": resp.status_code,
                "ctype": resp.headers.get("content-type", ""),
                "session_out": resp.headers.get("mcp-session-id"),
                "pinned": request.extensions.get("forge_pinned_addresses"),
            }
        )
        return httpx.Response(resp.status_code, headers=resp.headers, content=resp.content)


@pytest.fixture
def mcp_resolver():
    return StaticResolver({"mcp.test": [PUBLIC_IP]})


def _client(bridge, resolver, **kw) -> StreamableHTTPMCPClient:
    return StreamableHTTPMCPClient(transport=bridge, resolver=resolver, **kw)


ENDPOINT = "https://mcp.test/mcp"


async def test_mcp_stateful_sse_handshake_order_and_headers(mcp_resolver):
    with TestClient(_sdk_server(stateless=False, json_response=False), base_url="https://mcp.test") as tc:
        bridge = _Bridge(tc)
        client = _client(bridge, mcp_resolver)
        tools = await client.list_tools(ENDPOINT)
        assert [t["name"] for t in tools] == ["echo"]
        result = await client.call_tool(ENDPOINT, "echo", {"value": "hi"})
        assert result["content"][0]["text"] == "echo:hi"

        log = bridge.log
        assert [e["method"] for e in log] == ["initialize", "notifications/initialized", "tools/list", "tools/call"]
        init, notified, listed, called = log
        # initialize: our offer, no session/version headers yet, dual Accept
        assert init["params"]["protocolVersion"] == MCP_CLIENT_PROTOCOL_VERSIONS[0]
        assert init["params"]["capabilities"] == {}
        assert init["params"]["clientInfo"]["name"] == "forge-ai-mcp-gateway"
        assert init["headers"]["accept"] == "application/json, text/event-stream"
        assert "mcp-session-id" not in init["headers"]
        assert "mcp-protocol-version" not in init["headers"]
        assert init["ctype"].startswith("text/event-stream")  # SSE response parsed
        session_id = init["session_out"]
        assert session_id

        state = client.get_session(ENDPOINT)
        assert state.session_id == session_id
        assert state.protocol_version == MCP_CLIENT_PROTOCOL_VERSIONS[0]
        assert "tools" in state.server_capabilities
        assert state.server_info["name"] == "lifecycle-test"

        assert notified["status"] == 202
        for entry in (notified, listed, called):
            assert entry["headers"]["mcp-session-id"] == session_id
            assert entry["headers"]["mcp-protocol-version"] == state.protocol_version
            assert entry["headers"]["accept"] == "application/json, text/event-stream"
            assert entry["pinned"] == (PUBLIC_IP,)
        assert listed["ctype"].startswith("text/event-stream")

        # close -> DELETE with the session id; the server forgets the session
        await client.close_session(ENDPOINT)
        assert bridge.log[-1]["verb"] == "DELETE"
        assert bridge.log[-1]["headers"]["mcp-session-id"] == session_id
        assert client.get_session(ENDPOINT) is None
        stale = tc.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 9, "method": "tools/list", "params": {}},
            headers={
                "Accept": "application/json, text/event-stream",
                "Mcp-Session-Id": session_id,
                "MCP-Protocol-Version": state.protocol_version,
            },
        )
        assert stale.status_code == 404


@pytest.mark.parametrize("json_response", [True, False], ids=["json", "sse"])
async def test_mcp_stateless_server_handshake_without_session(mcp_resolver, json_response):
    with TestClient(_sdk_server(stateless=True, json_response=json_response), base_url="https://mcp.test") as tc:
        bridge = _Bridge(tc)
        client = _client(bridge, mcp_resolver)
        assert [t["name"] for t in await client.list_tools(ENDPOINT)] == ["echo"]
        assert (await client.call_tool(ENDPOINT, "echo", {"value": "x"}))["content"][0]["text"] == "echo:x"
        assert [e["method"] for e in bridge.log] == [
            "initialize",
            "notifications/initialized",
            "tools/list",
            "tools/call",
        ]
        state = client.get_session(ENDPOINT)
        assert state.session_id is None and state.protocol_version == MCP_CLIENT_PROTOCOL_VERSIONS[0]
        for entry in bridge.log[1:]:
            assert "mcp-session-id" not in entry["headers"]
            assert entry["headers"]["mcp-protocol-version"] == MCP_CLIENT_PROTOCOL_VERSIONS[0]
        expected = "application/json" if json_response else "text/event-stream"
        assert bridge.log[2]["ctype"].startswith(expected)
        await client.aclose()  # no session id -> no DELETE
        assert bridge.log[-1]["verb"] == "POST"


async def test_mcp_session_expired_reinitializes_once(mcp_resolver):
    with TestClient(_sdk_server(stateless=False, json_response=False), base_url="https://mcp.test") as tc:
        bridge = _Bridge(tc)
        client = _client(bridge, mcp_resolver)
        await client.list_tools(ENDPOINT)
        old = client.get_session(ENDPOINT)

        # Server-side termination (as if the session idled out)
        gone = tc.delete(
            "/mcp", headers={"Mcp-Session-Id": old.session_id, "MCP-Protocol-Version": old.protocol_version}
        )
        assert gone.status_code == 200

        bridge.log.clear()
        result = await client.call_tool(ENDPOINT, "echo", {"value": "again"})
        assert result["content"][0]["text"] == "echo:again"
        assert [(e["method"], e["status"]) for e in bridge.log] == [
            ("tools/call", 404),
            ("initialize", 200),
            ("notifications/initialized", 202),
            ("tools/call", 200),
        ]
        new = client.get_session(ENDPOINT)
        assert new.session_id and new.session_id != old.session_id
        assert bridge.log[0]["headers"]["mcp-session-id"] == old.session_id
        assert "mcp-session-id" not in bridge.log[1]["headers"]
        assert bridge.log[3]["headers"]["mcp-session-id"] == new.session_id


async def test_mcp_persistent_404_after_reinit_is_an_error(mcp_resolver):
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        if payload.get("method") == "initialize":
            return httpx.Response(
                200,
                headers={"Mcp-Session-Id": "sess-abc"},
                json={"jsonrpc": "2.0", "id": payload["id"], "result": {"protocolVersion": "2025-06-18"}},
            )
        if "id" not in payload:
            return httpx.Response(202)
        return httpx.Response(404)

    client = StreamableHTTPMCPClient(transport=httpx.MockTransport(handler), resolver=mcp_resolver)
    with pytest.raises(MCPClientError, match="HTTP 404"):
        await client.list_tools(ENDPOINT)
    assert client.get_session(ENDPOINT).protocol_version == "2025-06-18"  # older revision negotiated


# --------------------------------------------------------------------------- #
# MCP edge cases (mock servers)
# --------------------------------------------------------------------------- #


def _sse_server(stream_factory, *, init_version: str = "2025-11-25", log: Optional[list] = None):
    async def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content) if request.content else {}
        if log is not None:
            log.append((request.method, payload.get("method"), dict(request.headers)))
        if request.method == "DELETE":
            return httpx.Response(200)
        if payload.get("method") == "initialize":
            return httpx.Response(
                200,
                headers={"Mcp-Session-Id": "s-1"},
                json={"jsonrpc": "2.0", "id": payload["id"], "result": {"protocolVersion": init_version}},
            )
        if "id" not in payload:
            return httpx.Response(202)
        return httpx.Response(
            200, headers={"Content-Type": "text/event-stream"}, content=stream_factory(payload["id"])
        )

    return httpx.MockTransport(handler)


async def test_mcp_sse_parsing_skips_noise_and_matches_request_id(mcp_resolver):
    def stream(rid):
        async def gen():
            parts = [
                ": keep-alive comment\r\n\r\n",
                "event: message\r\nid: 1\r\ndata: ",
                json.dumps({"jsonrpc": "2.0", "method": "notifications/progress", "params": {"p": 1}}),
                "\r\n\r\n",
                "event: message\ndata: " + json.dumps({"jsonrpc": "2.0", "id": "someone-else", "result": {}}) + "\n\n",
                "event: other\ndata: {\"id\": \"" + rid + "\", \"result\": {\"wrong\": true}}\n\n",
                # the matching response, split across multi-line data and odd chunk boundaries (incl. CR|LF)
                'data: {"jsonrpc": "2.0", "id": "' + rid + '",\r',
                '\ndata:  "result": {"tools": [{"name": "tést"}]}}\r\n',
                "\r\n",
                "data: never-read\n\n",
            ]
            for p in parts:
                data = p.encode()
                for i in range(0, len(data), 7):
                    yield data[i : i + 7]

        return gen()

    client = StreamableHTTPMCPClient(transport=_sse_server(stream), resolver=mcp_resolver)
    tools = await client.list_tools(ENDPOINT)
    assert tools == [{"name": "tést"}]


async def test_mcp_oversized_sse_rejected(mcp_resolver):
    def stream(_rid):
        async def gen():
            chunk = (": " + "x" * 8190 + "\n").encode()
            for _ in range(100):  # ~800 KB of comments, never a response
                yield chunk

        return gen()

    client = StreamableHTTPMCPClient(transport=_sse_server(stream), resolver=mcp_resolver)
    with pytest.raises(MCPClientError, match="512 KB"):
        await client.list_tools(ENDPOINT)


async def test_mcp_slow_drip_sse_times_out(mcp_resolver):
    def stream(_rid):
        async def gen():
            while True:
                yield b": tick\n\n"
                await asyncio.sleep(0.05)

        return gen()

    client = StreamableHTTPMCPClient(transport=_sse_server(stream), resolver=mcp_resolver, timeout_seconds=0.3)
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    with pytest.raises(MCPClientError, match="timed out"):
        await client.list_tools(ENDPOINT)
    assert loop.time() - t0 < 2.0


async def test_mcp_sse_stream_ending_without_response(mcp_resolver):
    def stream(_rid):
        async def gen():
            yield b'data: {"jsonrpc": "2.0", "method": "notifications/message"}\n\n'

        return gen()

    client = StreamableHTTPMCPClient(transport=_sse_server(stream), resolver=mcp_resolver)
    with pytest.raises(MCPClientError, match="without a response"):
        await client.list_tools(ENDPOINT)


async def test_mcp_unsupported_protocol_version_is_rejected_and_session_deleted(mcp_resolver):
    log: list = []
    transport = _sse_server(lambda rid: None, init_version="1999-01-01", log=log)
    client = StreamableHTTPMCPClient(transport=transport, resolver=mcp_resolver)
    with pytest.raises(MCPClientError, match="unsupported protocol version"):
        await client.list_tools(ENDPOINT)
    assert [(verb, m) for verb, m, _ in log] == [("POST", "initialize"), ("DELETE", None)]
    assert log[1][2]["mcp-session-id"] == "s-1"
    assert client.get_session(ENDPOINT) is None


async def test_mcp_invalid_session_id_rejected(mcp_resolver):
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        return httpx.Response(
            200,
            headers={"Mcp-Session-Id": "bad id with spaces"},
            json={"jsonrpc": "2.0", "id": payload["id"], "result": {"protocolVersion": "2025-11-25"}},
        )

    client = StreamableHTTPMCPClient(transport=httpx.MockTransport(handler), resolver=mcp_resolver)
    with pytest.raises(MCPClientError, match="invalid Mcp-Session-Id"):
        await client.list_tools(ENDPOINT)


async def test_mcp_legacy_server_without_initialize_still_works(mcp_resolver):
    seen: List[Dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        seen.append({"method": payload.get("method"), "headers": dict(request.headers)})
        if payload["method"] == "initialize":
            return httpx.Response(
                200, json={"jsonrpc": "2.0", "id": payload["id"], "error": {"code": -32601, "message": "nope"}}
            )
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": payload["id"], "result": {"tools": [{"name": "a"}]}})

    client = StreamableHTTPMCPClient(transport=httpx.MockTransport(handler), resolver=mcp_resolver)
    assert await client.list_tools(ENDPOINT) == [{"name": "a"}]
    assert [s["method"] for s in seen] == ["initialize", "tools/list"]
    assert "mcp-protocol-version" not in seen[1]["headers"]
    assert client.get_session(ENDPOINT).legacy is True


async def test_mcp_client_blocks_unsafe_endpoints_before_any_request(mcp_resolver):
    calls: list = []
    client = StreamableHTTPMCPClient(
        transport=httpx.MockTransport(lambda r: calls.append(r) or httpx.Response(500)),
        resolver=StaticResolver({"rebind.example": [PRIVATE_IP]}),
    )
    for url in ("http://mcp.test/mcp", "https://127.0.0.1/mcp", "https://rebind.example/mcp", "https://u:p@mcp.test/"):
        with pytest.raises(ValueError):
            await client.list_tools(url)
    assert calls == []


def test_a2a_url_validator_keeps_messages():
    assert validate_a2a_remote_url("http://agent.example/rpc")[1] == "Remote A2A agents must use https://"
