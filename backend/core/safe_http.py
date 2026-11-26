"""SSRF-safe outbound HTTP with DNS pinning, shared by every outbound protocol client.

Why pinning: a "validate, then let the HTTP library connect" design resolves DNS
twice. An attacker-controlled name can answer the validation lookup with a
public address and the connect-time lookup with ``10.0.0.1`` / ``169.254.169.254``
(DNS rebinding). Here the name is resolved exactly once per request, *every*
resolved address is validated (one private A/AAAA record rejects the whole
host), and the TCP connection is opened to one of the validated IP literals.

TLS still targets the original hostname: the URL is never rewritten, so httpcore
passes ``server_hostname=<original host>`` to ``start_tls`` (SNI + certificate
hostname verification against a ``CERT_REQUIRED`` / ``check_hostname`` context)
and httpx derives the ``Host`` header from the same URL. Only the TCP connect
target changes.

Every request builds a fresh, single-use connection pool, so a validated
address is never reused beyond the request it was resolved for (no DNS cache
that could outlive the record's TTL, no keep-alive connection carried over).

Public surface:
- ``check_url_static`` — scheme / credentials / blocked-hostname / literal-IP
  checks that need no DNS.
- ``resolve_pinned_addresses`` — resolve once and validate all addresses.
- ``validate_url_with_dns`` — advisory pre-check (static + DNS) for
  registration-time validation; it is *not* what protects the connection.
- ``PinnedTransport`` — an ``httpx.AsyncBaseTransport`` that enforces the above
  on every request and connects to the pinned IP.
- ``read_capped_body`` — bounded response body reader.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import ssl
from typing import Any, Callable, Iterable, List, Optional, Sequence, Tuple, Union
from urllib.parse import urlparse

import httpcore
import httpx

MAX_URL_LENGTH = 2048
DEFAULT_DNS_TIMEOUT_SECONDS = 5.0

_BLOCKED_HOSTNAMES = frozenset(
    {"localhost", "metadata.google.internal", "metadata", "169.254.169.254", "0.0.0.0"}
)
_BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa")

# A resolver returns getaddrinfo-style tuples (``info[4][0]`` is the address) or
# bare address strings. Sync; it is run in a worker thread with a timeout.
Resolver = Callable[[str, int], Iterable[Any]]
VerifyTypes = Union[bool, str, ssl.SSLContext]


class SafeHTTPError(ValueError):
    """Base class for outbound-safety failures (a ValueError for legacy callers)."""


class BlockedDestinationError(SafeHTTPError):
    """The destination is forbidden by SSRF policy."""


class DestinationResolutionError(SafeHTTPError):
    """The destination hostname could not be resolved (fails closed)."""


def system_getaddrinfo(host: str, port: int) -> List[Tuple[Any, ...]]:
    """Default resolver. Module-level so tests can replace it with a fake."""
    return socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)


def _normalize_host(host: str) -> str:
    h = (host or "").strip().lower()
    if h.startswith("[") and h.endswith("]"):
        h = h[1:-1]
    return h.rstrip(".")


def _parse_ip(value: str) -> Optional[Union[ipaddress.IPv4Address, ipaddress.IPv6Address]]:
    try:
        return ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return None


def is_public_address(ip: Union[ipaddress.IPv4Address, ipaddress.IPv6Address]) -> bool:
    """True only for globally routable unicast addresses.

    Rejects private, loopback, link-local (incl. cloud metadata), CGNAT
    (100.64/10), reserved, unspecified, multicast and documentation ranges, and
    unwraps IPv4-mapped / 6to4 / Teredo IPv6 forms so an embedded private IPv4
    cannot slip through.
    """
    if isinstance(ip, ipaddress.IPv6Address):
        embedded = ip.ipv4_mapped or ip.sixtofour or (ip.teredo[1] if ip.teredo else None)
        if embedded is not None and not is_public_address(embedded):
            return False
    return bool(ip.is_global) and not ip.is_multicast and not ip.is_unspecified


def check_url_static(
    url: str, *, allowlisted_hosts: Iterable[str] = (), label: str = "Outbound"
) -> Tuple[bool, Optional[str]]:
    """DNS-free URL policy: https only, no credentials, no internal names / IPs.

    Allowlisted hosts skip the hostname and IP-range checks but never the https
    requirement (and are still DNS-pinned at connect time by ``PinnedTransport``).
    """
    raw = (url or "").strip()
    if not raw or len(raw) > MAX_URL_LENGTH:
        return False, f"{label} URL is empty or too long"
    try:
        parsed = urlparse(raw)
        parsed.port  # noqa: B018 - raises ValueError on a malformed port
    except ValueError:
        return False, f"{label} URL is malformed"
    if parsed.scheme != "https":
        return False, f"{label} endpoints must use https://"
    if parsed.username or parsed.password:
        return False, f"Credentials in {label} URLs are not allowed"
    host = _normalize_host(parsed.hostname or "")
    if not host:
        return False, f"Missing hostname in {label} URL"
    if host in {_normalize_host(h) for h in allowlisted_hosts}:
        return True, None
    if host in _BLOCKED_HOSTNAMES or host.endswith(_BLOCKED_SUFFIXES):
        return False, f"Blocked private/internal {label} host '{host}'"
    ip = _parse_ip(host)
    if ip is not None and not is_public_address(ip):
        return False, f"Blocked non-public IP address '{host}'"
    return True, None


async def resolve_pinned_addresses(
    host: str,
    port: int,
    *,
    allowlisted_hosts: Iterable[str] = (),
    resolver: Optional[Resolver] = None,
    timeout: float = DEFAULT_DNS_TIMEOUT_SECONDS,
) -> List[str]:
    """Resolve ``host`` once and return the validated addresses to connect to.

    Raises ``BlockedDestinationError`` if ANY resolved address is non-public
    (unless the host is allowlisted) and ``DestinationResolutionError`` if the
    name does not resolve. Never caches.
    """
    norm = _normalize_host(host)
    if not norm:
        raise BlockedDestinationError("Missing destination hostname")
    allowlisted = norm in {_normalize_host(h) for h in allowlisted_hosts}
    if not allowlisted and (norm in _BLOCKED_HOSTNAMES or norm.endswith(_BLOCKED_SUFFIXES)):
        raise BlockedDestinationError(f"Blocked private/internal host '{norm}'")

    literal = _parse_ip(norm)
    if literal is not None:
        if not allowlisted and not is_public_address(literal):
            raise BlockedDestinationError(f"Blocked non-public IP address '{norm}'")
        return [str(literal)]

    resolve = resolver or system_getaddrinfo  # looked up per call (test seam)
    try:
        infos = await asyncio.wait_for(asyncio.to_thread(resolve, norm, port), timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise DestinationResolutionError(f"DNS resolution for '{norm}' timed out") from exc
    except OSError as exc:
        raise DestinationResolutionError(f"Host '{norm}' could not be resolved") from exc

    addresses: List[str] = []
    for info in infos or []:
        raw_addr = info if isinstance(info, str) else info[4][0]
        ip = _parse_ip(str(raw_addr))
        if ip is None:
            raise BlockedDestinationError(f"Host '{norm}' resolved to an unparseable address")
        if not allowlisted and not is_public_address(ip):
            raise BlockedDestinationError(f"Host '{norm}' resolves to non-public IP")
        text = str(ip)
        if text not in addresses:
            addresses.append(text)
    if not addresses:
        raise DestinationResolutionError(f"Host '{norm}' did not resolve to any address")
    return addresses


def validate_url_with_dns(
    url: str,
    *,
    allowlisted_hosts: Iterable[str] = (),
    resolver: Optional[Resolver] = None,
    label: str = "Outbound",
) -> Tuple[bool, Optional[str]]:
    """Advisory static + DNS check (sync), e.g. when registering an endpoint.

    Resolution failures pass (offline registration keeps working); the
    authoritative, fail-closed check happens per request in ``PinnedTransport``.
    """
    allow = tuple(allowlisted_hosts)
    ok, err = check_url_static(url, allowlisted_hosts=allow, label=label)
    if not ok:
        return ok, err
    host = _normalize_host(urlparse(url.strip()).hostname or "")
    if host in {_normalize_host(h) for h in allow} or _parse_ip(host) is not None:
        return True, None
    resolve = resolver or system_getaddrinfo
    try:
        infos = resolve(host, 443)
    except OSError:
        return True, None
    for info in infos or []:
        ip = _parse_ip(str(info if isinstance(info, str) else info[4][0]))
        if ip is None or not is_public_address(ip):
            return False, f"Host '{host}' resolves to non-public IP"
    return True, None


# --------------------------------------------------------------------------- #
# httpx transport
# --------------------------------------------------------------------------- #


class _PinnedNetworkBackend(httpcore.AsyncNetworkBackend):
    """Connects to pre-validated IP literals instead of resolving the hostname.

    httpcore still calls ``start_tls(server_hostname=<URL host>)`` on the stream
    returned here, so SNI and certificate verification use the original name.
    """

    def __init__(self, hostname: str, addresses: Sequence[str], inner: httpcore.AsyncNetworkBackend) -> None:
        self._hostname = hostname
        self._addresses = list(addresses)
        self._inner = inner

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: Optional[float] = None,
        local_address: Optional[str] = None,
        socket_options: Optional[Iterable[Any]] = None,
    ) -> httpcore.AsyncNetworkStream:
        if _normalize_host(host) != self._hostname:
            raise BlockedDestinationError("Connection attempted to a host that was not validated")
        last_exc: Optional[BaseException] = None
        for addr in self._addresses:  # every entry was validated; try in order
            try:
                return await self._inner.connect_tcp(
                    addr, port, timeout=timeout, local_address=local_address, socket_options=socket_options
                )
            except (httpcore.ConnectError, httpcore.ConnectTimeout, OSError) as exc:
                last_exc = exc
        assert last_exc is not None
        raise last_exc

    async def connect_unix_socket(self, path: str, timeout: Optional[float] = None, socket_options: Any = None):
        raise BlockedDestinationError("Unix socket connections are not allowed")

    async def sleep(self, seconds: float) -> None:
        await self._inner.sleep(seconds)


class _SingleUseHTTPTransport(httpx.AsyncHTTPTransport):
    """httpx's HTTP transport over a connection pool that dials pinned IPs only."""

    def __init__(self, *, ssl_context: ssl.SSLContext, network_backend: httpcore.AsyncNetworkBackend) -> None:
        super().__init__(verify=ssl_context, http2=False, retries=0, trust_env=False)
        # Replace the default pool so the network backend is ours. The pool is
        # the only state `handle_async_request` uses.
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=ssl_context,
            max_connections=1,
            max_keepalive_connections=0,
            http1=True,
            http2=False,
            retries=0,
            network_backend=network_backend,
        )


class _ClosingStream(httpx.AsyncByteStream):
    def __init__(self, inner: httpx.AsyncByteStream, transport: httpx.AsyncBaseTransport) -> None:
        self._inner = inner
        self._transport = transport

    async def __aiter__(self):
        async for chunk in self._inner:
            yield chunk

    async def aclose(self) -> None:
        try:
            await self._inner.aclose()
        finally:
            await self._transport.aclose()


class PinnedTransport(httpx.AsyncBaseTransport):
    """SSRF-safe httpx transport: https only, resolve once, validate all, dial the IP.

    Args:
        allowlisted_hosts: hosts exempt from the public-address check (still
            https, still resolved once and pinned).
        resolver: DNS seam (defaults to ``system_getaddrinfo``).
        verify: TLS verification (``True`` = system/certifi CAs, or an
            ``ssl.SSLContext``). Disabling verification is refused.
        network_backend: httpcore backend that performs the raw TCP connect to
            the pinned IP (seam for tests; defaults to anyio).
        inner: test seam — an in-process httpx transport (ASGI / Mock). Policy,
            resolution and pinning still run; the pinned addresses are attached
            as ``request.extensions["forge_pinned_addresses"]`` and the request
            is delegated instead of dialled.
    """

    def __init__(
        self,
        *,
        allowlisted_hosts: Iterable[str] = (),
        resolver: Optional[Resolver] = None,
        verify: VerifyTypes = True,
        network_backend: Optional[httpcore.AsyncNetworkBackend] = None,
        inner: Optional[httpx.AsyncBaseTransport] = None,
        dns_timeout: float = DEFAULT_DNS_TIMEOUT_SECONDS,
    ) -> None:
        if verify is False:
            raise ValueError("TLS verification cannot be disabled for outbound protocol clients")
        self._allowlisted = frozenset(_normalize_host(h) for h in allowlisted_hosts)
        self._resolver = resolver
        self._verify = verify
        self._network_backend = network_backend
        self._inner = inner
        self._dns_timeout = dns_timeout

    @property
    def allowlisted_hosts(self) -> frozenset:
        return self._allowlisted

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if request.url.scheme != "https":
            raise BlockedDestinationError("Outbound requests must use https://")
        hostname = _normalize_host(request.url.raw_host.decode("ascii"))
        port = request.url.port or 443
        addresses = await resolve_pinned_addresses(
            hostname,
            port,
            allowlisted_hosts=self._allowlisted,
            resolver=self._resolver,
            timeout=self._dns_timeout,
        )
        # A caller-supplied SNI override would decouple TLS from the Host; drop it.
        extensions = {k: v for k, v in request.extensions.items() if k != "sni_hostname"}
        extensions["forge_pinned_addresses"] = tuple(addresses)
        request.extensions = extensions

        if self._inner is not None:
            return await self._inner.handle_async_request(request)

        ssl_context = httpx.create_ssl_context(verify=self._verify)
        if ssl_context.verify_mode != ssl.CERT_REQUIRED or not ssl_context.check_hostname:
            raise ValueError("Outbound TLS context must verify certificates and hostnames")
        backend = _PinnedNetworkBackend(
            hostname, addresses, self._network_backend or httpcore.AnyIOBackend()
        )
        transport = _SingleUseHTTPTransport(ssl_context=ssl_context, network_backend=backend)
        try:
            resp = await transport.handle_async_request(request)
        except BaseException:
            await transport.aclose()
            raise
        assert isinstance(resp.stream, httpx.AsyncByteStream)
        return httpx.Response(
            status_code=resp.status_code,
            headers=resp.headers,
            stream=_ClosingStream(resp.stream, transport),
            extensions=resp.extensions,
        )

    async def aclose(self) -> None:
        # Holds no connections (each request has its own pool). An injected
        # `inner` transport is owned by the caller.
        return None


async def read_capped_body(resp: httpx.Response, limit: int, *, label: str = "Remote") -> bytes:
    """Read a streamed response body, refusing anything larger than ``limit`` bytes."""
    declared = resp.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise SafeHTTPError(f"{label} response exceeded the size limit")
    buf = bytearray()
    async for chunk in resp.aiter_bytes():
        buf.extend(chunk)
        if len(buf) > limit:
            raise SafeHTTPError(f"{label} response exceeded the size limit")
    return bytes(buf)
