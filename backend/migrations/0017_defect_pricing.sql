-- Defect pricing: only workshop_head/operations_manager/finance (+admin) may set this, enforced in
-- create_defect/update_defect — the column itself has no restriction, access control is app-level.
alter table defects add column estimated_cost numeric not null default 0;
