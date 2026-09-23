-- There was no rate limiting on /auth/login at all: the per-account lockout
-- (workspaces.lockout_enabled) defaults to false and only ever fires for an email that already
-- resolves to a profile, so password spraying and credential stuffing were both unthrottled.
--
-- Keyed by client IP rather than email so it also covers attempts against addresses that don't
-- exist -- the enumeration-resistant path the account lockout can't see. Vercel's functions don't
-- share memory between invocations, so this has to live in the database, not a process-local dict.
create table if not exists login_attempts (
    id   uuid primary key,
    ip   text        not null,
    at   timestamptz not null default now()
);

create index if not exists login_attempts_ip_at_idx on login_attempts (ip, at desc);
