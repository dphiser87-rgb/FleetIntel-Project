-- Feature 9's reminder engine writes notifications tied to a maintenance_schedule (not necessarily
-- an existing maintenance job), so notifications needs a second, independent FK alongside the
-- existing related_maintenance_id — both nullable, a row only ever populates one.
alter table notifications add column related_schedule_id uuid references maintenance_schedules(id) on delete cascade;
