-- Richer group metadata for the upgraded group-management panels (bulk member management,
-- WCAG-checked color picker, live summary stats). Run after 0006_driver_groups.sql.

alter table driver_groups add column description text;
alter table driver_groups add column department text;
alter table driver_groups add column region text;
alter table driver_groups add column cost_centre text;

alter table vehicle_groups add column fleet_type text;
alter table vehicle_groups add column branch text;
alter table vehicle_groups add column region text;
alter table vehicle_groups add column cost_centre text;
