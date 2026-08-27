-- Close Supabase's "RLS Disabled in Public" security-advisor findings on every public-schema table.
--
-- FleetIntel enforces workspace isolation entirely in the application layer (server.py's ws_filter()
-- helper on every query), and the backend connects to Postgres as the `postgres` role, which has
-- rolbypassrls = true — so enabling RLS here does not change any behavior for the app itself; every
-- existing query keeps working exactly as before.
--
-- What this closes: Supabase auto-exposes every public table over its PostgREST REST API using the
-- `anon`/`authenticated` roles. Those roles are NOT used anywhere in this app today (the frontend only
-- talks to the FastAPI backend, never to Supabase's REST API directly), but leaving RLS disabled means
-- that if the anon key were ever exposed or PostgREST access ever adopted, those roles could read/write
-- these tables directly, bypassing ws_filter() entirely. Enabling RLS with no policies makes that
-- default-deny for anon/authenticated, while leaving the app (postgres role) untouched.
alter table asset_groups enable row level security;
alter table asset_types enable row level security;
alter table assets enable row level security;
alter table audit_log enable row level security;
alter table budgets enable row level security;
alter table defects enable row level security;
alter table driver_groups enable row level security;
alter table drivers enable row level security;
alter table email_log enable row level security;
alter table fuel_logs enable row level security;
alter table incidents enable row level security;
alter table inspections enable row level security;
alter table invites enable row level security;
alter table maintenance enable row level security;
alter table maintenance_schedules enable row level security;
alter table maintenance_template_items enable row level security;
alter table maintenance_templates enable row level security;
alter table maintenance_types enable row level security;
alter table notifications enable row level security;
alter table parts enable row level security;
alter table parts_history enable row level security;
alter table password_resets enable row level security;
alter table purchase_orders enable row level security;
alter table quotes enable row level security;
alter table recovery_codes enable row level security;
alter table report_definitions enable row level security;
alter table schedule_assets enable row level security;
alter table schedule_due_state enable row level security;
alter table schedule_intervals enable row level security;
alter table schedule_reminders enable row level security;
alter table templates enable row level security;
alter table trip_logs enable row level security;
alter table user_profiles enable row level security;
alter table vehicle_groups enable row level security;
alter table vehicles enable row level security;
alter table workspaces enable row level security;
