-- Phase 1 of the multi-level cost-investigation drill-down: real fuel transactions
-- and a downtime dollar-rate, replacing the old odometer-based fuel estimate.
-- Run this in the Supabase SQL editor (or via `supabase db push`) after 0002_vehicle_groups.sql.

alter table vehicles add column downtime_cost_per_hour numeric not null default 0;

create table fuel_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  driver_id uuid references drivers(id) on delete set null,
  occurred_at timestamptz not null default now(),
  litres numeric not null,
  cost numeric not null,
  location text,
  odometer integer,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index idx_fuel_logs_workspace on fuel_logs(workspace_id);
create index idx_fuel_logs_vehicle on fuel_logs(vehicle_id);
