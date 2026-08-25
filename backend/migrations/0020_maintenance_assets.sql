-- Maintenance jobs can now target a standalone asset (forklift, generator, etc.) instead of a vehicle
-- — exactly one of vehicle_id/asset_id is required, enforced in create_maintenance.
alter table maintenance add column asset_id uuid references assets(id) on delete set null;
create index idx_maintenance_asset on maintenance(asset_id);
