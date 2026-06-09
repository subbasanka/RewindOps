"""Verify Clerk JWT tokens using Clerk's JWKS endpoint."""

import httpx
import jwt
from functools import lru_cache
from rewindops_agent.config import CLERK_SECRET_KEY

_jwks_cache: dict | None = None


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache

    async with httpx.AsyncClient() as client:
        # Clerk JWKS endpoint derived from the secret key's instance identifier
        # Format: sk_test_xxxx or sk_live_xxxx -> frontend API is in the JWT issuer
        resp = await client.get(
            "https://api.clerk.com/v1/jwks",
            headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
        )
        resp.raise_for_status()
        _jwks_cache = resp.json()
        return _jwks_cache


async def verify_clerk_token(token: str) -> str:
    """Verify a Clerk session JWT and return the user ID (sub claim)."""
    jwks_data = await _get_jwks()
    public_keys = {}
    for key_data in jwks_data.get("keys", []):
        kid = key_data["kid"]
        public_keys[kid] = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")
    if kid not in public_keys:
        # Refresh JWKS cache in case keys rotated
        global _jwks_cache
        _jwks_cache = None
        jwks_data = await _get_jwks()
        for key_data in jwks_data.get("keys", []):
            public_keys[key_data["kid"]] = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
        if kid not in public_keys:
            raise ValueError("Unknown signing key")

    payload = jwt.decode(
        token,
        key=public_keys[kid],
        algorithms=["RS256"],
        options={"verify_aud": False},
    )
    return payload.get("sub", "unknown-user")
