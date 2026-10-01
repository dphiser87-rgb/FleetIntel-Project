# Platform billing & access control — Phase 1 gap assessment

Scope: the revenue-critical slice of `FleetIntel_Platform_Admin_Console_PRD` v1.1 — §5.1 independent
lifecycle/subscription/access states, plus enforcement. **Not** the full ten-section console.

Assessment only. No code written. Discovery run 2026-09-23 against `marketing-design-b` @ `835162e`.
Section 6 decisions signed off by the product owner on the same date and folded in below.

---

## 1. What exists today

| PRD concept | Reality in the repo |
|---|---|
| Company record | `workspaces` = `id`, `name`, `owner_email`, `created_at`, plus operational settings (currency, lockout, logo, alert emails) |
| Plan / entitlements | **Nothing.** No table, no column, no code |
| Subscription / billing status | **Nothing.** Zero matches for `subscription`/`plan_id`/`billing_status` across all 49 migrations |
| Trial | **Nothing** |
| Access state | **Nothing.** No workspace-level flag is consulted anywhere before a request |
| Tenant provisioning | **Exists** — `POST /admin/workspaces` (`provision_workspace`, `server.py:825`), gated by `require_platform_owner` |
| Platform staff identity | Partial — `PLATFORM_OWNER_EMAIL` + `require_platform_owner`, fail-closed when unset. Single identity, no roles |
| MFA | TOTP enrol/verify/disable exists for tenant users; **not mandatory**, and no platform-side enforcement |
| Audit | `audit_log` + `log_event()`, **best-effort** (try/except swallows failures) |

**Consequence:** a workspace can be created but never switched off. Every tenant that has ever existed
is permanently and equally enabled.

---

## 2. State model

Three independent dimensions on `workspaces`, per §5.1. Not one overloaded status column — security
holds must outrank billing changes, and **payment confirmation must never clear a security
suspension**, which a single column cannot express.

**Two distinct grace periods, with different access consequences.** This is the correction that most
shapes the design:

| Cause | Subscription status | Access during grace | Duration | Then |
|---|---|---|---|---|
| Trial expires | `TrialGrace` | **Read Only** | 7 calendar days (fixed) | `SuspendedBilling` |
| Payment issue | `PaymentGrace` | **Normal (Enabled)** | selectable 7 / 15 / 30 / 45 / 60 days | `SuspendedBilling` |

A paying customer with a card problem keeps working. A lapsed trial does not. Same word, opposite
behaviour — which is exactly why access state cannot be derived from subscription status.

Columns: `lifecycle_status`, `subscription_status`, `access_state`, `trial_ends_at`, `grace_ends_at`,
`payment_grace_days`, `plan_code`, `billing_reference`.

---

## 3. Enforcement — two modes, not one

**My earlier proposal was wrong.** I assumed one method-aware rule (block writes, allow reads). The
signed-off allowlist blocks *reads* too under suspension, so there are two distinct modes:

| Mode | Rule |
|---|---|
| **Read Only** (trial grace) | Allow `GET` broadly. Block `POST/PATCH/PUT/DELETE` |
| **Suspended Billing** | Block nearly everything, **reads included**. Permit only an explicit route allowlist |

Suspension therefore needs an **allowlist of permitted routes**, not a blocklist of forbidden ones —
fail-closed, so any route added later is denied by default until someone decides otherwise.

### Permitted under Suspended Billing (signed off)

- Account suspension notice and account status
- Billing information and renewal/reactivation requests — **customer billing roles only** (role check
  *inside* the allowlist, not merely route matching)
- The user's permitted support tickets, replies and support attachments — via their own protected
  endpoints, separate from fleet attachment paths
- The user's own profile security: MFA, password recovery, logout

### Blocked under Suspended Billing

Fleet dashboards, operational records, reports, exports, fleet attachments, integrations and
operational API calls.

### Where it goes

**ASGI middleware, not per route.** There are **116 write endpoints** (75 POST, 18 PATCH, 3 PUT, 20
DELETE) and **90 GET**, and they do not share a dependency — a mix of `get_current_user`,
`require_module(...)`, `require_role(...)`. But `require_module` and `require_role` both
`Depends(get_current_user)`, so that is the universal choke point.

Editing 206 routes is strictly worse: 206 chances to miss one, and every future route is a new chance.
Middleware gives complete coverage in one place. Unauthenticated paths (`/auth/*`,
`/support/inbox/*` shared-secret, `/cron/*`) bypass, since they carry no tenant user.

### 3.1 Mobile is blocked on the same terms — no carve-outs

FleetHub calls the same `/api` surface through `api_client.dart`, so the middleware covers it with no
mobile-specific work. Every operational mobile endpoint falls outside the allowlist naturally and is
therefore denied: `/inspections`, `/maintenance`, `/escalations`, `/quotes`, `/parts-requisitions`,
`/purchase-orders`, `/suppliers`, `/users/me/vehicle-assignment`,
`/analytics/executive-dashboard/*`.

The web allowlist carve-outs are effectively unreachable from mobile anyway: the app has no billing or
support UI, and drivers are not billing roles.

**Two consequences that do need deciding and building:**

**(a) Sign-in should succeed; everything after it should not.** Blocking `/auth/login` outright gives a
driver a bare credential failure with no way to learn why. Recommended instead: let sign-in succeed,
have `/auth/me` report the access state, and have the app show a hold screen while every operational
call returns the hold status. That satisfies "blocked in all" operationally *and* §5.1's requirement to
explain the hold. This is a policy choice, easily inverted — say so if you want login itself refused.

`/auth/me` must therefore be on the allowlist **and** must expose access state, which it does not
today.

**(b) §4.1 moves from "before distribution" to hard prerequisite.** Blocking mobile guarantees FleetHub
receives hold responses, and the current outbox deletes the queued record on any non-401. Until that
is fixed, enabling suspension is equivalent to deleting suspended customers' unsynced field work.
Undistributed today, so nothing is at risk yet — but this now gates first distribution absolutely,
rather than being good hygiene.

---

## 4. Mobile — not a Phase 1 dependency (verified)

FleetHub is **not distributed**: `pubspec.yaml` is `version: 1.0.0+1` (never incremented, Flutter
scaffold default), there is no signing keystore, no `key.properties`, no `google-services.json` and no
store configuration. Per the signed-off rule, mobile release is therefore **not a dependency for web
suspension**. Build server-side enforcement now.

Two things must still be true before FleetHub ever reaches a real customer:

### 4.1 🔴 The outbox destroys queued work on any server rejection

`mobile/lib/core/db/outbox_repository.dart:62-66`

```dart
if (e.response?.statusCode == 401) return FlushOutcome.authExpired;
if (e.response == null) return FlushOutcome.networkDown;
// A real server-rejected error: retrying won't help, drop it.
await (_db.delete(_db.outboxEntries)..where((t) => t.id.equals(row.id))).go();
```

Any non-401 response deletes the queued record. Once the server returns a hold status, every unsynced
inspection, maintenance update and requisition on a mechanic's phone is **silently destroyed** —
contradicting §5.1's requirement to preserve unsent work and revalidate after reactivation.

**The correct scope is wider than billing, and it is a live bug today.** The drop is deliberate — the
comment reasons that "anything else is a real server rejection the client already should have
validated against". That holds for validation errors and is wrong for everything else the branch
catches: `403`, `423`, `429` and **every `5xx`**. A transient server fault currently destroys a
mechanic's inspection.

It has also become *more* likely to fire: the `require_module` gates added in the 2026-09-23 security
pass turn previously-allowed calls into `403`s, and each one now silently deletes queued work.

`SyncStatus` tracks only `pendingCount` and `authExpired` — there is **no failed state**, so a dropped
record leaves no user-visible trace at all.

Fix shape — an outcome taxonomy, not a single extra status code:

| Response | Behaviour |
|---|---|
| `401` | Stop the flush (existing behaviour, correct) |
| `423` hold, `429`, `408`, any `5xx`, network | **Retain and retry.** Transient or policy; retrying is right |
| `400` / `422` genuine validation | **Retain and mark failed.** Do not loop, but never silently delete |

Plus a `failedCount` on `SyncStatus` so unsynced work is visible rather than vanishing.

**Sequencing:** fully decoupled from the backend state model — it needs no new columns and can be
built and tested first. Recommended to do it first for that reason: small, self-contained, and it
removes a data-loss path that exists right now regardless of billing.

### 4.2 There is no minimum-version mechanism — add one before first distribution

No version gate exists anywhere: the app sends no version header and the server enforces nothing.
Without it there is **no way to require a minimum supported FleetHub version later**, so a build with
the §4.1 bug could stay in the field indefinitely with no lever to retire it.

Adding a version header plus a server-side minimum is trivial *now* and impossible retroactively for
already-installed builds. Do it before the first release, not after.

---

## 5. Background jobs

`/cron/daily-tick` (`server.py:6919`, wired in `vercel.json`), `/cron/maintenance-reminders`, and
`/workspace/send-digest`, `send-spend-digest`, `send-health-digest`. These authenticate with
`WEBHOOK_CRON_SECRET`, not a user, and iterate workspaces.

§5.1 requires queued jobs to recheck access immediately before execution. None do — a suspended
customer would keep receiving digests and reminder emails.

---

## 6. Signed-off decisions

1. **Trial grace** — 7 calendar days, read-only. View existing records, reach billing and support; no
   create/edit/delete/upload of fleet data. Then Suspended Billing.
2. **Payment grace** — selectable 7/15/30/45/60 days, **normal access** while resolving.
3. **Suspension allowlist** — as §3 above.
4. **Mobile** — not a dependency while undistributed; compatibility verification required before
   enabling automatic suspension for real customers.
5. **Plan model** — simplified, as §7.

Retained in Phase 1 regardless: mandatory MFA, tenant isolation, permissions, audit capture and
suspension enforcement.

---

## 7. Plan model — deliberate Phase 1 deviation from §3.4

A validated `plan_code` referencing a small server-side plan catalogue. The full versioned entitlement
engine is deferred. Conditions, all binding:

- Subscription status and access state stay **separate** from `plan_code`
- Plan assignments and changes stored with **effective dates and audit history**
- Plan checks live in **one server-side service** — never scattered across UI components
- **Catalogue edits must not silently change existing customers' limits**

That last condition needs a mechanism, since without versioning a catalogue edit would otherwise
propagate. Proposal: **snapshot the effective limits onto the subscription record at assignment time**
and read from the snapshot, not the catalogue. Changing a customer's limits then becomes an explicit,
audited re-assignment. This is lightweight versioning in all but name, and it is what makes the
deferral safe rather than merely postponed.

Deferred: custom overrides, scheduled migrations, complex pricing.

---

## 8. Phase 1 build set

**Migration** (additive; next number is `0050_`)
- `workspaces`: the state columns in §2
- `workspace_state_events`: append-only transition history — actor, from/to per dimension, reason,
  timestamp. The audit spine for §5.1
- `plan_catalogue` + limit snapshot on the subscription record (§7)

**Backend**
- Two-mode access middleware (§3) with fail-closed allowlist
- Access state loaded in `get_current_user` (already loads the profile — extend the query, don't add a
  round trip)
- Mandatory MFA enforcement for platform access (§10.1 SEC-01)
- Transactional audit capture for state transitions (§10.4 SEC-10) — today's `log_event` swallows
  failures, which cannot stand for suspension events
- Platform-owner endpoints to drive transitions: suspend, reactivate, set plan, start/extend trial,
  convert. **No console UI in Phase 1**
- Idempotent daily-tick job: trial expiry → trial grace → suspend; payment grace → suspend
- Jobs skip held workspaces (§5)

**Mobile** (does not block backend work; hard prerequisite for first distribution)
- Outbox retains on hold status (§4.1) — now mandatory, since mobile is blocked on the same terms
- Hold screen driven by access state from `/auth/me` (§3.1a)
- Version header + server-side minimum supported version (§4.2)

**Tests** — `backend/tests/` is a live-API `requests` suite (32 tests). Negative tests fit that
pattern: suspended tenant blocked on read *and* write; allowlist reachable, and billing routes denied
to non-billing roles; security hold survives billing reactivation; trial grace allows reads but blocks
writes; payment grace allows normal access; job skips held tenant.

---

## 9. Explicitly out of Phase 1

Console UI, Platform Health, usage analytics, feature flags, the six-role platform RBAC matrix (§4),
tenant-access consent sessions (§5.2, §10.2), tamper-evident audit infrastructure beyond transactional
capture (§10.4), payment gateway integration. All valuable; none gate revenue.
