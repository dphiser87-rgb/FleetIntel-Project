-- Adds an on_hold job status (vehicle pulled by customer, waiting on an external repair, etc.),
-- with previous_status remembering what the job was doing so /maintenance/{id}/resume can restore
-- it without the client having to track/resend it itself.
alter table maintenance add column previous_status text;
