import hashlib
import hmac
import secrets
import time

import pyotp

from . import crypto

ISSUER = "Sprintboard"
STEP = 30


def new_secret():
    return pyotp.random_base32()


def provisioning_url(user, secret):
    return pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=ISSUER)


def store_secret(user, secret):
    user.totp_secret = crypto.encrypt(secret)
    user.save(update_fields=["totp_secret"])


def verify_totp(user, code):
    secret = crypto.decrypt(user.totp_secret) if user.totp_secret else ""
    if not secret:
        return False
    totp = pyotp.TOTP(secret)
    now = int(time.time()) // STEP
    for step in (now - 1, now, now + 1):
        # a step that was already accepted can't be used again
        if step > user.totp_last_step and hmac.compare_digest(totp.at(step * STEP), code):
            user.totp_last_step = step
            user.save(update_fields=["totp_last_step"])
            return True
    return False


def _hash(code):
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()


def make_recovery_codes(user, count=8):
    codes = [f"{secrets.token_hex(3)}-{secrets.token_hex(3)}" for _ in range(count)]
    user.recovery_hashes = [_hash(c) for c in codes]
    user.save(update_fields=["recovery_hashes"])
    return codes


def check(user, code):
    """Accepts a 6-digit authenticator code or a one-time recovery code."""
    code = (code or "").strip().replace(" ", "")
    if code.isdigit() and len(code) == 6:
        return verify_totp(user, code)
    digest = _hash(code)
    if digest in user.recovery_hashes:
        user.recovery_hashes = [h for h in user.recovery_hashes if h != digest]
        user.save(update_fields=["recovery_hashes"])
        return True
    return False
