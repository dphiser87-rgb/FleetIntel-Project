# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

FleetIntel is a fleet maintenance-cost intelligence SaaS: vehicles, drivers, inspections, maintenance
jobs, parts inventory, and incidents, with KPI/cost analytics, anomaly detection, and forecasting on top.
It's multi-tenant — every workspace's data is isolated from every other workspace's.

The repo was originally scaffolded by the **Emergent** AI app-builder platform. `.emergent/` (config,
crons, markers) and `test_result.md` (a main-agent/testing-agent handoff protocol) are platform tooling,
not application code — don't treat conventions described there as this project's own engineering
standards.

## Commands

**Backend tests** (`backend/`):
```
cd backend && pytest
```
- `pytest.ini` pins `-n 2 --dist loadscope` (pytest-xdist) via `addopts`, with an explicit comment not to
  change it — `loadscope` pins each test class/module to one worker because the suite shares one preview
  backend and assumes sequential state within a class/module. For a serial run use `-n 0`, **not**
  `-p no:xdist`, which errors because `addopts` still injects `-n`/`--dist`.
- `backend/tests/backend_test.py` is a `requests`-based regression suite that hits a **live** API at
  `REACT_APP_BACKEND_URL` (env var, defaults to a hosted preview URL) using a seeded admin login — it is
  not a unit-test suite that spins up the app in-process. Running it exercises whatever backend that URL
  points at.
- The top-level `tests/` directory (as opposed to `backend/tests/`) is just an empty `__init__.py`
  package marker — the real suite lives under `backend/tests/`.

**Frontend** (`frontend/`), via Craco-wrapped CRA scripts — package manager is yarn (pinned via
`packageManager` in `package.json`; no lockfile is committed, dependency pinning relies on the
`resolutions` field):
```
cd frontend && yarn start   # dev server
cd frontend && yarn build
cd frontend && yarn test
```
No lint/format npm scripts are defined. The backend lists `black`, `flake8`, `mypy`, and `isort` as
dependencies but has no config files for them (e.g. no `pyproject.toml`/`setup.cfg`) — invoke them
directly (`black .`, `flake8 .`, etc.) if needed, they're not wired into a script.

## Architecture

**Backend is a single file.** `backend/server.py` is a monolithic FastAPI app (async, Motor/MongoDB) —
there's no per-domain module split. Adding a fleet feature means adding a Pydantic model and route
directly in `server.py`.

**Workspace isolation is the load-bearing invariant.** Every query is expected to go through a
`ws_filter()` helper that scopes it to the caller's workspace. Any new query or endpoint must use it —
skipping it is a cross-tenant data leak, not just a bug.

**Auth**: JWT-based, with TOTP two-factor auth and recovery codes, bcrypt password hashing, and
role-based access control (admin / manager / inspector / mechanic) enforced per-route.

**Email guardrails**: outbound emails (reorder alerts, weekly/health digests, invites) run through
phishing-safety checks — validating HTTPS links, flagging credential-request language, blocking link
shorteners — before sending. Preserve this when touching any email-sending code path.

**Frontend is one file per route.** `frontend/src/pages/*.jsx` maps roughly 1:1 to the routes declared in
`frontend/src/App.js` (Dashboard, Fleet, VehicleDetail, Drivers, Inspection/InspectionReport, Maintenance,
Parts, Incidents, Templates/TemplateBuilder, Team, Reports, AuditLog, Security, PublicVehicle,
Login/Register). `App.js` wraps everything in `AuthProvider` + `BrowserRouter`; public routes are
`/login`, `/register`, and `/public/vehicle/:token`, everything else sits behind a `Protected` guard and
the shared `Layout` component. `frontend/src/components/` holds shared components (`Layout.jsx`,
`InvestigationPanel.jsx`) plus a Radix/shadcn-style `ui/` primitives folder.

**Craco config** (`frontend/craco.config.js`) sets a `@` → `src` path alias, enforces the
`react-hooks/rules-of-hooks` ESLint rule as an error, and conditionally wires in a dev-only webpack
health-check plugin (`ENABLE_HEALTH_CHECK`) and the `@emergentbase/visual-edits` dev tool — both are
optional and degrade gracefully if absent.

**Design system** (`design_guidelines.json`): a country-aware theme — base brand colors (electric blue
`#0EA5E9`, teal `#14B8A6`, lime `#84CC16`) with per-country overrides (10 African countries, e.g.
Nigeria/Kenya/Ghana) applied at runtime via a `data-country` attribute driving CSS variables, including
currency formatting. Headings use "Cabinet Grotesk", body text "Plus Jakarta Sans". UI conventions:
generous spacing, soft shadows over hard borders, `rounded-2xl`/`rounded-xl` cards, glassmorphism
(`backdrop-blur-xl bg-white/70`) on sticky elements, and a 4-column bento grid for the dashboard. Match
these when building or editing UI.
