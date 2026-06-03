# Changelog

All notable changes to the Production Planner module.

## [0.12.2] — Hand-off doc + barrel fix

- Added top-level `HANDOFF.md`: complete fresh-session integration guide — engine
  map, every data contract, the four real wiring seams (SQL order book, WHNet scan
  counts for past columns + variance, scan stream for order re-adjust, date→today),
  artifact→component steps, open issues, sanity checks.
- Exported `VARIANCE_DEFAULT` from the engine barrel (referenced by the hand-off as a
  fittable parameter; was internal to flow.mjs). 52/52 green.

---

## [0.12.1] — Per-phase cell meaning: actual / today-two-numbers / planned

- **Past output now varies per station** — each station shows its OWN realised
  output (scan or its own variance), not the upstream pass-through (which made every
  row identical). cut 145,107,141… weld 138,114,128… each different.
- **Today shows two numbers** — `doneSoFar / planned` (shift partway), stacked in the
  cell and in the detail panel, since one number can't represent a day in progress.
- **Future** stays planned-to-capacity draining the backlog.
- Tests: today-two-numbers + scan-exact-in-past. 52/52 green.

---

## [0.12.0] — Today divider: actual vs planned

- The grid now splits at **today** with a red vertical line (`cfg.today`).
  **Left = actual** pieces done per day (from scans); **right = planned** output,
  each station run to capacity until backlog+incoming falls below capacity.
- Cells carry `phase` (past/today/future): past muted + `scan`-tagged, future shows
  the planned-shift badge. Header bands label "← actual" / today / "planned →".
  Default metric switched to completed/planned pieces per day.
- Tests: +1 (today splits phases, past uses actual scan values). 51/51 green.

---

## [0.11.1] — Fix self-contradicting shift advice

- **The panel said "Run 2 shifts: 0 pcs must ship" — a contradiction.** Cause: a
  raw-backlog trigger (`backlog > 2.5× shift`) forced a 2nd shift even when nothing
  was due — the exact "backlog ≠ reason" error, sneaking back. Removed it.
- Extra shifts are now driven purely by deadlines: `mustToday` today, plus a
  forward 5-day **due-window** test. A big backlog with far deadlines → 1 shift. The
  recommendation text now states the real reason ("X pcs must ship today" or "Y pcs
  due within 5 days") and never claims 0-must-ship while advising 2 shifts.
- Fixed a duplicated line in the recommendation ternary (latent render bug) found
  while tracing the message; FlowGrid now compiles warning-free.
- Engine `flow.mjs` shift logic updated to match. 50/50 green.

---

## [0.11.0] — Order-level flow + scan re-adjustment

- `orderflow.mjs` — tracks identifiable **orders** (id, pcs, dest, deadline) moving
  stage by stage, producing the **list of orders at each station each day** (EDF),
  not just counts.
- **Scan re-adjustment.** `cfg.scans=[{id,station,day}]` is applied as ground truth:
  the order jumps to just-downstream of the scanned station as of that day; if it
  left the last station it's marked shipped that day ("done earlier → take as is"),
  and the rest of the flow re-plans around it. Orders are flagged `scanAdjusted`.
- `FlowGrid.jsx` detail panel now shows the **order list** for the tapped station-day
  — id, pcs, destination, due-in countdown, with ✓clears / ⚠late-risk / ⟲scan markers
  — beneath the numbers.
- Tests: +4 (EDF order list, cascade downstream, scan-ships-early, scan re-adjust).
  50/50 green.

---

## [0.10.0] — Scan-driven, variable output (no more flat rates)

- **Output is no longer a constant.** Each station's daily completion now comes
  either from real **scan totals** (`cfg.scans` from WHNet.Skany — used as the exact
  day output, flagged `fromScan`) or, for planning, from a **variance envelope**
  (`VARIANCE_DEFAULT`): normal-day band + occasional breakdown day. No two days are
  identical (cut e.g. 222,188,192,168,…,99 on a jam day).
- **Cutting drains instead of freezing at ~893.** The entry station opens extra
  shifts to keep pace when its queue is genuinely building, so the grid shows a real
  burn-down rather than a flat number repeated across the row.
- `FlowGrid.jsx`: "Completed/day" metric added; detail panel shows realised rate and
  whether it's `from scans` or `~nominal`.
- Tests updated: output-varies, scans-used-exactly, far-deadlines+small-backlog⇒1
  shift. 46/46 green.

---

## [0.9.0] — Shifts solved from deadlines, not backlog

- **Fixes a wrong decision rule.** The grid opened a 2nd shift whenever backlog
  exceeded 1.5× a shift — pure queue size, ignoring deadlines. A big backlog due
  weeks out was wrongly flagged; tight deadlines under-served.
- `gridFlow` now tracks each piece's due-day through the cascade and **solves the
  shift count from deadlines**: `mustToday` = pieces that must run today to ship on
  time; `shifts = ceil(mustToday / throughput)`, capped at 3. 1 shift if nothing's
  due, 2–3 when deadlines bite, **escalate** when even 3 can't clear what's due.
  Verified: big backlog + far deadlines ⇒ all 1 shift; tight deadlines ⇒ 2–3 + escalate.
- `FlowGrid.jsx`: cell badge shows the shift number (or ⚠ escalate) instead of a
  bare dot; detail panel shows must-run-today, due-within-2-days, shifts-needed, and
  a deadline-based recommendation. Legend updated.
- Tests: grid assertions now check the deadline logic (1 vs many shifts, cap+escalate).
  44/44 green.

---

## [0.8.2] — Fix: FlowGrid crash ("OK is not defined")

- The detail panel added in 0.8.1 used the `OK` and `HOT` colour tokens, which were
  never declared in FlowGrid's palette — the artifact crashed on load. Added both.
  Verified by evaluating the component's engine + every render token. 42/42 green.

---

## [0.8.1] — Grid cells tappable, detail panel, clearer dot

- The blue dot (2nd-shift suggestion) is now explained in the legend ("blue dot =
  2nd shift suggested that day") instead of being an unlabelled mark.
- **Every cell is tappable** (mobile-friendly; replaces desktop hover): opens a
  detail panel with backlog start, received-from-upstream, capacity (1/2 shifts),
  completed, carried-to-next-day, a plain-words shift recommendation, and a tappable
  per-station trend strip.
- `gridFlow` cells enriched to match (`received, capacity, carried, daysOfWork,
  thru, canSecond, station`) so engine and view share one shape. 42/42 green.

---

## [0.8.0] — Full station × day grid

- `gridFlow()` — the complete station × day matrix. Backlog cascades through the
  line (cut → weld → clean → fitting → glaze → qc → pack): each station receives
  upstream output, works its queue at its own throughput (×2 on a warranted 2nd
  shift), passes the rest on. Returns every station's backlog for every day, plus
  per-station peak and the bottleneck (clean/cut on the seed run).
- `FlowGrid.jsx` — heatmap of all stations × all 28 days in one view. Cell colour =
  days of work in that station's queue (never an impossible %); toggle pieces vs
  days; dots mark suggested 2nd shifts; bottleneck row flagged; hover for detail.
  This replaces the few-tiles summary with the full picture the user asked for.
- Tests: +4 grid assertions (196 cells, no negative backlog, bottleneck = max peak,
  cascade reaches downstream). 42/42 green.

---

## [0.7.0] — Flow model: queue over time (no more impossible %)

- **Fixes the core conceptual error.** A station can't be "2700% loaded" — that's a
  multi-week queue, not a load. `flow.mjs` models production as a queue over time:
  pieces in-work + waiting, random 50–150 pcs/day arriving with 2–4 week deadlines,
  100–140 pcs/shift completed earliest-deadline-first.
- **2nd shift as a real decision.** Suggested only when backlog is high (>700) or
  deadlines at risk (>120 pcs due ≤5 days), on cut/weld/fitting/glaze/pack — never
  blanket. Reference run: peak ~893 pcs, drains to ~38, 0 late, 2nd shift ~2 days.
- `FlowBoard.jsx` — backlog-over-time chart (2nd-shift bands, late dots), arrivals-
  vs-completed daily bars, per-day detail with the shift recommendation, knobs for
  in-work/waiting/reseed. Everything in pieces and days.
- Supersedes the %-based snapshot reading for the multi-week horizon (FloorLoad/
  StationLoad kept for single-day station inspection only).
- Tests: +4 flow assertions (no backlog blow-up, arrivals in range, 2nd shift only
  when justified, completions bounded). 38/38 green.

---

## [0.6.0] — Multi-day planning on the floor plan

- `multiday.mjs` — `multiDayPlan()` spreads the full backlog across working days,
  draining each station at its per-day capacity and reporting days-to-clear plus a
  per-day load curve and a per-day pivot. Seed plant: corner cleaning clears in 5
  days (449→349→249→149→49%), cutting 4, welding 3.
- `FloorLoad.jsx` — the 80×30 m floor plan with each station boxed and colored by a
  selected day's load, a days-to-clear badge, flow arrows, a day stepper, and a
  per-station drain chart. Step the day to watch the backlog clear across the floor.
- Replaces the single-horizon StationLoad snapshot view for the realistic
  200-order / 1188-pc case (StationLoad.jsx retained for single-day inspection).
- Tests: +3 multi-day assertions (needs >1 day, binding has most days, load drains
  monotonically). 34/34 green.

---

## [0.5.1] — Station load board (realistic 200-order mockup)

- `StationLoad.jsx` — a live capacity board: 200 orders / ~1188 pcs run through the
  embedded engine, every station shown as a load bar vs its shift capacity, sorted
  by load with the bottleneck flagged. Click a station to inspect demand/capacity
  and nudge its machines/workers/shifts to watch the load recompute (machine-paced
  vs people-paced honoured). Realistic 2-shift plant config; binding ≈ corner
  cleaning at ~449%.

---

## [0.5.0] — Orchestrator: constraint-aware + per-component materials

- **Constraint-aware.** `orchestrate(rows, cfg, opts)` now accepts
  `opts.elements` (work-content) + `opts.stations` and folds the capacity layer in:
  station overloads that per-order slack can't see are merged into the ranked
  actions, with `kpis.binding`/`bindingLoadPct`/`overbooked` added. Fully
  backward-compatible — no opts ⇒ `capacity: null`, identical to before.
- **Per-component materials gate.** `feasibility` reads `components:[{kind,eta_h}]`,
  gates on the latest-arriving component, and names it — BLOCKED actions now read
  "Expedite glass for O24-702", not generic "materials". Scalar `materials_in`
  still works (fallback). New export: `materialsGate`.
- Tests: +6 assertions (constraint fold-in, component gating, scalar fallback).
  31/31 green.

---

## [0.4.4] — Commit fixed: preview = apply

- **Root-cause fix.** `orders` was immutable (`const [orders]`), so committing a
  lever couldn't apply the deadline change the preview was based on — preview and
  commit used different mechanisms (commit bumped `effective`, preview extended
  deadlines). Apply now extends the affected orders' deadlines by the solved
  overtime/shift window — the exact transform the preview shows. Verified: a
  committed 1.5h overtime drives cut late 15 → 0.
- **Dead levers removed for real.** `add_worker` and `outsource` cases deleted from
  `whatIf` (only `overtime` + `add_shift` remain), so a stale build can't resurrect
  the wrong buttons.

> If a screenshot still shows +Worker/Outsource buttons or "+1 worker net −€213",
> that is a cached render of an older build — reload the artifact.

---

## [0.4.3] — Levers pruned to the real options

- Cockpit now exposes only the two levers a cut-station manager can actually pull:
  **Overtime** (solves hours) and **+ Shift**.
- Removed +Machine (can't add a saw on the day), Outsource (no cutting
  subcontractor), and +Worker button (machine-paced — no extra lane).
- **+ Shift made honest:** it clears the backlog but reports how much of the new
  8h shift the backlog uses; low fill (e.g. 19% for a 1.5h backlog) warns "open
  only if there's other work to fill it", letting you weigh €440 (shift) vs €114
  (overtime).

---

## [0.4.2] — Overtime solver + lever viability

- **Overtime now solves for hours.** Instead of a fixed "+2h" that wrongly reported
  "no change" (deadlines weren't extended), it computes the minimum overtime needed
  to clear the backlog at the binding station, rounded to 0.5h, capped at 4h, with
  its cost (`hours × €38 × crew`). Seed shop: 15 late, worst 1.5h → 1.5h OT clears
  all, €114.
- **Lever viability made honest.** +Machine and Outsource are marked `*` (need a
  resource you may not have); Overtime and +Shift use existing crew. +Worker stays
  correctly rejected at machine-paced stations.
- Rationale: the cockpit must recommend levers the manager can actually pull. The
  real answer to a cut overload with one machine and no subcontractor is *overtime,
  and how much* — which the cockpit now states directly.

---

## [0.4.1] — Machine-paced capacity fix

- **Fixed a real modeling error:** capacity treated people as parallel processors
  everywhere. A machine-paced station (e.g. Schirmer cutting: 1 machine, crew of 2)
  cannot go faster by adding a 3rd worker, and stalls if dropped below crew.
- `capacity.mjs` now computes `usableMachines = min(machines, floor(workers/crew))`;
  capacity is machine-bound when `machines ≥ 1`, people-bound otherwise (backward
  compatible — stations without a `machines` field are unchanged).
- Cockpit: stations seeded with `machines`/`crew`; **+Machine** lever added;
  +Worker now honestly reports "no change" at a fully-crewed machine.
- `test/e2e.mjs`: +4 assertions (worker adds nothing / machine doubles / understaffed
  stalls / people-paced unchanged). 25/25 green.

---

## [0.4.0] — Running cockpit mockup

- `Cockpit.jsx` — a single live screen that runs the whole engine inline:
  station-load list (click to inspect), binding-station Gantt (earliest-deadline-
  first, deadlines marked, late bars red), OEE ribbon, and four costed what-if
  levers (+worker/+shift/+overtime/outsource) with an Apply that commits capacity
  changes so the bottleneck visibly shifts. Standalone (React only).
- `docs/COCKPIT.md` — how to run and what it shows.
- Seed shop (22 orders) validated through the real engine: cut binds at 152%,
  +1 worker recovers all 15 late orders for net −€212.

---

## [0.3.0] — Line builder + end-to-end tests

### Line builder
- `line.mjs` — user-definable workstations: people, machines, `peoplePerMachine`
  (parallel-lane capacity bounded by both), shifts (1–3), effective %, scan rule,
  **code routing** (a station processes only its codes), and four **time models**:
  `per_piece`, `per_batch_of` (e.g. weld 180s/4), `manual`, `optimization`.
  `EXAMPLE_LINE` encodes the eight real reference stations.
- `LineBuilder.jsx` — add/edit/reorder stations, pick time model, live capacity
  bars, auto bottleneck badge, Export/Import line JSON.

### Tests
- `test/e2e.mjs` — 21 assertions across orchestrator, WFL, L1–L4, line builder,
  and cross-layer threading. `npm test`. All green.

### Fixed
- L4 calibration test now uses separated ratios to prove `alpha` shifts the blend
  (rolling 1.15 vs EWMA 1.60) — engine was correct; earlier test data was too close.

---

## [0.2.0] — Engine extension (Layers 1–4)

Strategic deepening: from per-order deadline triage to finite-capacity,
self-calibrating production planning. All layers are pure, additive, and opt-in;
the 0.1.0 orchestrator baseline was re-verified intact after every step.

### Layer 1 — Work-content & routing (`workcontent.mjs`)
- Cycle time is **computed from element geometry/BOM**, not a lookup: frames,
  mullions, sashes, glasses, Sprossen, roller shutters → minutes per station.
- Routing by type: window / door (1.6×) / special (manual); options insert the
  Sprossen and shutter stations. Materials gate on the latest-arriving component.
- Per-unit minutes are the only constants (`RATES_DEFAULT`), office-editable and
  Layer-4-calibratable. Passes planning fields through to downstream layers.

### Layer 2 — Finite workforce capacity + OEE (`capacity.mjs`)
- Loads work content against people-capacity: `workers × shifts(1–3) × 8h × eff%`.
- Flags overbooked stations before the shift; names the binding (pacing) station.
- OEE (availability × performance × quality) measured at the binding station.

### Layer 3 — Sequencing & what-if (`sequence.mjs`)
- `sequence()` — deadline-first packing across worker lanes → Gantt data.
- `whatIf()` — 7 levers (add worker/shift, overtime, pull-forward, split, outsource,
  resequence), each returning saved / slipped / **€ net cost** + a verdict.
- Cost model in euros (`COST_DEFAULT`), editable.

### Layer 4 — Closing the loop (`learning.mjs`)
- `recordActuals()` — planned-vs-actual dwell from scan timestamps.
- `calibrateRates()` — rolling+EWMA blend with **exposed `alpha`** and damping;
  self-tunes Layer 1 rates; full audit trail.
- `forecastBottleneck()` — next-shift **and** 24–48h bottleneck-risk projection.

### Docs
- Added LAYER1_WORKCONTENT, LAYER2_CAPACITY, LAYER3_SEQUENCE, LAYER4_LEARNING.

### Still advisory
- The engine proposes; machine steering remains out of scope until controls
  integration is hardened (INTEGRATION §6). UI for Layers 2–4 (Gantt, OEE,
  forecast) is the next build, on these tested numbers.

---

## [0.1.0] — Hand-off package

First packaged release. Functional prototype: engine tested, components on sample data.

### Engine
- `orchestrator.mjs` — pure planning logic extracted from the UI:
  `feasibility`, `planTrucks`, `deriveActions`, `workSchedule`, `orchestrate`.
  Regression baseline (6-order scenario): Lyon 84/80 READY, Paris 62/80 short 18,
  2 critical actions.
- `wfl.mjs` — Window Flow Language: tokenizer, Pratt parser, evaluator.
  Supports const/let/kpi/rule, if/then/else, math, logic, durations
  (`1h/30m/1d`), `max/min/abs/round/floor/ceil`, and `@count/@sum/@avg/@min/@max`
  with `where`. Verified to reproduce the orchestrator output.
- `index.js` — single import barrel for all logic.

### UI
- `LayoutModeler.jsx` — current/latest floor tool. Zone-based plan seeded from the
  10-zone PVC reference (Schirmer cut, 3× Fimtec welding, central glazing, dock).
  Drag-move/resize, View/Edit/Live modes, zoom/pan/fit-to-selection, live element
  flow, four flow types, computed capacity/equipment summaries.
  - Configurable production info boxes (pick metric per box) + editable shift target.
  - Statistics tab: pace/hour today vs target & historic, shift comparison, table.
  - Workers render outside machine boxes; standalone draggable `person` object.
- `Orchestrator.jsx` — feasibility table, truck plan, ranked calls-to-action.
- `PipelineDashboard.jsx` — stage funnel + element readiness table.
- `WflPlayground.jsx` — live WFL editor → KPIs, actions, trucks, printable schedule.

### Docs
- README, ARCHITECTURE, DATA_MODEL, ORCHESTRATOR, WFL, LAYOUT_MODELER, INTEGRATION.

### Superseded (not included)
- Early floor mockups (`floor-plan-mockup`, `production-floor-mockup`,
  `factory-floor-live`, `floor-editor`) — folded into `LayoutModeler.jsx`.

### Known limitations
- `MIN_STAGE_H` is a 1h floor, not measured cycle time → ETAs optimistic.
  **(Resolved in 0.2.0 Layer 1.)**
- Truck grouping by `dest` string; no address/geocoding consolidation yet.
- Machine steering intentionally absent (advisory only — see INTEGRATION §6).
- Components use sample data; persistence/API seams documented, not wired.
