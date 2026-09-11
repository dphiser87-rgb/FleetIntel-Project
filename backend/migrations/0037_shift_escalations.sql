-- Driver overdue-inspection escalation: a workspace-wide shift cutoff hour and alert email
-- (admin/manager-configured on the web Settings page), plus a per-driver-per-day flag raised by the
-- mobile app when a driver hasn't logged today's pre-trip inspection by that cutoff.
alter table workspaces add column shift_start_hour smallint not null default 9;
alter table workspaces add column overdue_alert_email text;

create table escalations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  driver_id uuid not null references user_profiles(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  date date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (driver_id, date)
);
create index idx_escalations_workspace on escalations(workspace_id, date);

-- New 2D visual-inspection template type: a tap-diagram alternative to the parked 3D flow, replacing
-- what asset_class-flagged templates route to. Parallel to node_checklist (kept, unused, untouched) --
-- visual_parts carries x/y hotspot coordinates node_checklist never did.
alter table templates add column visual_parts jsonb;
