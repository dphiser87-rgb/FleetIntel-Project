-- Extends the client_submission_id idempotency pattern already used by inspections (see
-- 0009_checklist_mobile_ready.sql) to maintenance job completion and defect creation, so a mobile
-- client retrying a queued offline write after a dropped connection can't double-complete a job or
-- double-file a defect.

alter table maintenance add column client_submission_id text;
create unique index idx_maintenance_client_submission on maintenance(workspace_id, client_submission_id)
  where client_submission_id is not null;

alter table defects add column client_submission_id text;
create unique index idx_defects_client_submission on defects(workspace_id, client_submission_id)
  where client_submission_id is not null;
