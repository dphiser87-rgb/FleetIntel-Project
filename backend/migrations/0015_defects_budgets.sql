-- Defect Reporting (driver/technician-reported issues, triaged separately from safety Incidents) and
-- Budget vs Actual (per-category annual budgets, keyed to maintenance.category which already carries
-- real actual_cost data).

create table defects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  category text not null default 'general',
  severity text not null default 'medium',
  description text not null,
  location text,
  reported_by uuid references user_profiles(id),
  assigned_to uuid references user_profiles(id),
  status text not null default 'open',
  resolution_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_defects_workspace on defects(workspace_id);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  category text not null,
  year int not null,
  amount numeric not null default 0,
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now(),
  unique(workspace_id, category, year)
);
create index idx_budgets_workspace on budgets(workspace_id);
