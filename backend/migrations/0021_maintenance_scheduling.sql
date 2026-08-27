-- Maintenance Scheduling & Service Reminder Module.
-- Purely additive: new tables + nullable columns on existing tables. Nothing here changes the
-- meaning of an existing row, so no backfill is required.

-- Meter type new to the platform — nothing has ever tracked engine hours before.
alter table vehicles add column engine_hours numeric;
alter table assets add column engine_hours numeric;

-- Scheduled maintenance is provenance on top of the existing one-off `maintenance` table, not a
-- parallel "events" table — a completed scheduled job is still just a `maintenance` row, so it
-- keeps every bit of cost/status/completion logic (auto-downtime, odometer guard, quotes, PDF
-- export, etc.) added earlier without duplicating any of it.
alter table maintenance add column schedule_id uuid;
alter table maintenance add column engine_hours numeric;

-- Defects gain the same vehicle/asset polymorphism `maintenance` already has, plus a link back to
-- the maintenance job it was converted into — needed for Feature 7's cascade close.
alter table defects add column asset_id uuid references assets(id) on delete set null;
alter table defects add column maintenance_id uuid references maintenance(id) on delete set null;

-- Extensible taxonomies (seed data, not closed enums) — asset_types deliberately does NOT touch
-- vehicles.type (a closed Literal with existing call sites); it's a parallel classification used
-- only for scheduling/template matching.
create table asset_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  category text not null,        -- Vehicles | Trucks | Trailers | Equipment | Other Assets
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id, name)
);
create index idx_asset_types_workspace on asset_types(workspace_id);

create table maintenance_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  category text not null,        -- Services | Tyres | Engine | Safety | Compliance | Custom
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id, name)
);
create index idx_maintenance_types_workspace on maintenance_types(workspace_id);

create table maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  maintenance_type_id uuid not null references maintenance_types(id),
  asset_type_id uuid references asset_types(id),
  description text,
  priority text not null default 'medium',
  status text not null default 'active',   -- active | paused
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now()
);
create index idx_maintenance_schedules_workspace on maintenance_schedules(workspace_id);

-- Multi-select asset assignment — one row per (schedule, asset). vehicle_id/asset_id are mutually
-- exclusive, mirroring the maintenance table's existing polymorphism.
create table schedule_assets (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references maintenance_schedules(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete cascade,
  asset_id uuid references assets(id) on delete cascade,
  unique(schedule_id, vehicle_id, asset_id)
);
create index idx_schedule_assets_schedule on schedule_assets(schedule_id);

-- One row per trigger on a schedule — a schedule with time+distance triggers gets 2 rows here.
-- "whichever is met first" (Feature 2) is evaluated across these at read time, not stored.
create table schedule_intervals (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references maintenance_schedules(id) on delete cascade,
  trigger_type text not null,     -- time | distance | engine_hours
  every_n numeric not null,
  unit text not null              -- days|weeks|months|years (time) · km|mi (distance) · hours (engine_hours)
);
create index idx_schedule_intervals_schedule on schedule_intervals(schedule_id);

-- One row per configured alert threshold, independent per trigger type (Feature 3).
create table schedule_reminders (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references maintenance_schedules(id) on delete cascade,
  trigger_type text not null,     -- time | distance | engine_hours
  threshold_n numeric not null    -- days before (time) · distance before (distance) · hours before (engine_hours)
);
create index idx_schedule_reminders_schedule on schedule_reminders(schedule_id);

-- The live, continuously-recalculated per-asset due state that dashboard tiles/lists read from —
-- one row per (schedule, asset). Recomputed whenever a new odometer/engine-hour reading lands or
-- a maintenance job completes; a daily cron tick also refreshes time-based due dates and fires any
-- newly-crossed reminder thresholds. last_fired_thresholds prevents re-sending the same reminder.
create table schedule_due_state (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references maintenance_schedules(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete cascade,
  asset_id uuid references assets(id) on delete cascade,
  next_due_date date,
  next_due_distance numeric,
  next_due_hours numeric,
  effective_trigger_type text,    -- whichever of the above is currently the binding (earliest) one
  last_fired_thresholds jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique(schedule_id, vehicle_id, asset_id)
);
create index idx_schedule_due_state_workspace on schedule_due_state(schedule_id);

create table maintenance_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  asset_type_id uuid references asset_types(id),
  created_at timestamptz not null default now()
);
create index idx_maintenance_templates_workspace on maintenance_templates(workspace_id);

create table maintenance_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references maintenance_templates(id) on delete cascade,
  maintenance_type_id uuid not null references maintenance_types(id),
  trigger_type text not null,
  every_n numeric not null,
  unit text not null
);
create index idx_maintenance_template_items_template on maintenance_template_items(template_id);
