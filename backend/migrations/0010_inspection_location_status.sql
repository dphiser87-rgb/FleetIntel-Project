-- Distinguishes "location genuinely wasn't captured" outcomes (permission denied, GPS unavailable,
-- never attempted) from a resolved address/lat-lon pair, so the web detail view can show the real
-- reason instead of a single ambiguous "Not captured" placeholder.

alter table inspections add column location_status text not null default 'not_attempted';
