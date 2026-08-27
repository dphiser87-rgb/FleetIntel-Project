-- Feature 6's "Complete Maintenance" modal needs fields the `maintenance` table doesn't have yet:
-- Basic Information (Workshop Name, Technician, Vendor), Cost Information (External Cost — Labour/
-- Parts already exist), and Documentation uploads. All nullable/additive.
alter table maintenance add column workshop_name text;
alter table maintenance add column technician text;
alter table maintenance add column vendor text;
alter table maintenance add column external_cost numeric;
-- Array of {type, file_name, file_type, data_url} — same base64-data-URL attachment shape QuoteIn
-- already uses for quote attachments, so the frontend upload widget can be reused as-is.
alter table maintenance add column completion_documents jsonb not null default '[]'::jsonb;
