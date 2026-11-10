import hashlib

from django.conf import settings
from django.core.cache import cache


def _key(email, ip):
    # keyed on both, so a stranger can't lock someone out of their own account from elsewhere
    return "login-fail:" + hashlib.sha256(f"{email}|{ip}".encode()).hexdigest()


def is_locked(email, ip):
    return cache.get(_key(email, ip), 0) >= settings.LOGIN_MAX_FAILURES


def record_failure(email, ip):
    key = _key(email, ip)
    cache.add(key, 0, settings.LOGIN_LOCKOUT_SECONDS)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, settings.LOGIN_LOCKOUT_SECONDS)


def clear(email, ip):
    cache.delete(_key(email, ip))
