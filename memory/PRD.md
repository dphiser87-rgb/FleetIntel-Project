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

## Backlog / Next
- P1: PDF export of inspection reports + email delivery
- P1: Cost forecasting (predict monthly spend from trend)
- P2: Parts inventory + reorder alerts
- P2: Multi-tenant workspaces
- P2: Mobile-first inspector view w/ camera capture
