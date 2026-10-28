import os
import socket
import struct

from django.conf import settings
from rest_framework import serializers

# types a browser or OS will happily run or render, so they never get stored
BLOCKED_EXTENSIONS = {
    ".apk",
    ".app",
    ".bat",
    ".cmd",
    ".com",
    ".dll",
    ".exe",
    ".htm",
    ".html",
    ".jar",
    ".js",
    ".msi",
    ".ps1",
    ".scr",
    ".sh",
    ".svg",
    ".vbs",
}

CHUNK = 64 * 1024


def check_extension(name):
    ext = os.path.splitext(name)[1].lower()
    if ext in BLOCKED_EXTENSIONS:
        raise serializers.ValidationError(f"{ext} files can't be attached.")


def scan_with_clamd(f):
    """Streams the upload to clamd (INSTREAM). Fails closed if the scanner can't be reached."""
    try:
        with socket.create_connection((settings.CLAMD_HOST, settings.CLAMD_PORT), timeout=10) as sock:
            sock.sendall(b"zINSTREAM\0")
            f.seek(0)
            for chunk in iter(lambda: f.read(CHUNK), b""):
                sock.sendall(struct.pack(">I", len(chunk)) + chunk)
            sock.sendall(struct.pack(">I", 0))
            reply = sock.recv(1024).decode(errors="replace")
    except OSError as exc:
        raise serializers.ValidationError("The file couldn't be scanned right now, try again later.") from exc
    finally:
        f.seek(0)
    if "FOUND" in reply:
        raise serializers.ValidationError("The file was flagged by the virus scanner.")
    if "OK" not in reply:
        raise serializers.ValidationError("The file couldn't be scanned right now, try again later.")


def validate_upload(f):
    check_extension(f.name)
    if settings.CLAMD_HOST:
        scan_with_clamd(f)
