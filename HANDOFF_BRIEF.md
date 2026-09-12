# FleetIntel Driver App — Design Handoff Brief

This is a source export of the FleetIntel driver-facing mobile app (Flutter), for design reference.
The goal: you design the actual screens/visuals in Figma (or wherever), and Claude implements your
designs against this real, working codebase — not a mockup, an app with a live backend already wired up.

## The one requirement to hold onto

**3D pre-trip inspection is optional, per client, and sits alongside the existing flat checklist —
it never replaces it.**

- Today's flat checklist (pass/fail questions, one per line, grouped into sections) is the default
  and stays the default for every client.
- A 3D inspection (rotate a real 3D model of the vehicle, tap a part, answer that part's checks) is
  an *additional* checklist type a fleet admin can turn on for specific vehicle types, if they want it
  and have paid for/uploaded a 3D model for that vehicle class. If they haven't, their drivers just
  never see it — same flat experience as always.
- Concretely: a `templates` row is either a flat template (what exists today) or a 3D template
  (has `asset_class` + `node_checklist` set). The driver's checklist-picker screen shows whatever
  templates are actually assigned to their vehicle — could be all flat, could include one 3D one,
  fleet admin's choice. The picker screen itself doesn't need a special "3D mode" — it just routes
  to a different screen when a tapped template happens to be a 3D one.

## Current screen flow (already built and working)

```
Login  →  Welcome  →  Vehicle Confirm  →  Template Picker  →  Inspection (flat OR 3D)
```

1. **Login** (`lib/features/login/login_screen.dart`) — single "email or phone" field + password.
   Backend resolves whichever was typed.
2. **Welcome** (`lib/features/welcome/welcome_screen.dart`) — "Welcome, {name}" + one Continue button.
3. **Vehicle Confirm** (`lib/features/vehicle/vehicle_confirm_screen.dart`) — shows the vehicle already
   assigned to this driver ("Scania R500 — FLT-1002"), a "Not my vehicle today" escape hatch, and an
   odometer field.
4. **Template Picker** (`lib/features/templates/template_picker_screen.dart`) — flat list of the
   checklist templates assigned to that vehicle. Tapping one routes to either:
5a. **Inspection (flat)** (`lib/features/inspection/inspection_screen.dart`) — sections of pass/fail
    items, defect capture (photo + note + category) forced on any fail, signature, submit.
5b. **Inspection (3D)** (`lib/features/inspection_3d/inspection_3d_screen.dart`) — an orbiting 3D model
    with tappable hotspots per component, External/Internal toggle, same defect-capture rules, same
    signature/submit step. **This is the part still rough** — see "What's not right yet" below.

## Design tokens already established (`lib/core/theme/app_theme.dart`)

Ported 1:1 from the real web app's theme — match these, don't invent new ones:

| Token | Hex | Use |
|---|---|---|
| `background` | `#080809` | app background |
| `surface` | `#131315` | cards |
| `surfaceElevated` | `#1D1D20` | secondary surfaces |
| `border` | `#27272A` | borders |
| `primary` | `#22C55E` | brand green — buttons, active states |
| `ink` | `#FFFFFF` | primary text |
| `muted` | `#A3A3AD` | secondary text |
| `danger` | `#FF3D2E` | critical/destructive |
| `warning` | `#FDB816` | warning state |

Sharp ~2px corner radius throughout (`AppRadius.sharp = 2.0`), dark ground, no glassmorphism — this is
the production app's look, distinct from the marketing site's rounded/glass style.

## What's not right yet (the actual open problem)

The 3D models currently bundled (`assets/3d/*/`) are placeholder "functional low-poly prototypes" from
an external package — they render as flat colored boxes with dots, not recognizable vehicles. The
*mechanism* around them is real and working: tap a part → real checklist for that part → pass/warning/
critical/N/A → live recolor on the model → creates a real defect record → shows up flagged next time.
What's missing is a model that actually looks like a truck/van/car. That's a design/asset problem, not
a code problem — either a licensed/custom 3D model (same node-naming convention:
`EXT_windscreen`, `EXT_wheel_front_left`, `HOTSPOT_*`, etc. — see `lib/features/inspection_3d/node_geometry.dart`
for the full node list per vehicle type) needs to replace the placeholders, or the 3D approach gets
swapped for a simpler multi-angle-photo tap diagram instead. Worth deciding before investing more design
time specifically in 3D screens.

## Backend is real, not a mock

Every screen above talks to a live FastAPI backend (`app.fleetintel.africa/api`) with real auth, a
real Postgres database, offline-queue support for spotty connectivity, and photo/signature capture.
Designs should account for real states: empty lists, offline "saved, will sync" banners, validation
errors — not just the happy path.

## What to hand back

Whatever screens you design — new visual treatment for existing screens, a better 3D concept, or both —
Claude will implement them directly against this codebase (same widgets/patterns, same backend calls),
not rebuild from scratch. Figma frames, a Figma link, or even well-labeled static mockups all work.
