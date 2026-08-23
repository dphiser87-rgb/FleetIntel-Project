-- Asset groups, mirroring vehicle_groups/driver_groups — extends the group-management feature
-- (bulk member management, color picker, audit log, summary stats) to Assets & Trailers.
-- Run after 0007_group_fields.sql.

create table asset_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text,
  category text,
  branch text,
  region text,
  cost_centre text,
  created_at timestamptz not null default now()
);
create index idx_asset_groups_workspace on asset_groups(workspace_id);

alter table assets add column group_id uuid references asset_groups(id) on delete set null;
create index idx_assets_group on assets(group_id);
