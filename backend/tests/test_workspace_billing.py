"""Workspace billing state service, against real Postgres.

The service leans on row locks, a CTE-driven bulk UPDATE, check constraints, a partial unique index
and an append-only trigger, so a mocked database would prove nothing. Each test instead runs inside
an outer transaction that is always rolled back. The service's own `transaction()` becomes a
savepoint on that connection, so its commit/rollback behaviour is exercised for real, and nothing
persists -- which matters here, because workspace_state_events is append-only and a test workspace
that had committed events could never be deleted from the database.

Needs SUPABASE_DB_URL (backend/.env). Unlike backend_test.py this does not go through the API.
"""
import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg
import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import db  # noqa: E402  (reads SUPABASE_DB_URL at import)
import workspace_billing as wb  # noqa: E402

pytestmark = pytest.mark.skipif(not os.environ.get("SUPABASE_DB_URL"), reason="needs SUPABASE_DB_URL")


def run(coro_fn):
    """Run one async test body inside a transaction that is rolled back afterwards."""
    async def _outer():
        conn = await asyncpg.connect(os.environ["SUPABASE_DB_URL"], ssl="require", statement_cache_size=0)
        await db._init_connection(conn)
        outer = conn.transaction()
        await outer.start()

        @asynccontextmanager
        async def savepoint():
            async with conn.transaction():
                yield db.Tx(conn)

        async def fetch_one(query, **params):
            return await db.Tx(conn).fetch_one(query, **params)

        saved = (wb.transaction, wb.fetch_one)
        wb.transaction, wb.fetch_one = savepoint, fetch_one
        try:
            await coro_fn(conn)
        finally:
            wb.transaction, wb.fetch_one = saved
            await outer.rollback()
            await conn.close()

    asyncio.run(_outer())


async def new_workspace(conn, **state) -> str:
    """A workspace created exactly as the real insert paths do: column defaults only."""
    ws_id = str(uuid.uuid4())
    await conn.execute("insert into workspaces (id, name, owner_email) values ($1, 'billing-test', 't@example.test')", ws_id)
    for col, val in state.items():
        await conn.execute(f"update workspaces set {col} = $1 where id = $2", val, ws_id)
    return ws_id


async def make_plan(conn, code="test_basic", vehicles=10, users=5) -> str:
    await conn.execute(
        "insert into plan_catalogue (code, name, vehicle_limit, user_limit, features, assignable) "
        "values ($1, 'Test basic', $2, $3, '{\"reports\": true}'::jsonb, true)",
        code, vehicles, users,
    )
    return code


async def state(conn, ws_id) -> dict:
    return dict(await conn.fetchrow(
        "select lifecycle_status, subscription_status, access_state, security_hold, trial_ends_at, "
        "grace_ends_at, payment_grace_days, state_version from workspaces where id = $1", ws_id))


async def events(conn, ws_id) -> list[dict]:
    return [dict(r) for r in await conn.fetch(
        "select dimension, from_value, to_value, actor from workspace_state_events "
        "where workspace_id = $1 order by created_at, dimension", ws_id)]


ACTOR = "ops@fleetintel.test"


# --- effective access: pure precedence ------------------------------------------------------------

@pytest.mark.parametrize("ws,expected", [
    ({"lifecycle_status": "open", "security_hold": False, "access_state": "enabled"}, "enabled"),
    ({"lifecycle_status": "open", "security_hold": False, "access_state": "read_only"}, "read_only"),
    ({"lifecycle_status": "open", "security_hold": True, "access_state": "enabled"}, "suspended_security"),
    # security outranks billing in both directions
    ({"lifecycle_status": "open", "security_hold": True, "access_state": "suspended_billing"}, "suspended_security"),
    # closure outranks everything
    ({"lifecycle_status": "closed", "security_hold": True, "access_state": "enabled"}, "closed"),
])
def test_effective_access_precedence(ws, expected):
    assert wb.effective_access(ws) == expected


def test_public_state_never_leaks_the_security_reason():
    ws = {"lifecycle_status": "open", "subscription_status": "active", "access_state": "enabled",
          "security_hold": True, "security_hold_reason": "suspected credential stuffing",
          "security_hold_by": "ops@fleetintel.test", "trial_ends_at": None, "grace_ends_at": None}
    out = wb.public_state(ws)
    assert out["access"] == "suspended_security"
    assert "suspected" not in str(out) and "ops@" not in str(out)


# --- defaults: existing and newly inserted workspaces are fully working --------------------------

def test_new_workspace_defaults_to_working_state():
    async def body(conn):
        s = await state(conn, await new_workspace(conn))
        assert (s["lifecycle_status"], s["subscription_status"], s["access_state"], s["security_hold"]) == \
            ("open", "active", "enabled", False)
    run(body)


# --- trial lifecycle ------------------------------------------------------------------------------

def test_trial_expiry_goes_read_only_then_suspends_after_seven_days():
    async def body(conn):
        plan = await make_plan(conn)
        ws = await new_workspace(conn)
        await wb.start_trial(ws, days=14, plan_code=plan, reason="new signup", actor=ACTOR)
        s = await state(conn, ws)
        assert (s["subscription_status"], s["access_state"]) == ("trial", "enabled")
        expiry = s["trial_ends_at"]

        # Not yet due: nothing moves.
        await wb.advance_due(now=expiry - timedelta(minutes=1))
        assert (await state(conn, ws))["subscription_status"] == "trial"

        # Expired: read-only grace, anchored to the expiry instant rather than to the tick.
        await wb.advance_due(now=expiry + timedelta(hours=5))
        s = await state(conn, ws)
        assert (s["subscription_status"], s["access_state"]) == ("trial_grace", "read_only")
        assert s["grace_ends_at"] == expiry + timedelta(days=7)

        # Seven days on: suspended for billing.
        await wb.advance_due(now=expiry + timedelta(days=7, minutes=1))
        s = await state(conn, ws)
        assert (s["subscription_status"], s["access_state"]) == ("trial_expired", "suspended_billing")
    run(body)


def test_converting_a_lapsed_trial_restores_access():
    async def body(conn):
        plan = await make_plan(conn)
        ws = await new_workspace(conn, subscription_status="trial_expired", access_state="suspended_billing")
        await wb.convert_to_paid(ws, plan_code=plan, billing_reference="INV-1", reason="signed", actor=ACTOR)
        s = await state(conn, ws)
        assert (s["subscription_status"], s["access_state"]) == ("active", "enabled")
    run(body)


def test_extending_a_trial_out_of_grace_restores_full_trial_access():
    async def body(conn):
        ws = await new_workspace(conn, subscription_status="trial_grace", access_state="read_only")
        new_end = datetime.now(timezone.utc) + timedelta(days=10)
        await wb.extend_trial(ws, new_end=new_end, reason="sales call", actor=ACTOR)
        s = await state(conn, ws)
        assert (s["subscription_status"], s["access_state"], s["grace_ends_at"]) == ("trial", "enabled", None)
    run(body)


def test_trial_cannot_be_extended_into_the_past():
    async def body(conn):
        ws = await new_workspace(conn, subscription_status="trial")
        with pytest.raises(wb.TransitionError):
            await wb.extend_trial(ws, new_end=datetime.now(timezone.utc) - timedelta(days=1),
                                  reason="x", actor=ACTOR)
    run(body)


# --- payment grace: NORMAL access, unlike a trial ------------------------------------------------

def test_payment_grace_keeps_normal_access():
    async def body(conn):
        ws = await new_workspace(conn, payment_grace_days=30)
        await wb.begin_payment_grace(ws, reason="card declined", actor=ACTOR)
        s = await state(conn, ws)
        assert s["subscription_status"] == "payment_grace"
        assert s["access_state"] == "enabled", "a paying customer with a card problem keeps working"
        assert abs((s["grace_ends_at"] - datetime.now(timezone.utc)) - timedelta(days=30)) < timedelta(minutes=1)
    run(body)


def test_payment_grace_expiry_suspends():
    async def body(conn):
        ws = await new_workspace(conn)
        await wb.begin_payment_grace(ws, reason="card declined", actor=ACTOR)
        grace_end = (await state(conn, ws))["grace_ends_at"]
        await wb.advance_due(now=grace_end + timedelta(seconds=1))
        s = await state(conn, ws)
        assert (s["subscription_status"], s["access_state"]) == ("past_due", "suspended_billing")
    run(body)


def test_recording_payment_restores_access():
    async def body(conn):
        ws = await new_workspace(conn, subscription_status="past_due", access_state="suspended_billing")
        await wb.record_payment(ws, billing_reference="EFT-99", reason="EFT received", actor=ACTOR)
        s = await state(conn, ws)
        assert (s["subscription_status"], s["access_state"], s["grace_ends_at"]) == ("active", "enabled", None)
    run(body)


@pytest.mark.parametrize("days", [7, 15, 30, 45, 60])
def test_payment_grace_accepts_the_agreed_lengths(days):
    async def body(conn):
        ws = await new_workspace(conn)
        await wb.set_payment_grace_days(ws, days=days, reason="policy", actor=ACTOR)
        assert (await state(conn, ws))["payment_grace_days"] == days
    run(body)


@pytest.mark.parametrize("days", [0, 1, 10, 90])
def test_payment_grace_rejects_other_lengths(days):
    async def body(conn):
        ws = await new_workspace(conn)
        with pytest.raises(wb.TransitionError):
            await wb.set_payment_grace_days(ws, days=days, reason="policy", actor=ACTOR)
    run(body)


def test_starting_a_trial_cannot_wipe_an_unpaid_balance():
    async def body(conn):
        plan = await make_plan(conn)
        ws = await new_workspace(conn, subscription_status="past_due", access_state="suspended_billing")
        with pytest.raises(wb.TransitionError, match="outstanding payment"):
            await wb.start_trial(ws, days=14, plan_code=plan, reason="x", actor=ACTOR)
    run(body)


# --- the hard rule: billing never clears a security hold ------------------------------------------

def test_recording_payment_never_clears_a_security_hold():
    async def body(conn):
        ws = await new_workspace(conn, subscription_status="past_due", access_state="suspended_billing")
        await wb.place_security_hold(ws, reason="credential stuffing", actor=ACTOR)
        await wb.record_payment(ws, billing_reference="EFT-1", reason="paid", actor=ACTOR)
        s = await state(conn, ws)
        assert s["access_state"] == "enabled"      # billing restriction lifted...
        assert s["security_hold"] is True           # ...security hold untouched
        assert wb.effective_access({**s, "lifecycle_status": "open"}) == "suspended_security"
    run(body)


def test_converting_a_trial_never_clears_a_security_hold():
    async def body(conn):
        plan = await make_plan(conn)
        ws = await new_workspace(conn, subscription_status="trial")
        await wb.place_security_hold(ws, reason="fraud review", actor=ACTOR)
        await wb.convert_to_paid(ws, plan_code=plan, billing_reference=None, reason="signed", actor=ACTOR)
        assert (await state(conn, ws))["security_hold"] is True
    run(body)


def test_reactivating_billing_never_clears_a_security_hold():
    async def body(conn):
        ws = await new_workspace(conn, access_state="suspended_billing")
        await wb.place_security_hold(ws, reason="breach", actor=ACTOR)
        await wb.reactivate_billing(ws, reason="goodwill", actor=ACTOR)
        assert (await state(conn, ws))["security_hold"] is True
    run(body)


def test_lifting_a_security_hold_lands_on_the_billing_restriction_not_full_access():
    async def body(conn):
        ws = await new_workspace(conn, subscription_status="past_due", access_state="suspended_billing")
        await wb.place_security_hold(ws, reason="breach", actor=ACTOR)
        await wb.lift_security_hold(ws, reason="investigated", actor=ACTOR)
        s = await state(conn, ws)
        assert s["security_hold"] is False
        assert wb.effective_access({**s, "lifecycle_status": "open"}) == "suspended_billing"
    run(body)


def test_billing_cannot_write_a_security_suspension_into_access_state():
    # Structural: the column's check constraint doesn't even admit the value.
    async def body(conn):
        ws = await new_workspace(conn)
        with pytest.raises(asyncpg.CheckViolationError):
            async with conn.transaction():
                await conn.execute("update workspaces set access_state = 'suspended_security' where id = $1", ws)
    run(body)


# --- the daily advance ----------------------------------------------------------------------------

def test_advance_is_idempotent_and_writes_no_duplicate_events():
    async def body(conn):
        ws = await new_workspace(conn, subscription_status="trial",
                                 trial_ends_at=datetime.now(timezone.utc) - timedelta(days=1))
        later = datetime.now(timezone.utc)
        first = await wb.advance_due(now=later)
        after_first = await events(conn, ws)
        second = await wb.advance_due(now=later)
        assert first["trial_expired_to_grace"] >= 1
        assert second["trial_expired_to_grace"] == 0
        assert await events(conn, ws) == after_first
    run(body)


def test_advance_never_touches_a_security_hold():
    async def body(conn):
        ws = await new_workspace(conn, subscription_status="payment_grace",
                                 grace_ends_at=datetime.now(timezone.utc) - timedelta(days=1))
        await wb.place_security_hold(ws, reason="breach", actor=ACTOR)
        await wb.advance_due()
        s = await state(conn, ws)
        assert s["subscription_status"] == "past_due"
        assert s["security_hold"] is True
    run(body)


def test_advance_skips_closed_workspaces():
    async def body(conn):
        ws = await new_workspace(conn, subscription_status="trial", lifecycle_status="closed",
                                 trial_ends_at=datetime.now(timezone.utc) - timedelta(days=1))
        await wb.advance_due()
        assert (await state(conn, ws))["subscription_status"] == "trial"
    run(body)


def test_advance_records_the_transition_as_the_system():
    async def body(conn):
        ws = await new_workspace(conn, subscription_status="trial",
                                 trial_ends_at=datetime.now(timezone.utc) - timedelta(hours=1))
        await wb.advance_due()
        evs = await events(conn, ws)
        assert {"dimension": "subscription", "from_value": "trial", "to_value": "trial_grace",
                "actor": "system:daily-tick"} in evs
        assert {"dimension": "access", "from_value": "enabled", "to_value": "read_only",
                "actor": "system:daily-tick"} in evs
    run(body)


# --- plans: snapshot, so catalogue edits can't change existing customers --------------------------

def test_catalogue_edits_do_not_change_an_existing_customers_limits():
    async def body(conn):
        plan = await make_plan(conn, vehicles=10, users=5)
        ws = await new_workspace(conn)
        await wb.assign_plan(ws, plan_code=plan, reason="upgrade", actor=ACTOR)
        await conn.execute("update plan_catalogue set vehicle_limit = 3, user_limit = 1 where code = $1", plan)
        p = await wb.current_plan(ws)
        assert (p["vehicle_limit"], p["user_limit"]) == (10, 5)
    run(body)


def test_reassigning_a_plan_keeps_history_with_exactly_one_current():
    async def body(conn):
        a = await make_plan(conn, code="test_a", vehicles=10)
        b = await make_plan(conn, code="test_b", vehicles=50)
        ws = await new_workspace(conn)
        await wb.assign_plan(ws, plan_code=a, reason="start", actor=ACTOR)
        await wb.assign_plan(ws, plan_code=b, reason="upgrade", actor=ACTOR)
        rows = await conn.fetch(
            "select plan_code, effective_to from workspace_plan_assignments where workspace_id = $1", ws)
        assert len(rows) == 2
        assert [r["plan_code"] for r in rows if r["effective_to"] is None] == ["test_b"]
        assert (await wb.current_plan(ws))["vehicle_limit"] == 50
    run(body)


def test_unknown_and_unassignable_plans_are_refused():
    async def body(conn):
        ws = await new_workspace(conn)
        with pytest.raises(wb.TransitionError, match="Unknown plan"):
            await wb.assign_plan(ws, plan_code="no_such_plan", reason="x", actor=ACTOR)
        with pytest.raises(wb.TransitionError, match="can't be assigned"):
            await wb.assign_plan(ws, plan_code="legacy", reason="x", actor=ACTOR)
    run(body)


# --- integrity ------------------------------------------------------------------------------------

def test_state_change_rolls_back_if_the_audit_record_cannot_be_written():
    """PRD 10.4 SEC-10: no partial success when audit capture fails."""
    async def body(conn):
        ws = await new_workspace(conn)
        real = wb._record

        async def failing_record(*a, **k):
            raise RuntimeError("audit store unavailable")

        wb._record = failing_record
        try:
            with pytest.raises(RuntimeError):
                await wb.suspend_billing(ws, reason="non-payment", actor=ACTOR)
        finally:
            wb._record = real
        s = await state(conn, ws)
        assert s["access_state"] == "enabled", "the suspension must not survive a failed audit write"
        assert s["state_version"] == 0
    run(body)


def test_stale_version_is_refused():
    async def body(conn):
        ws = await new_workspace(conn)
        await wb.suspend_billing(ws, reason="a", actor=ACTOR)  # version 0 -> 1
        with pytest.raises(wb.TransitionError, match="changed since you loaded it"):
            await wb.reactivate_billing(ws, reason="b", actor=ACTOR, expected_version=0)
        await wb.reactivate_billing(ws, reason="b", actor=ACTOR, expected_version=1)
    run(body)


def test_closed_workspace_refuses_every_transition():
    async def body(conn):
        plan = await make_plan(conn)
        ws = await new_workspace(conn)
        await wb.close_workspace(ws, reason="customer left", actor=ACTOR)
        for fn, kw in [
            (wb.suspend_billing, {}),
            (wb.place_security_hold, {}),
            (wb.assign_plan, {"plan_code": plan}),
            (wb.begin_payment_grace, {}),
        ]:
            with pytest.raises(wb.TransitionError, match="closed"):
                await fn(ws, reason="x", actor=ACTOR, **kw)
    run(body)


def test_a_reason_is_required():
    async def body(conn):
        ws = await new_workspace(conn)
        for blank in ("", "   ", None):
            with pytest.raises(wb.TransitionError, match="reason"):
                await wb.suspend_billing(ws, reason=blank, actor=ACTOR)
    run(body)


def test_every_transition_is_recorded_with_its_actor():
    async def body(conn):
        ws = await new_workspace(conn)
        await wb.suspend_billing(ws, reason="non-payment", actor=ACTOR)
        assert {"dimension": "access", "from_value": "enabled", "to_value": "suspended_billing",
                "actor": ACTOR} in await events(conn, ws)
    run(body)


def test_audit_events_cannot_be_rewritten():
    async def body(conn):
        ws = await new_workspace(conn)
        await wb.suspend_billing(ws, reason="non-payment", actor=ACTOR)
        # Each in its own savepoint: a refused statement aborts the enclosing transaction, so
        # without one the DELETE below would never actually run and this would prove nothing.
        with pytest.raises(asyncpg.RaiseError, match="append-only"):
            async with conn.transaction():
                await conn.execute("update workspace_state_events set reason = 'nothing to see' where workspace_id = $1", ws)
        with pytest.raises(asyncpg.RaiseError, match="append-only"):
            async with conn.transaction():
                await conn.execute("delete from workspace_state_events where workspace_id = $1", ws)
        # And both refusals left the record intact.
        assert await conn.fetchval("select count(*) from workspace_state_events where workspace_id = $1", ws) == 1
    run(body)
