-- login_attempts was created in 0047 without row-level security, the only table in public without it
-- (flagged by the Supabase security advisor as rls_disabled_in_public). With the default Supabase
-- grants, anyone holding the project's public anon key had full SELECT / INSERT / UPDATE / DELETE /
-- TRUNCATE on it through PostgREST. That is worse than a data leak for this particular table: it
-- backs the login rate limiter, so an attacker could delete their own failed attempts and bypass the
-- brute-force protection entirely, or insert fake ones to lock other people out.
--
-- The backend reaches it over the direct Postgres connection, which bypasses RLS like it does for
-- every other table here, so the limiter is unaffected. No policies are added: nothing outside the
-- backend has any business touching this table.
alter table login_attempts enable row level security;

-- Belt and braces: RLS with no policy already denies anon/authenticated, but the table grants are
-- what let PostgREST expose it at all, and nothing legitimate uses them.
revoke all on table login_attempts from anon, authenticated;
