"""Supabase Auth integration: identity/password/session issuance.

The app's own TOTP + recovery-code 2FA stays layered on top of this (in server.py /
Postgres `user_profiles`/`recovery_codes` tables) — Supabase Auth only handles the
email/password step and JWT issuance.
"""
import os

# Makes ssl.SSLContext defer to the OS trust store instead of certifi's bundled CA list — this
# machine has a root CA (AV/corporate-managed) that Windows trusts but certifi's Mozilla-derived
# bundle doesn't know about, which otherwise breaks every outbound HTTPS call httpx makes.
import truststore
truststore.inject_into_ssl()

import httpx
import jwt
from jwt import PyJWKClient

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

_AUTH_BASE = f"{SUPABASE_URL}/auth/v1"
_ADMIN_HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
}

# PyJWKClient caches fetched keys internally and only re-fetches on an unseen `kid`.
_jwks_client = PyJWKClient(f"{_AUTH_BASE}/.well-known/jwks.json")

# Shared/reused across calls so repeated requests get connection (and TLS session) reuse instead of
# a fresh TCP+TLS handshake every time — that per-call handshake cost (worse under truststore's OS
# cert-store lookups) was slow enough to cause outright httpx.ConnectTimeout under light testing.
_client = httpx.AsyncClient(timeout=30)


class SupabaseAuthError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


async def admin_create_user(email: str, password: str) -> dict:
    """Create a Supabase Auth user (service-role, bypasses email confirmation)."""
    resp = await _client.post(
        f"{_AUTH_BASE}/admin/users",
        headers=_ADMIN_HEADERS,
        json={"email": email, "password": password, "email_confirm": True},
    )
    if resp.status_code >= 400:
        raise SupabaseAuthError(resp.status_code, resp.json().get("msg") or resp.text)
    return resp.json()


async def admin_delete_user(user_id: str) -> None:
    """Best-effort cleanup if profile provisioning fails after the auth user was created."""
    await _client.delete(f"{_AUTH_BASE}/admin/users/{user_id}", headers=_ADMIN_HEADERS)


async def password_sign_in(email: str, password: str) -> dict:
    """Returns {access_token, refresh_token, expires_in, user: {...}}."""
    resp = await _client.post(
        f"{_AUTH_BASE}/token?grant_type=password",
        headers={"apikey": SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
    )
    if resp.status_code >= 400:
        raise SupabaseAuthError(401, "Invalid credentials")
    return resp.json()


def verify_access_token(token: str) -> dict:
    """Verifies a Supabase-issued access token against the project's JWKS. Raises jwt exceptions on failure."""
    signing_key = _jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(token, signing_key.key, algorithms=["ES256", "RS256"], audience="authenticated")
