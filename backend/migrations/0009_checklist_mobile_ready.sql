-- Makes the inspections/templates data model ready for real mobile-app submissions: capture
-- location/signature on-device, split completed-vs-received timestamps, idempotent retries, and
-- a self-contained snapshot of the template a submission was actually filled in against. Also adds
-- lightweight version-lineage columns to templates so editing an in-use template's items creates a
-- new version instead of mutating history.

alter table inspections add column completed_at timestamptz;
alter table inspections add column address text;
alter table inspections add column latitude numeric;
alter table inspections add column longitude numeric;
alter table inspections add column signature text;
alter table inspections add column client_submission_id text;
alter table inspections add column template_snapshot jsonb;
create unique index idx_inspections_client_submission on inspections(workspace_id, client_submission_id)
  where client_submission_id is not null;

alter table templates add column version int not null default 1;
alter table templates add column family_id uuid;
update templates set family_id = id where family_id is null;
alter table templates alter column family_id set not null;
