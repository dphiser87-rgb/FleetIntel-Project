-- Teams admin module: adds the profile/status fields the Team panel needs plus a real, persisted
-- per-module permission matrix ("System Rights"). Not yet enforced on every backend route — routes
-- keep using the existing 4-role checks for this pass; this is the forward-compatible data model.

alter table user_profiles add column username text;
alter table user_profiles add column company_department text;
alter table user_profiles add column cell text;
alter table user_profiles add column additional_info text;
alter table user_profiles add column status text not null default 'active'; -- active | inactive
alter table user_profiles add column active_from date;
alter table user_profiles add column active_until date; -- null+null = unlimited
alter table user_profiles add column permissions jsonb not null default '{}'::jsonb;

-- Lets "Duplicate user" carry the source user's permissions into the new invite so they land on
-- the invited user once accepted, instead of only carrying role.
alter table invites add column permissions jsonb not null default '{}'::jsonb;
