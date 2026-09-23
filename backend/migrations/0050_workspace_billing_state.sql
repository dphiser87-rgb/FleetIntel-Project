-- Phase 1 of platform billing and access control. See PLATFORM_BILLING_PHASE1_SCOPE.md.
--
-- Until now a workspace could be created but never switched off: there was no plan, subscription,
-- billing status, trial or access state anywhere in the schema. This adds the three independent
-- dimensions from PRD section 5.1, a small plan catalogue, and an append-only transition history.
--
-- Nothing here is enforced yet. The access middleware is a separate change, deliberately landed
-- after this one, so the columns can be inspected on real data before anything reads them to deny
-- a request.

-- ---------------------------------------------------------------------------------------------
-- 1. State on workspaces
--
-- Defaults are the "fully working" state on purpose. `add column ... not null default` backfills
-- every existing row, and both insert paths (provision_workspace and the startup seed) rely on
-- column defaults, so existing customers and anything created by an insert that predates this
-- change come out open / active / enabled. A wrong default here is not a revenue leak, it is an
-- outage: defaulting subscription_status to 'trial' would read every current customer as a lapsed
-- trial the moment enforcement ships.
-- ---------------------------------------------------------------------------------------------

alter table workspaces
  add column lifecycle_status text not null default 'open'
    check (lifecycle_status in ('onboarding', 'open', 'closed')),

  -- trial          in trial
  -- trial_grace    trial ended; 7 days read-only
  -- trial_expired  trial grace ran out without conversion
  -- active         paying
  -- payment_grace  payment problem; normal access for payment_grace_days
  -- past_due       payment grace ran out
  -- cancelled      ended by the customer or FleetIntel
  add column subscription_status text not null default 'active'
    check (subscription_status in
      ('trial', 'trial_grace', 'trial_expired', 'active', 'payment_grace', 'past_due', 'cancelled')),

  -- Billing-driven access only. A security hold is NOT one of these values -- see security_hold.
  add column access_state text not null default 'enabled'
    check (access_state in ('enabled', 'read_only', 'suspended_billing')),

  -- Kept apart from access_state so billing code has no column it could write that would lift it.
  -- "Payment confirmation must never clear a security suspension" then holds by construction
  -- rather than by every billing path remembering to check first. Effective access is computed in
  -- one place (workspace_access in server.py): closed, then security hold, then access_state.
  add column security_hold boolean not null default false,
  add column security_hold_reason text,
  add column security_hold_at timestamptz,
  add column security_hold_by text,

  add column trial_ends_at timestamptz,
  add column grace_ends_at timestamptz,

  -- Length of a *payment* grace. The trial grace is fixed at 7 days and is not stored.
  add column payment_grace_days integer not null default 7
    check (payment_grace_days in (7, 15, 30, 45, 60)),

  add column billing_reference text,

  -- Optimistic concurrency guard (PRD 6.3). Every transition increments it; a transition carrying a
  -- stale version is rejected instead of silently overwriting a concurrent change.
  add column state_version integer not null default 0;

-- The daily tick looks for trials and graces whose deadline has passed.
create index workspaces_trial_due_idx on workspaces (trial_ends_at) where subscription_status = 'trial';
create index workspaces_grace_due_idx on workspaces (grace_ends_at)
  where subscription_status in ('trial_grace', 'payment_grace');


-- ---------------------------------------------------------------------------------------------
-- 2. Plan catalogue
--
-- Deliberately no prices. Phase 1 defers pricing, and PRD 4.2 gates financial fields behind
-- billing.read -- a price column here would put them on the same read path as plan names.
-- ---------------------------------------------------------------------------------------------

create table plan_catalogue (
  code          text primary key check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name          text not null,
  vehicle_limit integer check (vehicle_limit is null or vehicle_limit >= 0),  -- null = unlimited
  user_limit    integer check (user_limit is null or user_limit >= 0),
  features      jsonb not null default '{}'::jsonb,
  -- Retired plans stay for history and existing assignments; they just can't be newly assigned.
  assignable    boolean not null default true,
  created_at    timestamptz not null default now()
);

-- The one plan this migration needs: workspaces that existed before billing did. Unlimited, and
-- not assignable, so it can't be handed to a new customer by accident. Real plans are a commercial
-- decision and are not seeded here.
insert into plan_catalogue (code, name, vehicle_limit, user_limit, features, assignable)
values ('legacy', 'Legacy (pre-billing)', null, null, '{}'::jsonb, false);


-- ---------------------------------------------------------------------------------------------
-- 3. Plan assignments, with the limits snapshotted
--
-- The condition this has to satisfy: editing the catalogue must not silently change an existing
-- customer's limits. Without versioned plans, a catalogue edit would otherwise propagate straight
-- through. So limits are copied onto the assignment when it's made, and everything reads the
-- assignment, never the catalogue. Changing a customer's limits is then an explicit, audited new
-- assignment -- lightweight versioning, which is what makes deferring the full engine safe.
-- ---------------------------------------------------------------------------------------------

create table workspace_plan_assignments (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces(id) on delete cascade,
  plan_code      text not null references plan_catalogue(code),
  effective_from timestamptz not null default now(),
  effective_to   timestamptz,  -- null = the current assignment
  vehicle_limit  integer,      -- snapshot
  user_limit     integer,      -- snapshot
  features       jsonb not null default '{}'::jsonb,  -- snapshot
  reason         text not null,
  assigned_by    text not null,
  created_at     timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

-- At most one current assignment per workspace.
create unique index workspace_plan_assignments_current_uq
  on workspace_plan_assignments (workspace_id) where effective_to is null;

insert into workspace_plan_assignments
  (workspace_id, plan_code, vehicle_limit, user_limit, features, reason, assigned_by)
select id, 'legacy', null, null, '{}'::jsonb,
       'Backfilled: workspace predates platform billing', 'system:migration-0050'
from workspaces;


-- ---------------------------------------------------------------------------------------------
-- 4. Transition history -- the audit spine for section 5.1
-- ---------------------------------------------------------------------------------------------

create table workspace_state_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  dimension    text not null
    check (dimension in ('lifecycle', 'subscription', 'access', 'security', 'plan', 'grace')),
  from_value   text,
  to_value     text,
  reason       text not null,
  actor        text not null,  -- a staff email, or 'system:<job>'
  created_at   timestamptz not null default now()
);

create index workspace_state_events_ws_idx on workspace_state_events (workspace_id, created_at desc);

-- Append-only at the database, not just by convention (PRD 10.4: app credentials cannot update or
-- delete audit records). Retention cleanup, when it exists, needs its own separately-privileged
-- path that disables this deliberately -- not an app credential quietly editing history.
create function workspace_state_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'workspace_state_events is append-only (% refused)', tg_op;
end;
$$;

create trigger workspace_state_events_no_update
  before update or delete on workspace_state_events
  for each row execute function workspace_state_events_append_only();

insert into workspace_state_events (workspace_id, dimension, from_value, to_value, reason, actor)
select id, 'plan', null, 'legacy', 'Backfilled: workspace predates platform billing', 'system:migration-0050'
from workspaces;


-- RLS on, matching every other table here since 0030. The backend connects with the service role
-- and is unaffected; this closes the direct-PostgREST path for anon/authenticated clients.
alter table plan_catalogue enable row level security;
alter table workspace_plan_assignments enable row level security;
alter table workspace_state_events enable row level security;
