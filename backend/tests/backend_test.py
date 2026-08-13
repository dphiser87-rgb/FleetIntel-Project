"""
Backend regression tests for iteration 2.

Covers:
- Auth (login)
- Fleet & related modules (vehicles list, drivers, templates, maintenance, parts, team, audit, reports, security)
- Investigation Panel endpoints (/api/investigate/{key})
- 2FA setup/enable/recovery + recovery-code login + disable
- Vehicle share link (public portal)
"""
import os
import time
import pytest
import requests
import pyotp

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://kpi-tracker-106.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "dphiser87@gmail.com"
ADMIN_PASSWORD = "admin123"


# -------------------------- fixtures --------------------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# -------------------------- auth --------------------------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and "user" in d
        assert d["user"]["email"] == ADMIN_EMAIL

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code in (400, 401)

    def test_me(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# -------------------------- module listing endpoints --------------------------
class TestModules:
    """Every sidebar module should return 200 on its list endpoint."""

    @pytest.mark.parametrize("path", [
        "/vehicles",
        "/drivers",
        "/templates",
        "/maintenance",
        "/parts",
        "/users",
        "/audit",
        "/analytics/kpi",
    ])
    def test_module_endpoint(self, auth_headers, path):
        r = requests.get(f"{API}{path}", headers=auth_headers)
        assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"

    def test_vehicles_has_data(self, auth_headers):
        r = requests.get(f"{API}/vehicles", headers=auth_headers)
        assert r.status_code == 200
        vs = r.json()
        assert isinstance(vs, list)
        assert len(vs) >= 6, f"expected >=6 vehicles, got {len(vs)}"


# -------------------------- drivers --------------------------
class TestDrivers:
    def test_create_driver_and_get(self, auth_headers):
        from datetime import datetime, timedelta
        exp = (datetime.utcnow() + timedelta(days=10)).strftime("%Y-%m-%d")
        payload = {
            "name": "TEST_Driver_A",
            "license_number": "TESTLIC-001",
            "license_expiry": exp,
        }
        r = requests.post(f"{API}/drivers", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        assert created["name"] == payload["name"]
        assert "id" in created
        did = created["id"]

        # verify persistence
        r2 = requests.get(f"{API}/drivers", headers=auth_headers)
        assert r2.status_code == 200
        found = [d for d in r2.json() if d.get("id") == did]
        assert found, "created driver missing from list"

        # driver history endpoint
        r3 = requests.get(f"{API}/drivers/{did}/history", headers=auth_headers)
        assert r3.status_code == 200

        # cleanup
        requests.delete(f"{API}/drivers/{did}", headers=auth_headers)

    def test_create_driver_empty_email(self, auth_headers):
        """Regression: empty string email must be coerced to None (was returning 422)."""
        from datetime import datetime, timedelta
        exp = (datetime.utcnow() + timedelta(days=10)).strftime("%Y-%m-%d")
        payload = {
            "name": "TEST_Driver_EmptyEmail",
            "license_number": "TESTLIC-002",
            "license_expiry": exp,
            "email": "",
        }
        r = requests.post(f"{API}/drivers", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), f"empty-email driver failed: {r.status_code} {r.text}"
        did = r.json().get("id")
        assert did
        requests.delete(f"{API}/drivers/{did}", headers=auth_headers)

    def test_create_driver_no_email_field(self, auth_headers):
        """Regression: omitting email entirely must succeed."""
        from datetime import datetime, timedelta
        exp = (datetime.utcnow() + timedelta(days=10)).strftime("%Y-%m-%d")
        payload = {
            "name": "TEST_Driver_NoEmail",
            "license_number": "TESTLIC-003",
            "license_expiry": exp,
        }
        r = requests.post(f"{API}/drivers", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), f"no-email driver failed: {r.status_code} {r.text}"
        did = r.json().get("id")
        assert did
        requests.delete(f"{API}/drivers/{did}", headers=auth_headers)


# -------------------------- investigation panel --------------------------
class TestInvestigate:
    KEYS = [
        "total_maintenance_cost",
        "cost_per_vehicle",
        "pending_jobs",
        "completed_jobs",
        "total_vehicles",
        "downtime",
        "fuel_cost",
        "utilization",
    ]

    @pytest.mark.parametrize("key", KEYS)
    def test_investigate_key(self, auth_headers, key):
        r = requests.get(f"{API}/investigate/{key}", headers=auth_headers)
        assert r.status_code == 200, f"{key} -> {r.status_code} {r.text[:200]}"
        d = r.json()
        for f in ("columns", "rows", "total", "unit"):
            assert f in d, f"key={key} missing field {f}; got {list(d.keys())}"


# -------------------------- share / public portal --------------------------
class TestSharePortal:
    def test_share_lifecycle(self, auth_headers):
        vs = requests.get(f"{API}/vehicles", headers=auth_headers).json()
        assert vs, "no vehicles"
        vid = vs[0]["id"]

        r = requests.post(f"{API}/vehicles/{vid}/share", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and "url" in d
        tok = d["token"]

        # public endpoint (no auth)
        r2 = requests.get(f"{API}/public/vehicle/{tok}")
        assert r2.status_code == 200, r2.text
        pd = r2.json()
        for f in ("vehicle", "inspections", "maintenance_history", "summary", "workspace"):
            assert f in pd, f"missing {f} in public payload"

        # revoke
        r3 = requests.delete(f"{API}/vehicles/{vid}/share", headers=auth_headers)
        assert r3.status_code in (200, 204)

        # public token should no longer resolve
        r4 = requests.get(f"{API}/public/vehicle/{tok}")
        assert r4.status_code == 404


# -------------------------- 2FA + recovery codes --------------------------
class TestTwoFactor:
    """Enable 2FA, verify recovery codes list, login with a recovery code, disable."""

    def test_2fa_full_flow(self, auth_headers):
        secret = None
        errors = []
        try:
            r = requests.post(f"{API}/auth/2fa/setup", headers=auth_headers)
            assert r.status_code == 200, r.text
            secret = r.json().get("secret")
            assert secret
            totp = pyotp.TOTP(secret)

            r2 = requests.post(f"{API}/auth/2fa/enable", headers=auth_headers, json={"code": totp.now()})
            assert r2.status_code == 200, r2.text
            d2 = r2.json()
            assert "recovery_codes" in d2
            rcs = d2["recovery_codes"]
            assert isinstance(rcs, list) and len(rcs) == 8

            r3 = requests.get(f"{API}/auth/2fa/recovery-status", headers=auth_headers)
            assert r3.status_code == 200
            s = r3.json()
            assert s.get("total") == 8 and s.get("unused") == 8

            # login with recovery code
            rc = rcs[0]
            r4 = requests.post(f"{API}/auth/login", json={
                "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "code": rc
            })
            if r4.status_code != 200 or not r4.json().get("recovery_used"):
                errors.append(f"recovery-code login expected 200+recovery_used, got {r4.status_code} {r4.text[:200]}")

            # reuse same recovery code -> should fail
            r5 = requests.post(f"{API}/auth/login", json={
                "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "code": rc
            })
            if r5.status_code != 401:
                errors.append(f"reused recovery code should return 401, got {r5.status_code}")
        finally:
            # Always disable 2FA to unblock subsequent tests
            if secret:
                time.sleep(1)
                fresh = pyotp.TOTP(secret).now()
                requests.post(f"{API}/auth/2fa/disable", headers=auth_headers, json={"code": fresh})
        assert not errors, "; ".join(errors)
