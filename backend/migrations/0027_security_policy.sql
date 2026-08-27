-- Security page settings: minimum password length (enforced at registration/invite-accept — Supabase's
-- own hosted "forgot password" email flow is outside our UI, so it isn't reachable here) and account
-- lockout after repeated failed logins.
alter table workspaces add column min_password_length integer not null default 8;
alter table workspaces add column lockout_enabled boolean not null default false;
alter table workspaces add column lockout_threshold integer not null default 5;

alter table user_profiles add column failed_login_attempts integer not null default 0;
alter table user_profiles add column locked_until timestamptz;
