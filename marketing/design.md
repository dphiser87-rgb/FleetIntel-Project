# FleetIntel Marketing Site — Design System (Direction 2: "Night Ops")

Source of truth for the marketing site build. This is Design B, developed on the `marketing-design-b`
branch as an alternative to the shipped Design A (dark/near-black, sharp corners, matching the operator
app 1:1). Chosen from three options presented in `public/design-preview.html` after a short interview.

## Brand & thesis

FleetIntel is a cost-intelligence platform for African fleet-operated businesses — logistics,
transportation, EMS, security, and any company running company vehicles. Its specialty is turning
scattered vehicle costs (fuel, maintenance, downtime, parts) into a single trustworthy number,
and its architecture is open enough to plug in an existing telematics provider (fuel, kilometers,
driver assignment) rather than locking a customer into proprietary hardware.

**Thesis line**: "See exactly what every vehicle costs you. Before it becomes a problem."

Built in Africa, for African fleet operators — a specialization to lead with, not a boundary. Copy
should read as "purpose-built for African fleet operations," never "Africa-only," so the story extends
cleanly if/when international customers come later.

## Audience & the one job

Decision-makers at logistics, transport, EMS, security, and any vehicle-operating business across
Africa — fleet managers, operations/finance leads, and executives who currently reconcile vehicle
costs manually. The one job this site does: get them to **book a call** or **request a demo**, backed
by real screenshots of the actual dashboard and platform (not illustrations).

## Palette (OKLCH, named roles)

Same DNA as the operator app (dark, green-forward). **Updated**: `bg` now matches Design A's exact
background (`#080809`) per explicit request — everything else in the palette is unchanged from the
original Night Ops direction (surface/ink/primary/alert/border/muted stay green-tinted).

| Role | Value | Use |
|---|---|---|
| `bg` | `#080809` | Page background — matches Design A exactly |
| `surface` | `oklch(22% 0.02 155)` | Cards, raised panels |
| `ink` | `oklch(96% 0.01 155)` | Primary text — off-white, green-tinted, never pure white |
| `primary` | `oklch(70% 0.18 150)` | Brand green — CTAs, links, signature accent |
| `alert` | `oklch(60% 0.20 25)` | Cost-spike / incident moments only — used sparingly, never decorative |
| `border` | `oklch(30% 0.02 155)` | Dividers, card outlines |
| `muted` | `oklch(70% 0.01 155)` | Secondary text |

Rule: every neutral other than `bg` is tinted toward the green brand hue (155°).
`primary` is the one saturated accent; `alert` is a second, deliberately rare accent reserved for
incident/cost-spike storytelling (the executive investigating a spike, the insurance-share flow) —
never used for routine UI chrome.

## Type

- **Display**: Outfit, 700/900 — headlines, thesis line, section titles. Tight tracking (`-0.02em`).
- **Body**: IBM Plex Sans, 400/500/600 — paragraphs, nav, buttons.
- **Utility**: JetBrains Mono, 400/700 — overlines, labels, stats/numbers (cost figures, KPIs).
- Scale: thesis/H1 ~56–72px desktop / ~36px mobile; H2 ~32–40px; body ~16–18px; overline ~11px
  uppercase, wide tracking.
- **Do**: use mono for anything numeric (costs, KPIs, dates) — reads as data, not decoration.
- **Don't**: don't set body copy in Outfit (display-only), don't use Inter anywhere.

## Layout & spacing

Generous, not cramped — 2–3x the spacing that feels comfortable by default. Max content width ~1200px.
Sections separated by a full-bleed `border` line, not shadows. Rounded corners this time (`rounded-lg`
to `rounded-xl`, roughly 8–16px) — a deliberate structural difference from Design A's sharp 2px corners.

## Signature element

A "cost-spike" callout card: a small mono-numeral stat (e.g. a % or currency figure) inside a rounded
card with a thin `alert`-colored left border, used exactly once per real scenario (never as generic
decoration) — echoes the executive-investigates-a-spike story from the interview.

## Motion

- **Structural**: sticky nav on scroll; sections fade/slide up ~8px on first view (once, not repeating).
- **Polish**: buttons scale slightly on press (`active:scale-95`); links underline-on-hover, not by default.
- **Restraint rule**: never animate more than one property per element, no infinite/looping animations,
  respect `prefers-reduced-motion` (disable all transform/opacity entrance animation for it).

## Components

Reuse the shape language, not the literal Design A components: rounded cards (`surface` bg, `border`
outline), pill or rounded-lg buttons (primary = filled green, secondary = outlined `ink`), mono-numeral
stat callouts, a sticky top nav with a filled-pill Login button.

## Copy rules

- Real content only, no fabricated testimonials, customer counts, or years in business.
- Telematics is a capability/architecture claim ("open API, connect your existing telematics
  provider"), never phrased as a live, pre-built one-click integration.
- Every feature claim must map to something actually shipped in the product.
- "Purpose-built for Africa," not "Africa-only."
- No em dashes, anywhere. Use a period, a colon, or a comma instead.
- Sentence case everywhere except the mono/eyebrow utility (which stays uppercase by design).
- Headlines short. Captions three to five words, one accented word each.
- Specific beats generic. A concrete, checkable claim beats an adjective every time.
- Every claim falsifiable. No "luxury," "premium," "experience," "journey."
- No feature-list clutter, no jargon for its own sake.
- No heading that just restates the section label above it.
- Voice: plain, dry, a little understated. The product does the talking, not the adjectives.

## Assets plan

Real product screenshots, captured live from the running app (not stock photography, not illustrations):
1. The main KPI dashboard.
2. A vehicle inspection/checklist in progress (mechanic or driver/controller, mobile).
3. The incident → insurance-share flow (a real shipped feature).
4. The executive dashboard's cost-spike drill-down/investigation view.

## Conversion essentials

Two primary CTAs throughout: **Book a call**, **Request a demo** (both `mailto:` for now, same
zero-infrastructure honest stand-in as Design A, until a real scheduling/form backend exists). Login
button always visible in the sticky nav, linking to `https://app.fleetintel.africa/login`.

## Anti-patterns

No cream+serif+terracotta, no flat near-black+single-acid-accent (that's Design A — this is the
deliberate alternative), no broadsheet hairlines. No gradient text, no glassmorphism. No stock "diverse
team high-fiving in an office" photography — real product screenshots and named real scenarios only.

## References

`https://geotabafrica.com/`, `https://www.webfleet.com/en_za/webfleet/`,
`https://www.powerfleet.com/africa/` — all enterprise-dark-navy; used for structural/tone inspiration
(mega-menu restraint, CTA framing, trust-signal placement) but deliberately not copied on color.
