-- Phase 2 of the drill-down/dashboard work: maintenance categorization (for Tyre Cost),
-- and real trip logging (for Trips per Vehicle).
-- Run this in the Supabase SQL editor (or via `supabase db push`) after 0003_fuel_logs.sql.

alter table maintenance add column category text;

create table trip_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  occurred_at timestamptz not null default now(),
  distance_km numeric not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index idx_trip_logs_workspace on trip_logs(workspace_id);
create index idx_trip_logs_vehicle on trip_logs(vehicle_id);
