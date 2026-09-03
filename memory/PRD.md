# FleetCost Intelligence — PRD

## Original Problem Statement
"A SaaS cost intelligent platform. With different kpi's and also a digital vehicle checklist and once it has been completed, it can be allocated on the platform for maintenance."

## Users Choices (2026-02)
- Domain: Automotive/Fleet + Transportation/Logistics
- KPIs: all (cost per vehicle, maintenance cost, downtime, fuel, labor, utilization)
- Checklist: standard + custom template builder
- Auth: JWT (email/password)
- Seeding: yes

## Architecture
- Backend: FastAPI + Motor (MongoDB) with UUID string ids, all routes prefixed /api
- Auth: bcrypt + PyJWT, Bearer token in Authorization header, 7-day access
- Frontend: React 19 + React Router 7 + Recharts + Sonner + Phosphor icons + Tailwind (Shadcn tokens)
- Design: Dark "Swiss Brutalism / Performance Pro" — #080809 bg, #FF3B30 primary, Outfit / IBM Plex Sans / JetBrains Mono, sharp edges, grid borders

## Personas
- Admin (dphiser87@gmail.com): full access
- Manager: KPIs, allocation, reports
- Inspector: runs checklists
- Mechanic: assigned jobs on kanban

## Core Requirements (static)
- Auth (register/login/me/logout)
- Vehicles CRUD
- Checklist template builder (multi-section, multi-item, item types)
- Digital inspection form + fail-detection
- Post-inspection maintenance allocation with priority + estimated cost + mechanic
- Maintenance kanban (pending → in_progress → completed)
- KPI dashboard + trend/pie/bar charts + reports ledger

## Implemented (2026-02-13)
- Full backend API (auth, vehicles, templates, inspections, maintenance, analytics)
- Seed: 4 users, 6 vehicles, 1 template, 8 sample maintenance jobs
- Frontend pages: Login, Register, Dashboard, Fleet, VehicleDetail, Templates, TemplateBuilder, Inspection (with allocate step), Maintenance kanban, Reports
- Sidebar layout, protected routes, sonner toasts

## Implemented (2026-02 rebrand → FleetIntel, green theme)
- PDF export for inspections; Predictive cost forecast
- Mobile inspector w/ camera upload; Parts inventory w/ low-stock
- Auto-reorder emails via Resend; Cost anomaly detection
- Camera OCR (OpenAI vision, Emergent LLM Key)
- Multi-tenant workspaces + role-based invites; CSV import/export
- Audit log; Scheduled reports via Emergent cron; TOTP 2FA + recovery codes
- Driver directory w/ license expiry warnings; Investigation panel
- Public insurance portal (read-only share links)

## Implemented (2026-02-13 latest — E2E tested iteration_4)
- Configurable Dashboard KPI tiles (9 tiles, localStorage persistence, reset-to-default)
- Unified live alerts bar + anomaly alerts + parts alerts on dashboard
- Vehicle Timeline (chronological inspections/maintenance/incidents on VehicleDetail)
- Cost Split — driver_id on maintenance records + analytics grouping
- Incident Reports — POST/GET/DELETE /api/incidents, UI via VehicleDetail modal + timeline

## Backlog / Next (P1/P2)
- P2: Standalone /incidents index page + sidebar link (currently only via VehicleDetail)
- P2: Cross-device KPI tile prefs (server-side /api/users/me/prefs vs localStorage)
- P2: PATCH /api/incidents/{id} for editing incidents post-creation
- P2: Refactor server.py (1787 lines) into routers/ (auth, fleet, maintenance, incidents, analytics)
- P2: Consolidate Dashboard alert rendering into single AlertsPanel component

## Implemented (2026-02-13 iteration 5 — 4 additional features)
- **Server prefs**: GET/PUT `/api/users/me/prefs` — Dashboard KPI tile choices persist per-user, cross-device (no more localStorage)
- **Edit Incidents**: PATCH `/api/incidents/{id}` (severity, kind, driver, description, location, cost, resolution_notes, resolved) + full edit modal on `/incidents` page
- **Fleet Health Score**: GET `/api/analytics/fleet-health` blends inspection fails, maintenance backlog, incidents (90d), driver license expiry into 0-100 score with factor breakdown; Fleet page shows health pill + factors, sorts worst-first by default
- **Incidents Index Page**: New `/incidents` route + sidebar link — stats bar, severity/kind/driver/search filters, driver breakdown, CSV export

## Implemented (2026-02-14 iteration 6 — 4 additional features)
- **Vehicle Health Trend**: `_score_vehicle` refactored to accept `as_of`; new endpoint `GET /api/analytics/vehicle/{vid}/health-trend?days=30` backfills daily score from history. VehicleDetail renders recharts LineChart with ReferenceLines at 80/55 and current-score readout.
- **Incident Photos Lightbox**: `/incidents` rows show thumbnail strip (4 max + "+N" badge); full-screen viewer with next/prev buttons, ArrowLeft/Right keys, Esc to close, counter "N / M".
- **Auto-Assign Driver**: Report-incident modal on VehicleDetail pre-selects the vehicle's currently-assigned driver and shows an "auto-filled from vehicle" hint; syncs when drivers load after modal opens.
- **Health Alerts (weekly digest)**: `_send_health_digest` composes a Resend email of at-risk/watch vehicles with top 3 factors each; manual trigger via `POST /api/workspace/send-health-digest`. (Scheduling mechanism superseded 2026-09-03 — see below.)

## Implemented (2026-09-03 — Emergent platform migration cleanup)
- Removed all remaining Emergent-platform branding/tooling: `frontend/public/index.html`'s title,
  meta description, the preview-mode debug logger script, and the Emergent-hosted PostHog analytics
  block (was sending real user session recordings to Emergent's own infra, not anything self-hosted);
  `@emergentbase/visual-edits` dev tool (craco.config.js + package.json); `.emergent/` and
  `test_result.md` (platform housekeeping, not app code).
- **Cron scheduling migrated to Vercel Cron Jobs** (`vercel.json`): `.emergent/crons.yml`'s scheduler
  only ever ran inside Emergent's own hosting pods, so it (and the three scheduled emails it drove)
  had already gone silently inert since the move to Vercel — confirmed via `WEBHOOK_CRON_SECRET`
  being unset in production (the cron endpoints were 401-ing unconditionally, cron or manual). Fixed:
  `WEBHOOK_CRON_SECRET`/`CRON_SECRET` set in Vercel prod env; a single `/api/cron/daily-tick`
  (07:00 UTC) now drives all three digests via the due-check below. `/api/cron/weekly-digest` and
  `/api/cron/overdue-checklists` stay as separate endpoints for manual/testing use (same due-check
  logic) but nothing schedules them directly anymore -- 1 total Vercel cron job, well under Hobby's
  2-job cap.
- **Configurable digest frequency, all three digests** (closes the P2 item below in full): generalized
  from the health-digest-only version. `notification_prefs` gained `<digest>_frequency`
  (daily/weekly/monthly/quarterly) and `<digest>_last_sent_at` per digest
  (weekly_digest/health_digest default weekly, overdue_checklists defaults daily, matching each
  digest's original fixed schedule); shared `_digest_due()`/`_mark_digest_evaluated()` helpers
  evaluate all three every daily tick instead of each running on its own fixed schedule. Note: this
  means weekly-cadence digests now fire ~7 days after each workspace's own last send rather than
  always on a calendar Monday -- timing drifts per workspace instead of being globally synchronized,
  which is expected given the point was making cadence configurable per workspace. Picker (all four
  frequencies) added to Settings.jsx's notification-preferences card for all three digests, not just
  health-digest.
- **OCR migrated to Anthropic (Claude Haiku 4.5)**: replaced `emergentintegrations`'s OpenAI-via-proxy
  call with a direct `anthropic.AsyncAnthropic` vision call (same plate/odometer prompts, same
  response parsing). `ANTHROPIC_API_KEY` env var (not yet set in Vercel prod as of this writing --
  pending the user providing a real key; endpoint 503s gracefully until then, same pattern as
  before). `anthropic==1.3.0` added to requirements.txt. Verified request-shape correctness against
  the real API using a fake key (got a clean 401 AuthenticationError, not a shape/validation error).

## Backlog / Next (P1/P2)
- P1: Refactor server.py (~2020 lines) into routers/ (auth, fleet, incidents, analytics, prefs, digests)
- P2: Aggregate incidents enrichment via `$lookup` once fleet scales past a few hundred rows
- P2: Persist daily health snapshots so trend survives event deletions
- P2: Per-digest recipient lists (still just the workspace owner for all three) -- configurable
  frequency itself is done as of 2026-09-03, see above
- P0: Set ANTHROPIC_API_KEY in Vercel prod once the user provides a real key -- OCR code is done but
  inert without it
  the feature if not worth the replacement cost
