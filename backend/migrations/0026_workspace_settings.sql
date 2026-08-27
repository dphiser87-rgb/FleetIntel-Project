-- Account Settings: currency moves from a per-user preference (user_profiles.prefs.currency) to a
-- workspace-level setting, since two teammates seeing different currencies for the same client org's
-- costs was wrong. Also adds a notification_prefs gate for the three automated digest emails, which
-- previously always sent unconditionally with no opt-out.
alter table workspaces add column currency text not null default 'USD';
alter table workspaces add column notification_prefs jsonb not null default
  '{"weekly_digest": true, "health_digest": true, "overdue_checklists": true}'::jsonb;

-- Backfill from whichever existing per-user currency pref is set (preferring the admin's, if any),
-- so an existing workspace doesn't silently reset to USD the moment this ships.
update workspaces w set currency = coalesce(
  (
    select up.prefs->>'currency' from user_profiles up
    where up.workspace_id = w.id and up.prefs ? 'currency'
    order by (up.role = 'admin') desc
    limit 1
  ),
  'USD'
);
