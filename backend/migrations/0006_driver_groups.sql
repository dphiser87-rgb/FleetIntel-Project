-- Driver groups, mirroring vehicle_groups — used for organizing drivers and for
-- future "view by driver group" drill-down breakdowns.
-- Run this in the Supabase SQL editor (or via `supabase db push`) after 0005_checklist_types.sql.

create table driver_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);
create index idx_driver_groups_workspace on driver_groups(workspace_id);

alter table drivers add column group_id uuid references driver_groups(id) on delete set null;
create index idx_drivers_group on drivers(group_id);
