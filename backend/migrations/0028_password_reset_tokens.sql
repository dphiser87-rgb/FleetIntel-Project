-- First-party password reset: replaces reliance on Supabase's own hosted /recover email+link, whose
-- link expiry is a project-level Auth config setting (not something the service-role API can override
-- per-request) — a real 15-minute expiry requires generating and checking our own token instead.
create table password_resets (
    id uuid primary key,
    user_id uuid not null references user_profiles(id) on delete cascade,
    token_hash text not null,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);
create index password_resets_token_hash_idx on password_resets(token_hash);
create index password_resets_user_id_idx on password_resets(user_id);
