-- FleetIntel Postgres schema (Supabase)
-- Phase 1 of the Mongo -> Supabase migration. One table per former Mongo collection.
-- user_profiles.id references auth.users(id) — Supabase Auth owns identity/password.
-- Run this in the Supabase SQL editor (or via `supabase db push`) against a fresh project.

create extension if not exists pgcrypto;

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text not null,
  created_at timestamptz not null default now()
);

create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text,
  role text not null default 'admin',
  workspace_id uuid not null references workspaces(id),
  prefs jsonb not null default '{}'::jsonb,
  totp_enabled boolean not null default false,
  totp_secret text,
  totp_pending_secret text,
  created_at timestamptz not null default now()
);
create index idx_user_profiles_workspace on user_profiles(workspace_id);

create table recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  code text not null,
  used boolean not null default false,
  used_at timestamptz
);
create index idx_recovery_codes_user on recovery_codes(user_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  code text not null unique,
  email text,
  role text not null,
  invitee_name text,
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now(),
  used_by uuid references user_profiles(id),
  used_at timestamptz
);
create index idx_invites_workspace on invites(workspace_id);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  plate text,
  make text,
  model text,
  year int,
  type text,
  status text,
  odometer numeric,
  fuel_cost_per_km numeric,
  image_url text,
  share_token text unique,
  share_created_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_vehicles_workspace on vehicles(workspace_id);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  license_number text,
  license_expiry date,
  hire_date date,
  assigned_vehicle_id uuid references vehicles(id) on delete set null,
  status text,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_drivers_workspace on drivers(workspace_id);

create table templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  sections jsonb not null default '[]'::jsonb,
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now()
);
create index idx_templates_workspace on templates(workspace_id);

create table inspections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  template_id uuid references templates(id),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  notes text,
  odometer numeric,
  inspector_id uuid references user_profiles(id),
  inspector_name text,
  fail_count int not null default 0,
  status text,
  created_at timestamptz not null default now()
);
create index idx_inspections_workspace on inspections(workspace_id);
create index idx_inspections_vehicle on inspections(vehicle_id);

create table maintenance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  inspection_id uuid references inspections(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  title text not null,
  description text,
  priority text,
  status text,
  estimated_cost numeric,
  estimated_hours numeric,
  actual_cost numeric,
  downtime_hours numeric,
  parts_cost numeric,
  labor_cost numeric,
  assigned_to text,
  notes text,
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index idx_maintenance_workspace on maintenance(workspace_id);

create table parts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  sku text,
  category text,
  stock numeric not null default 0,
  reorder_point numeric,
  unit_cost numeric,
  supplier text,
  supplier_email text,
  created_at timestamptz not null default now()
);
create index idx_parts_workspace on parts(workspace_id);

create table parts_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  part_id uuid not null references parts(id) on delete cascade,
  delta numeric not null,
  reason text,
  by uuid references user_profiles(id),
  at timestamptz not null default now()
);
create index idx_parts_history_workspace on parts_history(workspace_id);
create index idx_parts_history_part on parts_history(part_id);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  kind text,
  severity text,
  occurred_at timestamptz,
  location text,
  description text,
  photos jsonb not null default '[]'::jsonb,
  reported_cost numeric,
  reporter_id uuid references user_profiles(id),
  reporter_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolution_notes text
);
create index idx_incidents_workspace on incidents(workspace_id);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references user_profiles(id),
  user_name text,
  user_email text,
  action text not null,
  entity_type text,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index idx_audit_log_workspace on audit_log(workspace_id);

create table email_log (
  key text primary key,
  at timestamptz not null default now(),
  email_id text
);
