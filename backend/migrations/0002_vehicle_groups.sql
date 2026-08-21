-- Phase A of the Dashboard redesign: vehicle groups, for "view by group" tile config.
-- Run this in the Supabase SQL editor (or via `supabase db push`) after 0001_init.sql.

create table vehicle_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);
create index idx_vehicle_groups_workspace on vehicle_groups(workspace_id);

alter table vehicles add column group_id uuid references vehicle_groups(id) on delete set null;
create index idx_vehicles_group on vehicles(group_id);
