-- Captures the vehicle's odometer reading at job-creation time — required going forward, enforced in
-- create_maintenance, not just a UI hint. Also keeps vehicles.odometer current on every job creation,
-- mirroring the same pattern already used by create_inspection.
alter table maintenance add column odometer numeric;
