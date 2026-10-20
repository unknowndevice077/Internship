import hashlib
import hmac
import ipaddress
import json
import socket
from urllib.parse import urlparse

from django.conf import settings


def encode(payload):
    return json.dumps(payload, separators=(",", ":"), sort_keys=True, default=str).encode()


def sign(secret, body):
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify(secret, body, signature):
    return hmac.compare_digest(sign(secret, body), signature or "")


class UnsafeURL(ValueError):
    pass


def check_url(url):
    """Refuse URLs that resolve to internal addresses so tenants can't use webhooks to probe our network."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise UnsafeURL("Only http(s) URLs are allowed.")
    if settings.WEBHOOK_ALLOW_PRIVATE_URLS:
        return
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443)
    except socket.gaierror:
        raise UnsafeURL("Host could not be resolved.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise UnsafeURL("URL points to a private or internal address.")
