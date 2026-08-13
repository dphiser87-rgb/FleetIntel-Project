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

## Backlog / Next
- P1: PDF export of inspection reports + email delivery
- P1: Cost forecasting (predict monthly spend from trend)
- P2: Parts inventory + reorder alerts
- P2: Multi-tenant workspaces
- P2: Mobile-first inspector view w/ camera capture
