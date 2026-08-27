-- Report Center: saved, named, reusable report definitions (name, type, filters, chosen columns) that
-- regenerate fresh data on every download rather than freezing a snapshot. Also adds the workspace's
-- report-branding logo, stored as a base64 data URL — same pattern already used for inspection/incident
-- photos and signatures elsewhere in this app, so no new file-storage infrastructure is needed.
alter table workspaces add column report_logo text;

create table report_definitions (
    id uuid primary key,
    workspace_id uuid not null references workspaces(id) on delete cascade,
    name text not null,
    report_type text not null,
    file_type text not null default 'pdf',
    page_format text not null default 'portrait',
    columns jsonb not null default '[]'::jsonb,
    filters jsonb not null default '{}'::jsonb,
    created_by uuid references user_profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_report_definitions_workspace on report_definitions(workspace_id);
