-- schedule_due_state needs to remember the baseline (date/odometer/hours) each trigger is counting
-- from, separately from the computed next-due outputs — otherwise recomputing due state on every
-- request would use the asset's CURRENT odometer as the base every time, making the due point a
-- moving target instead of a fixed point that only moves on actual completion (Feature 6).
-- No existing rows in schedule_due_state yet (nothing writes to it before this checkpoint), so this
-- is a plain additive change with nothing to backfill.
alter table schedule_due_state add column base_date date;
alter table schedule_due_state add column base_odometer numeric;
alter table schedule_due_state add column base_hours numeric;
