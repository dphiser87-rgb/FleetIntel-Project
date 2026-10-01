-- How many KPI tiles a user may keep on their dashboard. NULL means the platform default (10, see
-- DEFAULT_DASHBOARD_TILE_LIMIT in server.py). Raised only by FleetIntel staff, directly in the
-- database -- there is deliberately no API or UI that writes this column, so a customer can't lift
-- their own limit:
--
--   update user_profiles set dashboard_tile_limit = 20 where email = 'someone@example.com';
alter table user_profiles
  add column if not exists dashboard_tile_limit smallint
  check (dashboard_tile_limit is null or dashboard_tile_limit between 1 and 100);
