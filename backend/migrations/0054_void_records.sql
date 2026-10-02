-- Voiding instead of deleting.
--
-- Records with operational or financial history are never deleted. An incorrect fuel or trip entry,
-- incident, purchase order or inspection is voided instead: the row stays, marked with who voided it,
-- when and why, and every total and score leaves it out. Maintenance jobs are voided by cancelling
-- them (status 'cancelled'), which totals already ignore; they get the same three fields for the reason.
--
-- Additive and nullable: existing rows stay as they are (not voided), and code that doesn't know these
-- columns keeps working. Safe to run before or after the code that uses them is deployed.

alter table fuel_logs       add column if not exists voided_at timestamptz, add column if not exists voided_by uuid, add column if not exists void_reason text;
alter table trip_logs       add column if not exists voided_at timestamptz, add column if not exists voided_by uuid, add column if not exists void_reason text;
alter table incidents       add column if not exists voided_at timestamptz, add column if not exists voided_by uuid, add column if not exists void_reason text;
alter table purchase_orders add column if not exists voided_at timestamptz, add column if not exists voided_by uuid, add column if not exists void_reason text;
alter table inspections     add column if not exists voided_at timestamptz, add column if not exists voided_by uuid, add column if not exists void_reason text;
alter table maintenance     add column if not exists voided_at timestamptz, add column if not exists voided_by uuid, add column if not exists void_reason text;
