import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from typing import Final
from urllib.parse import urljoin, urlparse

import httpx

from backend.app.core.config import Settings
from backend.app.core.errors import bad_gateway, payload_too_large, unsupported_media_type

ALLOWED_REMOTE_MIME_TYPES: Final[set[str]] = {"image/png", "image/jpeg", "image/webp"}
BLOCKED_HOSTNAMES: Final[set[str]] = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
MAX_REDIRECTS: Final[int] = 3


@dataclass(slots=True)
class FetchedImage:
    buffer: bytes
    content_type: str


def _is_forbidden_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    return any(
        (
            ip.is_private,
            ip.is_loopback,
            ip.is_link_local,
            ip.is_multicast,
            ip.is_reserved,
            ip.is_unspecified,
        )
    )


async def _validate_hostname(hostname: str, allow_private_remote_hosts: bool) -> None:
    normalized = hostname.strip().lower().rstrip(".")
    if not normalized:
        raise bad_gateway("The requested host is not allowed.")
    if normalized in BLOCKED_HOSTNAMES and not allow_private_remote_hosts:
        raise bad_gateway("The requested host is not allowed.")

    try:
        loop = asyncio.get_running_loop()
        records = await loop.getaddrinfo(normalized, None, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise bad_gateway("The remote host could not be resolved.") from error

    addresses = {record[4][0] for record in records}
    if not addresses:
        raise bad_gateway("The remote host did not resolve to a routable address.")

    if not allow_private_remote_hosts and any(_is_forbidden_ip(address) for address in addresses):
        raise bad_gateway("The remote host resolved to a blocked network address.")


def _validate_https_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise bad_gateway("Only public https image URLs are supported.")
    if not parsed.hostname:
        raise bad_gateway("The remote image URL is invalid.")
    return url


async def fetch_remote_image(url: str, settings: Settings) -> FetchedImage:
    current_url = _validate_https_url(url)

    async with httpx.AsyncClient(follow_redirects=False, timeout=settings.fetch_timeout_seconds) as client:
        for _ in range(MAX_REDIRECTS + 1):
            parsed = urlparse(current_url)
            await _validate_hostname(
                parsed.hostname or "",
                settings.allow_private_remote_hosts,
            )

            try:
                response = await client.get(
                    current_url,
                    headers={"Accept": "image/png,image/jpeg,image/webp,*/*"},
                )
            except httpx.HTTPError as error:
                raise bad_gateway("Fetching the remote image failed.") from error

            if 300 <= response.status_code < 400:
                location = response.headers.get("location")
                if not location:
                    raise bad_gateway("The remote image redirect was missing a location header.")
                current_url = _validate_https_url(urljoin(current_url, location))
                continue

            if response.status_code >= 400:
                raise bad_gateway(f"The remote image returned HTTP {response.status_code}.")

            content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if content_type not in ALLOWED_REMOTE_MIME_TYPES:
                raise unsupported_media_type("The remote URL did not return a supported image type.")

            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > settings.max_image_bytes:
                raise payload_too_large("The remote image exceeded the configured size limit.")

            payload = bytearray()
            async for chunk in response.aiter_bytes():
                payload.extend(chunk)
                if len(payload) > settings.max_image_bytes:
                    raise payload_too_large("The remote image exceeded the configured size limit.")

            return FetchedImage(buffer=bytes(payload), content_type=content_type)

    raise bad_gateway("The remote image redirected too many times.")
