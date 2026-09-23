"""Workspace lifecycle, subscription, access and plan state -- the one place any of it changes.

Phase 1 of platform billing (PLATFORM_BILLING_PHASE1_SCOPE.md). Nothing outside this module writes
the state columns added in migration 0050 or reads plan limits; route handlers call in here.

Invariants every function below keeps:

* A state change and its audit record commit together or not at all (PRD 10.4). Each transition
  runs inside `db.transaction()`; if the event insert fails, the state change rolls back with it.
* The row is locked (`FOR UPDATE`) before it is read, so two concurrent transitions serialise
  instead of each deciding from the same stale snapshot.
* Billing code never writes `security_hold`. That column is set and cleared only by
  `place_security_hold` / `lift_security_hold`, so "payment confirmation must never clear a
  security suspension" holds by construction, not by each billing path remembering to check.
* A closed workspace accepts no further transitions.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from db import fetch_one, transaction, json_dumps

TRIAL_GRACE_DAYS = 7
PAYMENT_GRACE_CHOICES = (7, 15, 30, 45, 60)

_STATE_COLS = (
    "id, name, lifecycle_status, subscription_status, access_state, security_hold, "
    "security_hold_reason, security_hold_at, security_hold_by, trial_ends_at, grace_ends_at, "
    "payment_grace_days, billing_reference, state_version"
)


class TransitionError(Exception):
    """A refused transition. `detail` is safe to return to the caller."""

    def __init__(self, detail: str, status_code: int = 409):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _require_reason(reason: str | None) -> str:
    reason = (reason or "").strip()
    if not reason:
        raise TransitionError("A reason is required for this change", 422)
    return reason


# --- effective access: the single definition -----------------------------------------------------

def effective_access(ws: dict) -> str:
    """What a workspace can actually do right now. Precedence: closed, then security hold, then the
    billing-driven access state. The only place these three are combined -- the enforcement
    middleware and anything displaying account status must go through here."""
    if ws.get("lifecycle_status") == "closed":
        return "closed"
    if ws.get("security_hold"):
        return "suspended_security"
    return ws.get("access_state") or "enabled"


def public_state(ws: dict) -> dict:
    """Account status safe to show to the workspace's own users. Carries no staff identity, and
    only the security-hold *fact*, never its internal reason."""
    return {
        "lifecycle_status": ws["lifecycle_status"],
        "subscription_status": ws["subscription_status"],
        "access": effective_access(ws),
        "trial_ends_at": ws["trial_ends_at"].isoformat() if ws.get("trial_ends_at") else None,
        "grace_ends_at": ws["grace_ends_at"].isoformat() if ws.get("grace_ends_at") else None,
    }


# --- internals -----------------------------------------------------------------------------------

async def _lock(tx, workspace_id: str, expected_version: int | None) -> dict:
    ws = await tx.fetch_one(f"select {_STATE_COLS} from workspaces where id = :id for update", id=workspace_id)
    if not ws:
        raise TransitionError("Workspace not found", 404)
    if expected_version is not None and ws["state_version"] != expected_version:
        # The caller was looking at stale data. Refuse rather than overwrite a change they
        # haven't seen (PRD 7.3: two admins update the same subscription).
        raise TransitionError(
            "This account changed since you loaded it. Refresh and try again.", 409)
    if ws["lifecycle_status"] == "closed":
        raise TransitionError("This workspace is closed and can't be changed", 409)
    return ws


async def _record(tx, ws_id: str, dimension: str, from_v, to_v, reason: str, actor: str) -> None:
    if from_v == to_v:
        return
    await tx.execute(
        "insert into workspace_state_events (workspace_id, dimension, from_value, to_value, reason, actor) "
        "values (:ws, :dim, :f, :t, :reason, :actor)",
        ws=ws_id, dim=dimension, f=None if from_v is None else str(from_v),
        t=None if to_v is None else str(to_v), reason=reason, actor=actor,
    )


async def _set(tx, ws: dict, reason: str, actor: str, **changes) -> dict:
    """Apply column changes, write one event per dimension that moved, bump the version."""
    dims = {
        "lifecycle_status": "lifecycle",
        "subscription_status": "subscription",
        "access_state": "access",
        "security_hold": "security",
        "grace_ends_at": "grace",
    }
    # state_version is always bumped, including when nothing else changes (assign_plan does this
    # so an operator holding stale data is still caught), so the clause is never empty.
    sets = ", ".join([f"{col} = :{col}" for col in changes] + ["state_version = state_version + 1"])
    row = await tx.fetch_one(
        f"update workspaces set {sets} where id = :id returning {_STATE_COLS}",
        id=ws["id"], **changes,
    )
    for col, dim in dims.items():
        if col in changes:
            await _record(tx, ws["id"], dim, ws.get(col), changes[col], reason, actor)
    return row


async def _assign_plan(tx, workspace_id: str, plan_code: str, reason: str, actor: str,
                       allow_unassignable: bool = False) -> dict:
    plan = await tx.fetch_one(
        "select code, name, vehicle_limit, user_limit, features, assignable from plan_catalogue where code = :c",
        c=plan_code,
    )
    if not plan:
        raise TransitionError(f"Unknown plan '{plan_code}'", 422)
    if not plan["assignable"] and not allow_unassignable:
        raise TransitionError(f"Plan '{plan_code}' can't be assigned to a customer", 422)

    current = await tx.fetch_one(
        "select plan_code from workspace_plan_assignments where workspace_id = :ws and effective_to is null",
        ws=workspace_id,
    )
    now = _now()
    await tx.execute(
        "update workspace_plan_assignments set effective_to = :now "
        "where workspace_id = :ws and effective_to is null",
        now=now, ws=workspace_id,
    )
    # Limits are copied onto the assignment here. Every read of a customer's limits goes to this
    # row, never the catalogue -- so editing the catalogue can't silently change a customer.
    await tx.execute(
        "insert into workspace_plan_assignments "
        "(workspace_id, plan_code, effective_from, vehicle_limit, user_limit, features, reason, assigned_by) "
        "values (:ws, :code, :now, :vl, :ul, :feat ::jsonb, :reason, :actor)",
        ws=workspace_id, code=plan["code"], now=now, vl=plan["vehicle_limit"], ul=plan["user_limit"],
        feat=json_dumps(plan["features"] or {}), reason=reason, actor=actor,
    )
    await _record(tx, workspace_id, "plan", current["plan_code"] if current else None, plan["code"], reason, actor)
    return plan


# --- plan reads: the one place limits come from --------------------------------------------------

async def current_plan(workspace_id: str) -> dict | None:
    """The workspace's effective plan and limits, read from its assignment snapshot."""
    return await fetch_one(
        "select plan_code, vehicle_limit, user_limit, features, effective_from, reason, assigned_by "
        "from workspace_plan_assignments where workspace_id = :ws and effective_to is null",
        ws=workspace_id,
    )


async def get_state(workspace_id: str) -> dict | None:
    return await fetch_one(f"select {_STATE_COLS} from workspaces where id = :id", id=workspace_id)


# --- transitions ---------------------------------------------------------------------------------

async def start_trial(workspace_id, *, days: int, plan_code: str, reason, actor,
                      expected_version: int | None = None) -> dict:
    reason = _require_reason(reason)
    if not 1 <= days <= 365:
        raise TransitionError("Trial length must be between 1 and 365 days", 422)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        # Starting a trial resets the subscription, so doing it over an unpaid balance would quietly
        # wipe the debt. Settle it (record_payment) or cancel first.
        if ws["subscription_status"] in ("payment_grace", "past_due"):
            raise TransitionError(
                "This account has an outstanding payment; resolve it before starting a trial", 409)
        await _assign_plan(tx, workspace_id, plan_code, reason, actor)
        return await _set(
            tx, ws, reason, actor,
            subscription_status="trial", access_state="enabled",
            trial_ends_at=_now() + timedelta(days=days), grace_ends_at=None,
        )


async def extend_trial(workspace_id, *, new_end: datetime, reason, actor,
                       expected_version: int | None = None) -> dict:
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        if ws["subscription_status"] not in ("trial", "trial_grace", "trial_expired"):
            raise TransitionError("Only a trial can be extended", 409)
        if new_end <= _now():
            raise TransitionError("A trial can't be extended to a date in the past", 422)
        if ws["trial_ends_at"] and new_end <= ws["trial_ends_at"] and ws["subscription_status"] == "trial":
            raise TransitionError("A trial extension must move the end date later", 422)
        await _record(tx, workspace_id, "subscription",
                      f"trial_ends_at={ws['trial_ends_at']}", f"trial_ends_at={new_end}", reason, actor)
        # Extending out of grace or expiry restores full trial access.
        return await _set(
            tx, ws, reason, actor,
            subscription_status="trial", access_state="enabled",
            trial_ends_at=new_end, grace_ends_at=None,
        )


async def convert_to_paid(workspace_id, *, plan_code: str, billing_reference: str | None, reason, actor,
                          expected_version: int | None = None) -> dict:
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        if ws["subscription_status"] not in ("trial", "trial_grace", "trial_expired"):
            raise TransitionError(
                f"Only a trial can be converted (this is '{ws['subscription_status']}')", 409)
        await _assign_plan(tx, workspace_id, plan_code, reason, actor)
        # security_hold deliberately untouched: conversion never clears a security suspension.
        return await _set(
            tx, ws, reason, actor,
            subscription_status="active", access_state="enabled",
            grace_ends_at=None, billing_reference=billing_reference or ws["billing_reference"],
        )


async def begin_payment_grace(workspace_id, *, reason, actor, expected_version: int | None = None) -> dict:
    """A paying customer has a payment problem. Access stays NORMAL for payment_grace_days --
    unlike a lapsed trial, which goes read-only."""
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        if ws["subscription_status"] != "active":
            raise TransitionError(
                f"Payment grace applies to an active subscription (this is '{ws['subscription_status']}')", 409)
        return await _set(
            tx, ws, reason, actor,
            subscription_status="payment_grace", access_state="enabled",
            grace_ends_at=_now() + timedelta(days=ws["payment_grace_days"]),
        )


async def set_payment_grace_days(workspace_id, *, days: int, reason, actor,
                                 expected_version: int | None = None) -> dict:
    reason = _require_reason(reason)
    if days not in PAYMENT_GRACE_CHOICES:
        raise TransitionError(f"Payment grace must be one of {PAYMENT_GRACE_CHOICES} days", 422)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        await _record(tx, workspace_id, "grace",
                      f"payment_grace_days={ws['payment_grace_days']}", f"payment_grace_days={days}", reason, actor)
        # Changes the policy for the next grace; a grace already running keeps its end date.
        return await _set(tx, ws, reason, actor, payment_grace_days=days)


async def record_payment(workspace_id, *, billing_reference: str | None, reason, actor,
                         expected_version: int | None = None) -> dict:
    """A payment problem is resolved. Restores billing access. Records the operator's confirmation
    and its source -- it does not claim a payment was processed; there is no gateway in Phase 1."""
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        if ws["subscription_status"] not in ("payment_grace", "past_due"):
            raise TransitionError(
                f"No outstanding payment to record (this is '{ws['subscription_status']}')", 409)
        # security_hold deliberately untouched.
        return await _set(
            tx, ws, reason, actor,
            subscription_status="active", access_state="enabled", grace_ends_at=None,
            billing_reference=billing_reference or ws["billing_reference"],
        )


async def suspend_billing(workspace_id, *, reason, actor, expected_version: int | None = None) -> dict:
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        if ws["access_state"] == "suspended_billing":
            raise TransitionError("Already suspended for billing", 409)
        return await _set(tx, ws, reason, actor, access_state="suspended_billing")


async def reactivate_billing(workspace_id, *, reason, actor, expected_version: int | None = None) -> dict:
    """Lift a billing hold by operator decision. Never touches a security hold, and never marks a
    trial or unpaid subscription 'active' on its own -- that takes convert_to_paid / record_payment.
    PRD 5.1: 'recalculate holds; never blindly mark Active'."""
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        if ws["access_state"] == "enabled":
            raise TransitionError("Billing access is already enabled", 409)
        return await _set(tx, ws, reason, actor, access_state="enabled")


async def place_security_hold(workspace_id, *, reason, actor, expected_version: int | None = None) -> dict:
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        if ws["security_hold"]:
            raise TransitionError("A security hold is already in place", 409)
        return await _set(
            tx, ws, reason, actor,
            security_hold=True, security_hold_reason=reason, security_hold_at=_now(), security_hold_by=actor,
        )


async def lift_security_hold(workspace_id, *, reason, actor, expected_version: int | None = None) -> dict:
    """The ONLY way a security hold is cleared. Billing state is left exactly as it was, so lifting a
    hold on an unpaid account lands it on its billing restriction, not on full access."""
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        if not ws["security_hold"]:
            raise TransitionError("There is no security hold to lift", 409)
        return await _set(
            tx, ws, reason, actor,
            security_hold=False, security_hold_reason=None, security_hold_at=None, security_hold_by=None,
        )


async def close_workspace(workspace_id, *, reason, actor, expected_version: int | None = None) -> dict:
    """Revokes all access. Deletes nothing -- PRD 5.1 / OPS-04: closure retains records."""
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        return await _set(tx, ws, reason, actor, lifecycle_status="closed")


async def assign_plan(workspace_id, *, plan_code: str, reason, actor,
                      expected_version: int | None = None) -> dict:
    reason = _require_reason(reason)
    async with transaction() as tx:
        ws = await _lock(tx, workspace_id, expected_version)
        await _assign_plan(tx, workspace_id, plan_code, reason, actor)
        return await _set(tx, ws, reason, actor)  # bumps the version so stale UIs are caught


async def record_initial_state(tx, workspace_id: str, *, trial_days: int | None, plan_code: str,
                               reason: str, actor: str) -> None:
    """Called from inside provisioning's own transaction, so a new workspace is never created
    without its starting state and plan recorded."""
    ws = await tx.fetch_one(f"select {_STATE_COLS} from workspaces where id = :id for update", id=workspace_id)
    await _assign_plan(tx, workspace_id, plan_code, reason, actor)
    if trial_days:
        await _set(tx, ws, reason, actor, subscription_status="trial", access_state="enabled",
                   trial_ends_at=_now() + timedelta(days=trial_days))
    else:
        await _record(tx, workspace_id, "subscription", None, ws["subscription_status"], reason, actor)


# --- the daily advance ---------------------------------------------------------------------------

_ADVANCES = [
    # (label, from subscription, deadline column, to subscription, to access, new grace_ends_at)
    ("trial_expired_to_grace", "trial", "trial_ends_at", "trial_grace", "read_only",
     f"trial_ends_at + interval '{TRIAL_GRACE_DAYS} days'"),
    ("trial_grace_to_suspended", "trial_grace", "grace_ends_at", "trial_expired", "suspended_billing", "grace_ends_at"),
    ("payment_grace_to_suspended", "payment_grace", "grace_ends_at", "past_due", "suspended_billing", "grace_ends_at"),
]


async def advance_due(now: datetime | None = None) -> dict:
    """Move every workspace whose deadline has passed. Idempotent: each step is one conditional
    UPDATE on the current state, so a retry or an overlapping run finds nothing left to move and
    writes no duplicate events (PRD 7.3). Never touches security_hold; skips closed workspaces.

    Trial grace is anchored to the trial's own expiry instant, not to when this happened to run, so
    a late tick still gives exactly seven days from expiry and the end date is deterministic."""
    now = now or _now()
    moved: dict[str, int] = {}
    async with transaction() as tx:
        for label, frm, deadline, to_sub, to_access, grace_expr in _ADVANCES:
            rows = await tx.fetch_all(
                f"""
                with due as (
                    select id, access_state as old_access, {deadline} as due_at
                    from workspaces
                    where subscription_status = :frm and {deadline} <= :now
                      and lifecycle_status <> 'closed'
                    for update
                )
                update workspaces w
                   set subscription_status = :to_sub,
                       access_state = :to_access,
                       grace_ends_at = {grace_expr},
                       state_version = w.state_version + 1
                  from due
                 where w.id = due.id
             returning w.id, due.old_access
                """,
                frm=frm, now=now, to_sub=to_sub, to_access=to_access,
            )
            for r in rows:
                reason = f"Automatic: {label.replace('_', ' ')}"
                await _record(tx, str(r["id"]), "subscription", frm, to_sub, reason, "system:daily-tick")
                await _record(tx, str(r["id"]), "access", r["old_access"], to_access, reason, "system:daily-tick")
            moved[label] = len(rows)
    return moved
