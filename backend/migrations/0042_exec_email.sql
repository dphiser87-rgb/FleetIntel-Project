-- Executive board-email recipient (falls back to finance_email if unset, mirroring the existing
-- finance_email pattern from 0040).
alter table workspaces add column exec_email text;
