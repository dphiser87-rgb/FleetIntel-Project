-- escalations (added in 0037, after 0030's RLS sweep) was missed by Supabase's "RLS Disabled in
-- Public" check. Same no-op-for-the-app fix as 0030: the backend connects as `postgres`
-- (rolbypassrls = true), so this only closes anon/authenticated access via PostgREST.
alter table escalations enable row level security;
