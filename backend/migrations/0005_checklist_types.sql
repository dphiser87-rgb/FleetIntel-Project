-- Checklist template rebuild: real Asset/Trailer targets, template type/frequency/assignment,
-- and overdue-checklist tracking.
-- Run this in the Supabase SQL editor (or via `supabase db push`) after 0004_phase2.sql.

create table assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,              -- 'asset' | 'trailer'
  name text not null,
  identifier text,                 -- asset tag / unit number
  category text,                   -- free text, e.g. "forklift", "flatbed"
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index idx_assets_workspace on assets(workspace_id);

alter table inspections alter column vehicle_id drop not null;
alter table inspections add column asset_id uuid references assets(id) on delete cascade;

alter table templates add column type text not null default 'vehicle';
alter table templates add column frequency text;
alter table templates add column assignment_scope text not null default 'all';
alter table templates add column group_id uuid references vehicle_groups(id) on delete set null;
alter table templates add column target_ids jsonb not null default '[]'::jsonb;
alter table templates add column active boolean not null default true;
alter table templates add column updated_at timestamptz;
