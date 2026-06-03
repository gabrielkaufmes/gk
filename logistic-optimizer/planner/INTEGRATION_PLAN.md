# Production Planner — Integration Plan

Tracks how the `@courtyard/production-planner` module (vendored under
`logistic-optimizer/planner/`) is being folded into the existing **Logistic
Optimizer** Electron app. Read alongside `HANDOFF.md` (the module's own
hand-off) and the app's `../HANDOFF_v5.41.md`.

## Aligned decisions (2026-06-03, with Gabriel)

- **Engine first, then UI.** Bring in the pure `.mjs` engine, prove it on real
  data, *then* build the views.
- **Screens become additional tabs inside the existing app.** No separate React
  app. The React `.jsx` components are kept only as **visual/logic reference**;
  each view is re-implemented in the app's existing **vanilla-JS, no-build**
  style (the `window.Production` module pattern).
- **Integrate all capabilities, in this order:**
  1. **Orchestrator** — feasibility (LATE/BLOCKED/RISK/OK), trucks, ranked
     actions (`why`), EDF work schedule.
  2. **Flow grid** — station×day backlog heatmap, deadline-driven shift solving.
  3. **Capacity / OEE + costed what-if** — finite capacity, overbooked, €-levers.
  4. Then **WFL**, **Layout modeler**, **Learning** (L4 calibration/forecast).
- **Golden rule still applies.** Orders / Production / Mapping must not change
  behaviour. The planner lives in isolated new modules + new tabs only.

## Architecture of the integration

```
planner/src/engine/*.mjs      ← vendored, UNMODIFIED. Source of truth. 52 tests.
planner/src/components/*.jsx  ← React reference only (NOT mounted).
planner/test/e2e.mjs          ← engine regression suite (npm run test:planner).
public/vendor/planner-engine.js  ← esbuild IIFE bundle → window.PlannerEngine.
                                    Committed; rebuilt via npm run build:planner-engine.
public/planner.js  (Step 2)   ← NEW vanilla module: window.Planner, renders
                                 engine output as DOM. Mirrors production.js style.
public/planner.css (Step 2)   ← NEW styles, loaded after style.css.
public/planner-adapter.js (Step 2) ← maps lastResultRows (Aluplast+WHNet) →
                                      engine row/flow contracts.
```

The engine never imports DOM/React, so it is bundled once and consumed as a
global, exactly like the existing `vendor/codemirror-sql.js` / `vendor/sheetjs.js`.

## Status

### Step 1 — engine wired in ✅ (this commit)
- Vendored engine + docs + tests + reference components under `planner/`.
- `npm run test:planner` → **52/52 pass** (baseline intact).
- Bundled to `public/vendor/planner-engine.js` (IIFE → `window.PlannerEngine`,
  49 exports). Smoke-tested: orchestrator regression baseline reproduced from the
  bundle — KPIs `{orders:6, offTrack:4, critical:2, trucksReady:1}`, Lyon 84/80,
  Paris 62/80.
- `<script src="vendor/planner-engine.js">` added to `index.html` (inert global).
- App still boots clean; no existing screen touched.

### Step 2 — adapter ✅ + Step 3 shell & Tab 1 (Orchestrator) ✅ (v5.43)
- `public/planner-adapter.js` (`window.PlannerAdapter`): maps the live cache
  (spine `sql_05` + order-join `sql_01`) → engine order rows. Element-grain →
  order aggregation at the **slowest element** (min `Last_No`); `pcs = pcsT`;
  deadline from **Friday-of-DD-week** surfaced as `{workingDays}d {hours}h`;
  materials → engine `components[]` (working-hours-to-promised). Mirrors the
  stable production.js helpers (FLOW, working-day engine, COL map) — intentional
  isolated copy; Production untouched. Unit-tested with a synthetic cache; engine
  regression baseline reproduced via `__baseline()`.
- Planner screen wired: sidebar nav item, `#screen-planner`, `planner.js`
  (`window.Planner`), `planner.css`; `app.js` hooks (`boot` init, `switchScreen`
  onShow, `refreshOrders` → `Planner.refreshFromCache` so the **one ribbon
  Refresh** drives Planner too). Golden rule held; Orders/Production/Mapping
  unchanged.
- **Tab 1 Orchestrator** live: KPI ribbon, ranked actions (with `why`), truck
  consolidation, feasibility table (LATE/BLOCKED/RISK/OK, deadline `Nd Hh`,
  slowest station, blocking material). Render path verified end-to-end via a DOM
  shim on the synthetic cache.

**Decided data mapping (resolved with Gabriel):** units — keep working-days +
Friday deadline, hours for scans, countdown = full working days + partial-day
hours; granularity — element-grain, aggregated at slowest element.

### All six tabs ✅ (v5.43 → v5.48)
1. **Orchestrator** (v5.43) — feasibility, trucks, ranked actions, deadlines.
2. **Flow grid** (v5.46) — real station×day heatmap from the `sql_05` scan trail
   (completed/section/day) + live queue-now per section. Engine `gridFlow`
   forward sim intentionally omitted (can't take real per-station state/due-days).
3. **Capacity** (v5.47) — editable line seeded from `EXAMPLE_LINE` (persisted
   `currentMapping.planner.line`); engine `lineReport` gives load/binding/
   overbooked; editing People/Machines/Shifts = live what-if.
4. **WFL** (v5.44) — editable rule program (`currentMapping.planner.wfl`) run via
   engine `parse`/`run` over the order rows → KPIs + CTAs.
5. **Layout** (v5.45) — vanilla SVG floor editor (the 10-zone PVC line), drag/
   edit/add/delete, Export/Import → `currentMapping.planner.layout`.
6. **Learning** (v5.48) — observed throughput + scan-to-scan dwell per section +
   days-to-clear forecast bottleneck, from the scan trail.

All tabs persist their config under a single `currentMapping.planner` sub-tree.
Engine never modified (52/52 throughout). Orders/Production/Mapping untouched.

### Known follow-ups (data not yet in the app)
- **Per-order BOM codes** → load the code-filtered Capacity stations (specialty
  saws / fittings) and route work-content properly.
- **Nominal per-section rate store** → enables `recordActuals`/`calibrateRates`
  true variance in Learning, and OEE (needs machine run-time).
- **Optional**: a dedicated WHNet scan-aggregation query (the tabs currently
  derive scans from the existing `sql_05` trail, which works but is heavier).
- **Truck `dest`** uses `deliveryCity` (raw order-join column); address-aware
  consolidation is future.

## Open: data-mapping decisions for the adapter (Step 2)

The engine wants generic rows; the app has Gabriel's real Aluplast/WHNet shapes.
Proposed mapping for the **orchestrator row** (to confirm):

| Engine field | Proposed source (app data) | Note / question |
|---|---|---|
| `id` | `orderNo` | — |
| `dest` | `deliveryCity` (sql_01) | groups trucks; address-aware later |
| `pcs` | real piece count (`pcsT`, v5.42 rule: frame else sash) | or order `pcs`? |
| `stage_index` | from WHNet `Last_No` vs the 18-step PVC / 12-step ALU flow | how to collapse element-grain → one order stage? min/avg/slowest? |
| `stages_total` | 18 (PVC) / 12 (ALU) — the real WorkstationsTable | engine default is 5; needs real line |
| `materials_in` (h) | derived from materials P/F/A/G/R/D/O promised/actual dates | hours vs the app's working-DAY model — reconcile |
| `loading_in` (h) | from `Loading` / Friday-of-DD-week deadline | hours vs working-days |

Key reconciliations:
- **Units:** engine = hours; app = working-days + holidays + ISO prod-week. Decide
  whether to convert (×8h/working-day) or extend the engine cfg.
- **Line definition:** replace the engine's seed `LINE_ORDER`
  `[cut,weld,clean,fitting,glaze,qc,pack]` with the real 18/12-step flow already
  encoded in `production.js`.
- **Scans:** WHNet scan events → `gridFlow.scans` (per-station daily counts) and
  `orderFlow.scans` (`[{id,station,day}]`) for re-adjustment.

## Build/verify commands
- `npm run test:planner` — engine regression (must stay 52/52).
- `npm run build:planner-engine` — rebuild the renderer bundle after any engine edit.
- Bundle compile sanity: see `HANDOFF.md` §11.
