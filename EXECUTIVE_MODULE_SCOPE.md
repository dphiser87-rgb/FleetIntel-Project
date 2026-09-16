# Executive Dashboard (Mobile) — Design Scope

This is a source brief for designing the **mobile** version of the Executive Dashboard. **The
underlying feature is already built and live on the web app** — this isn't a spec for new
functionality or new data, it's a brief for bringing an existing desktop screen to a phone. A working
version already exists in the real product (see "Try it live" at the bottom) if you want to click
through the actual thing before designing.

## What this module does, in one paragraph

An Executive (CEO/COO-level profile) logs in and needs one answer, fast: *what is fleet maintenance
actually costing us, and is anything about to go wrong?* This screen is a read-only, fleet-wide cost
command center — not a working tool. It shows four headline spend numbers (maintenance, tyres, parts,
cost-per-vehicle), how those numbers have trended over the last 6 months, how this year's spend breaks
down across those three categories, which vehicles/regions/suppliers are costing the most, and a short
list of AI-generated (rule-based, no LLM) insights flagging spikes, outliers, and easy savings. There is
no "workflow" here the way there is in Workshop — no approvals, no state to move through. The executive
never edits anything; the role is deliberately full-visibility, zero-write everywhere in the product,
not just on this screen.

## Role

| Role | What they can do here |
|---|---|
| **Executive** | View only. Full read access to every module in the product (fleet, maintenance, parts, reports, this dashboard, etc.) but cannot create/edit/delete anything, anywhere. This dashboard is their natural landing screen. |

(For context: **Finance** also gets read access to this specific dashboard on the web today — it's not
exclusively an Executive-only screen, but Executive is who this mobile port is being built for.)

## The data, in the shape it already comes in

One endpoint, already built, already returns everything below — no backend changes are anticipated for
the mobile version to consume this:

- **KPI tiles (4)** — this month's total maintenance spend, tyre spend, parts spend, and cost-per-vehicle,
  each with a `delta_pct` vs. last month (up is always bad — these are cost metrics).
- **6-month trend** — one row per of the last 6 calendar months, each split into
  maintenance/tyres/parts/total. (Web renders this as a stacked bar chart.)
- **YTD breakdown** — this year's maintenance/tyres/parts split as amounts + percentages. (Web renders
  this as a donut chart.)
- **Top 6 vehicles by cost** — vehicle name + total spend, ranked.
- **Cost by region** — derived from vehicle → vehicle group → region; vehicles with no group/region
  bucket into "Ungrouped."
- **Top 6 suppliers by spend** — from the vendor field on completed maintenance jobs; blank vendor
  buckets into "Unknown."
- **AI Cost Intelligence Insights** — a short list (0–4 typically) of rule-based flags, each with a type
  (warning/alert/info/success), a priority (High/Medium/Low), a title, a one-line message, and an
  "impact" figure. Examples already firing in production: a cost-spike-vs-average warning, a top-cost-
  category-this-quarter note, a high-cost-vehicle-vs-fleet-average alert, and a dead-stock-parts
  recovery opportunity.

All money values are in whatever currency the workspace is configured for (ZAR/NGN/KES/GHS/etc.) — never
hardcode a currency symbol.

## Screens/states to design

### 1. The dashboard (this is the whole module — one screen)
Everything above, on one scrollable screen. Suggested reading order (matches the web layout top to
bottom, adapt freely for phone width):
1. Header — "Executive Dashboard" / a subtitle, plus a visible count of how many AI insights are live
   right now (this is the thing that should catch the eye first).
2. 4 KPI tiles — money value + up/down-vs-last-month indicator. On phone width these will likely need to
   go to a 2-column grid or a horizontal scroll rather than the web's 4-across row.
3. 6-month trend — **open design question**: a real stacked bar chart, or a simpler numbers/bars-only
   treatment (the mobile app doesn't have a charting library yet, so this is a real cost/complexity
   decision, not just a style one — flag your preference and we'll scope the build to match).
4. YTD breakdown — same open question as above (web: donut chart).
5. Top vehicles / Cost by region / Top suppliers — three ranked lists, each already has a natural
   "progress bar per row" treatment on mobile (this pattern already exists elsewhere in the mobile app's
   Workshop Cost Rollup screen, so it's a proven, no-new-tech option if charts are pushed to a later
   phase).
6. AI Insights — a card per insight: icon (by type), title, priority badge, one-line message, bold
   "impact" figure. Empty state: "No notable cost patterns detected yet."

### 2. Drill-down (open scope question, not yet decided)
On web, tapping a vehicle/region/supplier opens an "Investigation Hub" — a detail modal digging into
that specific vehicle's job history, cost breakdown, etc. Whether this comes to mobile in this phase or
a later one is **undecided** — if you want to design it anyway (even as a "phase 2" concept), a rough
sense of what it currently shows on web is worth knowing, but don't block the core dashboard design on
it.

## Current visual system to match

Same dark, utilitarian system as the rest of the app (see the Workshop module's scope brief for the
canonical description if you have it) — background `#121214` (cards) / `#0b0b0d` (page), Cabinet Grotesk
headings, Plus Jakarta Sans body, numbers in mono, minimal/sharp corners rather than heavily rounded.
Status/urgency colors already fixed regardless of workspace brand color: red `#FF3B30` (warning/alert),
amber `#FFCC00` (info/medium-priority), green `#34C759` (success/low-priority) — these three stay
red/amber/green even though the rest of the app's accent color varies by country/workspace.

## Try it live

There's no mobile-linked Executive demo account yet (this module doesn't exist on mobile yet, so none
was needed). You can see the live web version today, logged in as an account that already has read
access to it:
- `demo.finance@fleetintel.local` / `Demo12345!` at `app.fleetintel.africa/executive-dashboard`

If you want a dedicated Executive demo account (mirroring the 4 Workshop demo accounts) for a
closer-to-real walkthrough, just ask and one can be provisioned.
