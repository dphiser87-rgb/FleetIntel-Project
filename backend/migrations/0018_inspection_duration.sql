-- Tracks how long a driver spent on a checklist (captured client-side when the form opens), so the
-- Vehicle Checklist register can show a "Duration" column like completed_at - started_at.
alter table inspections add column started_at timestamptz;
