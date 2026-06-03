# Production Planner — Hand-off

**Module:** `@courtyard/production-planner` · **Version:** 0.12.1 · **Tests:** 52/52 green
(`node test/e2e.mjs`).

This is the one document to read first. It tells a fresh developer what the module
is, how it's built, every data contract, and exactly where to wire it to the real
SQL Server + WHNet.Skany sources. Deep references live in `docs/`; this file points
to them as needed.

---

## 1. What this is

A production-planning module for a PVC/aluminium window-and-door factory. It answers,
per order and per station: *can we hit the deadline, where's the bottleneck, how many
shifts do we actually need, and what's the live picture vs the plan.*

Two design rules run through everything:

1. **One brain, many views.** All logic lives in a pure, framework-free **engine**
   (`src/engine/*.mjs`, no DOM, no React). The **components** (`src/components/*.jsx`)
   are views over that engine. Each component also embeds a copy of the engine logic
   it needs so it can run standalone as a preview artifact — when you integrate, you
   delete the embedded copy and import from the engine barrel instead (see §6).
2. **Business values live in data, not code.** Throughput, costs, deadlines, station
   definitions, shift counts — all parameters, all overridable. Nothing hard-codes a
   number that the floor might change.

Everything is advisory. The module **proposes**; a human approves. It never actuates
equipment. (See §8.)

---

## 2. Layout

```
src/engine/         pure logic, the source of truth
  orchestrator.mjs  per-order feasibility, trucks, action list, work schedule
  workcontent.mjs   Layer 1 — geometry/BOM → work-minutes per station, routing
  capacity.mjs      Layer 2 — finite workforce/machine capacity + OEE
  sequence.mjs      Layer 3 — sequencing + what-if levers with € costing
  learning.mjs      Layer 4 — actuals loop, rate calibration, bottleneck forecast
  line.mjs          user-definable workstations (people, machines, time models)
  multiday.mjs      multi-day backlog drain per station
  flow.mjs          queue-over-time: piece flow, the station×day GRID (gridFlow)
  orderflow.mjs     ORDER-level flow: named orders cascade, re-adjusted by scans
  wfl.mjs           Window Flow Language: text rules → KPIs + actions
  index.js          barrel — import everything from here

src/components/     React views (inline-styled, Archivo + Space Mono fonts)
  FlowGrid.jsx        ★ primary view: station×day grid, today divider, order list
  Cockpit.jsx         running mockup: KPI ribbon, load, Gantt, what-if levers
  Orchestrator.jsx    feasibility + actions + trucks
  PipelineDashboard.jsx, FlowBoard.jsx, StationLoad.jsx, FloorLoad.jsx,
  LineBuilder.jsx, LayoutModeler.jsx, WflPlayground.jsx

docs/               deep reference per module (see §9)
test/e2e.mjs        52 assertions across all engine modules
package.json        v0.12.1, type:module, peerDeps react + recharts
```

---

## 3. The engine, module by module

All signatures below are real. Import from the barrel: `import { ... } from "./src/engine"`.

### orchestrator.mjs — feasibility, trucks, actions
- `orchestrate(rows, cfg=DEFAULTS, opts={})` → `{ computed, kpis, actions, trucks, schedule, capacity }`.
- Per order: `earliest = max(0, materials_in) + remaining_stages × MIN_STAGE_H`;
  `slack = loading_in − earliest`; status **LATE / BLOCKED / RISK / OK**.
- `planTrucks` groups feasible orders (slack ≥ 0) by destination against
  `TRUCK_THRESHOLD`. `deriveActions` ranks **critical / action / review**, each with a
  `why` string. `workSchedule` is EDF by slack.
- `materialsGate(row)` reads `components:[{kind,eta_h}]` and gates on the
  latest-arriving component, naming it (e.g. "Expedite glass for…"). Scalar
  `materials_in` still works.
- `opts.{elements, stations, oeeInputs}` folds the capacity layer in: station
  overloads become actions and add `kpis.binding / bindingLoadPct / overbooked` (the
  base KPIs are `orders, offTrack, critical, trucksReady`; the binding ones appear
  only when `opts` is supplied).
- `DEFAULTS = { MIN_STAGE_H:1, TRUCK_THRESHOLD:80, RISK_SLACK_H:4 }`.
- **Regression baseline** (preserve): Lyon 84 pcs/READY, Paris 62/short-18, 2 criticals.

### workcontent.mjs (Layer 1) — geometry → minutes
- `computeElement(d, rates, routes)`, `computeBatch(descriptors, rates, routes)`,
  `routeFor(d, routes)`.
- Computes work-minutes per station from geometry (frames × 4 sides, mullions,
  sashes × 4 + fitting, glasses × 4 beads, sprossen, roller shutter). Routes by type
  (window / door 1.6× / special_hst → manual) plus sprossen/shutter inserts.
- Returns per element `{ id, type, route, counts, workByStation, totalMin,
  remainingMin, matReady_h, bindingComponent, earliest_h, loading_in, dest, pcs,
  stage_index }`.

### capacity.mjs (Layer 2) — finite capacity + OEE
- `capacityReport(elements, stations, oeeInputs)` →
  `{ load, binding, bindingLoadPct, overbooked, bindingOEE, actions }`.
- **Machine-paced model:** `usableMachines = min(machines, floor(workers/crew))`.
  When `machines ≥ 1` capacity = `usableMachines × horizon`; else people-paced
  (`workers × horizon`). A station with no `machines` field stays people-paced
  (backward-compatible). Consequence: adding a worker to a 1-machine/crew-2 station
  does nothing; removing one stalls it; adding a machine doubles it.
- `oee({plannedTime, runTime, idealCycleMin, totalCount, goodCount})` = A × P × Q.
- `SHIFT_HOURS=8`, `MAX_SHIFTS=3`, `EFFECTIVE_DEFAULT=0.67`.

### sequence.mjs (Layer 3) — sequencing + what-if €
- `sequence(elements, stations, opts)` → EDF packing across lanes → Gantt timeline.
- `whatIf(elements, stations, lever, cost, opts)` — levers costed in €.
  `net = deltaCost + latePenaltyDelta`, where
  `latePenaltyDelta = (lateAfter − lateBefore)/60 × €25`.

### learning.mjs (Layer 4) — actuals loop
- `recordActuals(plannedByStation, scans)`.
- `calibrateRates(rates, history, alpha=0.4, damping=0.5)` —
  `blend = (1−alpha)·rolling + alpha·EWMA`, with an audit trail.
- `forecastBottleneck(shiftsAhead, stations, trendByStation, rates)` — next-shift +
  24–48h.

### line.mjs — user-definable workstations
- `defineStation(s)`, `defineLine(stations)`, `lineReport(line, items)`,
  `stationCapacityMin(st)` (barrel: `lineStationCapacityMin`), `stationLanes(st)`,
  `stationDemandMin(st, items)`.
- Time models: `per_piece` / `per_batch_of` / `manual` / `optimization`. `codeFilter`
  limits which codes a station processes. `EFFECTIVE_DEFAULT=0.85`.
- `EXAMPLE_LINE` encodes the 8 real stations you specified (material-prep,
  Schirmer 2P/1M, double-mitre, monoblock, steel 2P/2M, screwing, fittings-frames,
  welding 3P/3M 180s-per-4).

### multiday.mjs — backlog drain
- `multiDayPlan(elements, stations, {days})` → drains each station's backlog at its
  per-day capacity, carrying the remainder. **Limitation:** stations drain
  independently/in parallel, not route-coupled (documented in `docs/MULTIDAY_FLOOR.md`).

### flow.mjs — queue over time + the GRID  ★
The heart of the FlowGrid view.
- `gridFlow(cfg)` → full **station × day** matrix. Returns
  `{ stations, days, grid:{ [station]:[cell] }, byDay, peak, bottleneck, nominal,
  maxShifts, today }`.
- Each **cell**: `{ day, station, backlog, dueSoon, mustToday, phase, shifts,
  shiftOut, capacity, done, planned, doneSoFar, carried, second, escalate, fromScan,
  daysOfWork, thru, nominal, canSecond }`.
- **`phase`** splits the grid at `cfg.today`:
  - `past` → `done` is that station's **own realised output** that day (from
    `cfg.scans` or its own variance envelope) — varies station to station.
  - `today` → **two numbers**, `doneSoFar / planned` (shift partway through;
    `cfg.todayFraction`, default 0.55).
  - `future` → `done` = planned output run to capacity, draining backlog (tapers
    when queue < capacity).
- **Shifts are solved from DEADLINES, never raw backlog:** `mustToday` (due today
  given remaining downstream lead time) plus a forward 5-day due-window; 1/2/3 capped;
  `escalate` when even 3 shifts can't clear what's due.
- **Output is variable / scan-driven:** `cfg.scans = { station:[day0,day1,…] }` gives
  exact realised counts (flagged `fromScan`); otherwise simulated from
  `VARIANCE_DEFAULT` (per-station band + occasional breakdown day).
- Other config: `THROUGHPUT_DEFAULT` (per-shift nominal), `LINE_ORDER`,
  `FLOW_DEFAULTS` (days, startInWork, startWaiting, arrivalsLo/Hi, perShiftLo/Hi,
  deadlineLo/HiDays, riskWindowDays, riskThresholdPcs, backlogThresholdPcs,
  secondShiftStations). `today`, `todayFraction`, `maxShifts`, `seed` default inside
  `gridFlow`. `simulateFlow`, `stationFlow`, `rng`, `VARIANCE_DEFAULT` also exported.

### orderflow.mjs — ORDER-level flow + scan re-adjust  ★
What the FlowGrid detail panel lists.
- `seedOrders(cfg)` → order book `[{ id, pcs, dest, dueDay, stageIdx, done, history }]`.
- `orderFlow(cfg)` → `{ days:[{ day, stations:{ [st]:{ orders:[…], capacity, shifts,
  mustToday, … } } }], orders, lineOrder }`.
- Each day each station takes the orders at its stage, sorts **earliest-deadline-first**,
  clears up to capacity, passes them downstream for the next day.
- **Scan re-adjustment** — `cfg.scans = [{ id, station, day }]` applied as ground
  truth before that day's planning: the order jumps to just-downstream of the scanned
  station as of that day; if it left the last station it's marked **shipped that day**
  ("done earlier → take as is"), freeing capacity; it's flagged `scanAdjusted`; the
  rest re-plans.
- Order rows surfaced to the UI: `{ id, pcs, dest, dueDay, dueIn, mustRun, willClear,
  scanAdjusted }`.

### wfl.mjs — Window Flow Language
- `parse(text)`, `run(ast, context)`. Tokenizer + Pratt parser + evaluator.
  `const/let/kpi/rule`, `if/then/else`, math, logic, durations (`1h`/`30m`/`1d`→hours),
  `max/min/abs/round/floor/ceil`, aggregates `@count/@sum/@avg/@min/@max` with `where`.

---

## 4. Data contracts (what you must supply)

The engine doesn't care where data comes from; it cares about shape.

**Orchestrator order row** (one per order, from your ETL view):
```
{ id, dest, pcs, stage_index, stages_total,
  materials_in,   // hours until materials arrive; >0 = not yet here
  loading_in,     // hours until truck loads
  components?: [{ kind, eta_h }],   // optional per-component materials
  customer?, material? }
```

**Flow grid** (`gridFlow` cfg):
```
{ days, today, todayFraction?,
  startInWork, startWaiting, arrivalsLo, arrivalsHi,
  deadlineLoDays, deadlineHiDays, maxShifts, seed,
  throughput?: { station: pcsPerShift },        // nominal rates
  variance?:   { station: {lo,hi,breakdownP,breakdownTo} },
  scans?:      { station: [day0Count, day1Count, …] } }   // realised, from WHNet
```

**Order flow** (`orderFlow` cfg):
```
{ orders, days, ordersPerShift?, maxShifts?, lineOrder?,
  scans?: [{ id, station, day }] }   // order seen leaving station on day
```

`LINE_ORDER = ["cut","weld","clean","fitting","glaze","qc","pack"]`. Stations that can
take extra shifts: `cut, weld, fitting, glaze, pack` (QC and corner-clean run one
shift in the seed model).

---

## 5. Integration seams (the actual wiring)

There are exactly four places to connect, all already isolated as config inputs.

### A. Order book ← SQL Server (read-only)
Replace `seedOrders()` with a query result shaped as the order book.
```js
const orders = (await api.get("/planner/orders")).map(r => ({
  id: r.order_id, pcs: r.pcs, dest: r.dest, dueDay: r.due_day,
  stageIdx: 0, done: false, history: {},
}));
const flow = orderFlow({ orders, days: 28, scans: scanEvents });
```
Suggested projection (SQL Server 2019; keep source DBs **read-only**):
```sql
SELECT o.order_id, o.dest, o.pcs,
       DATEDIFF(day, CAST(GETDATE() AS date), o.loading_at) AS due_day
FROM   dbo.orders o
WHERE  o.status NOT IN ('shipped','cancelled');
```

### B. Past columns + variable output ← WHNet.Skany scan counts
For each station, the realised pieces completed per past day become `cfg.scans`:
```js
// gridFlow: per-station per-day completed counts
const scans = { cut: [120,95,140,…], weld: [100,90,118,…], … };  // index = day-1
gridFlow({ days, today, scans });
```
Aggregate scan events into daily counts per station:
```sql
SELECT station, CAST(scan_ts AS date) AS day, COUNT(*) AS done
FROM   WHNet.Skany.scan_events
WHERE  scan_ts >= DATEADD(day, -@past, GETDATE())
GROUP  BY station, CAST(scan_ts AS date);
```
The same history fits each station's **variance envelope** for the forward days
(replace `VARIANCE_DEFAULT` with fitted lo/hi/breakdown values).

### C. Scan re-adjustment ← WHNet.Skany scan stream
Every "order X seen at station Y" event becomes an `orderFlow` scan:
```js
const scanEvents = events.map(e => ({ id: e.order_id, station: e.station, day: e.day }));
orderFlow({ orders, days, scans: scanEvents });
```
This is what makes the board re-plan around reality: an order that cleared early is
taken as shipped; one mid-line jumps to where it actually is.

### D. `today` ← the real date
`cfg.today` is a day index (1-based from the grid's day 0). Map the current date to it:
```js
const today = differenceInCalendarDays(new Date(), planStartDate) + 1;
gridFlow({ days, today, scans });
```
Advance it daily and the past columns grow from the live scan history on their own.

**To make the FlowGrid live**, swap its embedded engine (see §6), then drive it from
`gridFlow` for the heatmap and `orderFlow` for the detail-panel order list, passing the
four inputs above.

---

## 6. From standalone artifact to integrated component

Each component currently **embeds** a copy of the engine logic so it runs as a preview.
To integrate:

1. Delete the embedded engine block at the top of the `.jsx` (clearly fenced with a
   comment like `EMBEDDED … ENGINE (mirrors src/engine/…)`).
2. `import { gridFlow } from "../engine";` (and `orderFlow`, etc.).
3. Replace the in-component `useMemo(() => gridFlow({…}))` seed inputs with real props:
   `today`, `scans`, `orders`. The render code already consumes the engine's return
   shape unchanged, so nothing below the data layer changes.
4. The control knobs (in-work/waiting/reseed) are mockup affordances — drop them or
   repoint them at real filters.

Mounting (standard React; peer deps `react`, `recharts`; inline styles + two Google
fonts, no Tailwind/build CSS needed):
```jsx
import FlowGrid from "./src/components/FlowGrid.jsx";
<FlowGrid />            // standalone
// or, integrated: <FlowGrid grid={gridFlow(cfg)} orders={orderFlow(ocfg)} />
```

---

## 7. Persist what's configurable

Keep these in your store, never in code (mirrors the CourtYard "constants live in
data" rule):
- engine `cfg`: `MIN_STAGE_H`, `TRUCK_THRESHOLD`, `RISK_SLACK_H`, `maxShifts`,
  `todayFraction`.
- per-station `THROUGHPUT`/nominal rates and fitted `VARIANCE` envelopes.
- station/line definitions (`defineLine` input).
- layout `{ zones, objs }` JSON (LayoutModeler Export/Import is the seam).
- WFL programs (rule text, one per screen/role).

---

## 8. Machine steering — read before automating

"Automatically steer production" means writing setpoints to PLC / MES / scanners. That
is a **separate, safety-critical project**. Until it's built and hardened:
- WFL and the orchestrator **propose**; a human approves.
- Rule output must not actuate equipment directly.
- Keep an audit trail of proposed vs accepted actions (propose → approve → log).

---

## 9. Where to read more

- `docs/ARCHITECTURE.md` — engine/view split, principles.
- `docs/DATA_MODEL.md` — full row/element shapes.
- `docs/ORCHESTRATOR.md` — feasibility math + the regression baseline.
- `docs/FLOW.md` — queue model, the grid, today divider, phases, variance/scans.
- `docs/ORDERFLOW.md` — order-level flow + scan re-adjustment.
- `docs/LAYER1_WORKCONTENT.md` … `LAYER4_LEARNING.md` — the four layers in depth.
- `docs/LINE_BUILDER.md`, `docs/MULTIDAY_FLOOR.md`, `docs/COCKPIT.md`,
  `docs/LAYOUT_MODELER.md`, `docs/WFL.md`.
- `docs/INTEGRATION.md` — the original wiring notes (this file supersedes/extends them).
- `docs/NEXT_STEPS.md` + `docs/CHANGELOG.md` — open items and full history.

---

## 10. Open issues / known limitations

1. **multiday.mjs** drains stations independently, not route-coupled (parallel, not
   sequential along the line). `gridFlow`/`orderflow` *do* cascade; `multiDayPlan` is
   the older simpler model.
2. `today` + past columns are currently fed from simulation; wire to real date + live
   WHNet scans per station/day (§5 B, D).
3. `cfg.scans` (both grid and order flow) need binding to the real scan stream (§5 B, C).
4. `seedOrders` must be replaced by the read-only SQL order book (§5 A).
5. Per-station variance envelopes should be **fitted from scan history**, not the
   hand-set `VARIANCE_DEFAULT`.
6. 2nd-shift suggestion is per-station already, but the cockpit's older shift advice is
   group-level — unify on the gridFlow deadline solver.
7. Orchestrator slack uses optimistic `MIN_STAGE_H`; the capacity/flow layers use real
   work-content. Unify so feasibility and load agree.
8. Truck consolidation is destination-threshold only; address-aware consolidation is
   future work.
9. Machine steering only after the controls hardening in §8.

---

## 11. Sanity check after wiring

- `node test/e2e.mjs` → **52 passed**.
- Run the 6-row orchestrator baseline (`docs/ORCHESTRATOR.md`): **Lyon 84/READY,
  Paris 62/short-18, 2 criticals.** If those hold, the engine is intact.
- `npx esbuild src/components/FlowGrid.jsx --bundle --external:react --format=esm
  --outfile=/dev/null` → compiles with no errors (catches JSX/brace issues that
  hand-counting misses).
