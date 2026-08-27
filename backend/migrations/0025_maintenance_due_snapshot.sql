-- Feature 10's Maintenance Compliance report (Completed On Time / Late / Missed) needs to know what
-- the due date WAS at the moment a scheduled job was opened — schedule_due_state only holds the
-- CURRENT due state, which moves forward on every completion, so it can't answer "was this specific
-- past job late" after the fact. Snapshotting it once, at job creation, makes compliance reporting a
-- simple completed_at vs due_at_creation comparison with no historical-state reconstruction needed.
alter table maintenance add column due_at_creation date;
