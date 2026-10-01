-- One-time, run when the user-chosen dashboard (PR #61) goes live.
--
-- Before it, every dashboard showed "Needs attention" and "Maintenance spend by month" under the KPI
-- tiles. They're now optional panels stored in the same list as the tiles, so a user with a saved
-- layout would see them vanish on deploy. This adds those two panels to each saved layout that
-- doesn't already have them, only while there's room under that user's limit (default 15). Users
-- who never saved a layout don't need this: the new default layout already includes both.
--
-- Safe to re-run: a panel already in a layout is never added twice.

update user_profiles
set prefs = jsonb_set(prefs, '{dashboard_tiles}', (prefs->'dashboard_tiles') || jsonb_build_array(jsonb_build_object(
  'key', 'w_needs_attention', 'threshold', null, 'view_by', 'none', 'group_id', null,
  'chart_type', 'trend', 'period', 'all', 'size', 'md')))
where jsonb_typeof(prefs->'dashboard_tiles') = 'array'
  and jsonb_array_length(prefs->'dashboard_tiles') > 0
  and jsonb_array_length(prefs->'dashboard_tiles') < coalesce(dashboard_tile_limit, 15)
  and not exists (
    select 1 from jsonb_array_elements(prefs->'dashboard_tiles') e
    where (case when jsonb_typeof(e) = 'object' then e->>'key' else e #>> '{}' end) = 'w_needs_attention');

update user_profiles
set prefs = jsonb_set(prefs, '{dashboard_tiles}', (prefs->'dashboard_tiles') || jsonb_build_array(jsonb_build_object(
  'key', 'w_spend_chart', 'threshold', null, 'view_by', 'none', 'group_id', null,
  'chart_type', 'trend', 'period', 'all', 'size', 'lg')))
where jsonb_typeof(prefs->'dashboard_tiles') = 'array'
  and jsonb_array_length(prefs->'dashboard_tiles') > 0
  and jsonb_array_length(prefs->'dashboard_tiles') < coalesce(dashboard_tile_limit, 15)
  and not exists (
    select 1 from jsonb_array_elements(prefs->'dashboard_tiles') e
    where (case when jsonb_typeof(e) = 'object' then e->>'key' else e #>> '{}' end) = 'w_spend_chart');
