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


# -------------------------- iteration 4: new features --------------------------
# Configurable KPI tiles are client-side (localStorage) so covered by UI tests.
# Backend: /api/alerts, /api/vehicles/{id}/timeline, /api/incidents, driver_id on /api/maintenance

class TestUnifiedAlerts:
    def test_alerts_shape(self, auth_headers):
        r = requests.get(f"{API}/alerts", headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for f in ("critical", "warnings", "total", "buckets", "details"):
            assert f in d, f"missing {f}: {list(d.keys())}"
        for b in ("maintenance_critical", "cost_anomalies", "license_expiring",
                  "pending_jobs", "low_stock_parts", "open_incidents"):
            assert b in d["buckets"], f"missing bucket {b}"
        assert isinstance(d["critical"], int)
        assert isinstance(d["warnings"], int)


class TestVehicleTimeline:
    def test_timeline_ok(self, auth_headers):
        vs = requests.get(f"{API}/vehicles", headers=auth_headers).json()
        assert vs
        vid = vs[0]["id"]
        r = requests.get(f"{API}/vehicles/{vid}/timeline", headers=auth_headers)
        assert r.status_code == 200, r.text
        events = r.json()
        assert isinstance(events, list)
        # allowed event types when present
        for e in events:
            assert e["type"] in ("inspection", "maintenance", "incident"), e
            assert "at" in e and "title" in e and "meta" in e


class TestIncidents:
    def _vehicle_id(self, headers):
        return requests.get(f"{API}/vehicles", headers=headers).json()[0]["id"]

    def _driver_id(self, headers):
        ds = requests.get(f"{API}/drivers", headers=headers).json()
        return ds[0]["id"] if ds else None

    def test_incident_crud_and_timeline(self, auth_headers):
        vid = self._vehicle_id(auth_headers)
        did = self._driver_id(auth_headers)
        from datetime import datetime
        payload = {
            "vehicle_id": vid,
            "driver_id": did,
            "kind": "damage",
            "severity": "moderate",
            "occurred_at": datetime.utcnow().isoformat(),
            "location": "TEST_LOC",
            "description": "TEST_INCIDENT description",
            "reported_cost": 123.45,
        }
        r = requests.post(f"{API}/incidents", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        inc = r.json()
        assert inc["vehicle_id"] == vid
        assert inc["severity"] == "moderate"
        assert inc.get("driver_id") == did
        iid = inc["id"]

        # list contains it
        lr = requests.get(f"{API}/incidents", headers=auth_headers)
        assert lr.status_code == 200
        assert any(i["id"] == iid for i in lr.json())

        # scoped by vehicle_id
        lr2 = requests.get(f"{API}/incidents?vehicle_id={vid}", headers=auth_headers)
        assert lr2.status_code == 200
        assert any(i["id"] == iid for i in lr2.json())

        # appears in vehicle timeline
        tr = requests.get(f"{API}/vehicles/{vid}/timeline", headers=auth_headers)
        assert tr.status_code == 200
        assert any(e["type"] == "incident" and e["meta"].get("id") == iid for e in tr.json())

        # delete
        dr = requests.delete(f"{API}/incidents/{iid}", headers=auth_headers)
        assert dr.status_code in (200, 204)

        lr3 = requests.get(f"{API}/incidents", headers=auth_headers)
        assert not any(i["id"] == iid for i in lr3.json())


class TestMaintenanceDriverSplit:
    def test_create_maintenance_with_driver_id(self, auth_headers):
        vid = requests.get(f"{API}/vehicles", headers=auth_headers).json()[0]["id"]
        drivers = requests.get(f"{API}/drivers", headers=auth_headers).json()
        if not drivers:
            pytest.skip("no drivers seeded")
        did = drivers[0]["id"]
        payload = {
            "vehicle_id": vid,
            "driver_id": did,
            "title": "TEST_M_driver_split",
            "description": "TEST",
            "priority": "medium",
            "estimated_cost": 250.0,
            "estimated_hours": 2,
        }
        r = requests.post(f"{API}/maintenance", headers=auth_headers, json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        mid = created["id"]
        assert created.get("driver_id") == did, f"driver_id missing on create response: {created}"

        # GET list must retain driver_id
        lr = requests.get(f"{API}/maintenance", headers=auth_headers)
        assert lr.status_code == 200
        found = [m for m in lr.json() if m["id"] == mid]
        assert found and found[0].get("driver_id") == did, f"driver_id missing on list: {found}"

        # cleanup
        requests.delete(f"{API}/maintenance/{mid}", headers=auth_headers)

