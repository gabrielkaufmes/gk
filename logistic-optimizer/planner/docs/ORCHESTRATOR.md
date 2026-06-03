# Orchestrator engine

`src/engine/orchestrator.mjs` — pure planning logic. Given order rows it returns
feasibility, a truck plan, a work schedule, and ranked calls-to-action.

## API

```js
import { orchestrate, feasibility, planTrucks, deriveActions, workSchedule, materialsGate, DEFAULTS } from "./src/engine";

const result = orchestrate(rows, cfg?, opts?);
// result = { computed, kpis, actions, trucks, schedule, capacity }
```

`opts` (optional) makes the orchestrator **constraint-aware**:
`{ elements, stations, oeeInputs }`. Pass the line's work-content (from
`computeElement`/`computeBatch`) and station config and the orchestrator folds in
finite-capacity checks — station overloads that per-order slack alone can't see —
merging them into the ranked actions and adding `kpis.binding` / `bindingLoadPct` /
`overbooked`. With no `opts`, behaviour is unchanged (`capacity: null`).

Lower-level functions are exported too, if you want to compose them yourself.

### Materials: per-component or scalar

`feasibility` gates on materials via `materialsGate(row)`:
- **Per-component** — `components: [{ kind, eta_h }]` → gates on the **latest-arriving**
  component and names it (`bindingComponent`), so a BLOCKED action reads
  "Expedite **glass** for O24-702" not just "materials".
- **Scalar fallback** — `materials_in` (hours) still works unchanged.

### Config

```js
DEFAULTS = { MIN_STAGE_H: 1, TRUCK_THRESHOLD: 80, RISK_SLACK_H: 4 }
```

Pass a `cfg` object to override. **Persist these** — they are business constants,
not code literals.

## What it computes

1. **Feasibility** per order — earliest-ready from remaining stages × min dwell,
   gated by materials arrival; then `slack` against the loading deadline.
2. **Trucks** — feasible orders (`slack ≥ 0`) grouped by destination, measured
   against the 80-pcs threshold (ready / short-by-N).
3. **Actions** — ranked `critical → action → review`, each with a `why`:
   - LATE: cannot make the date even at floor speed → renegotiate/expedite.
   - BLOCKED: materials not yet on site → expedite materials.
   - RISK: positive but thin slack → push to the next stage now.
   - Truck ready → confirm carrier; truck short → hold/fill.
4. **Schedule** — earliest-deadline-first by slack (most urgent first).

## Worked example

Input (6 PVC orders, abbreviated):

| id | dest | pcs | stage_index | materials_in | loading_in |
|----|------|-----|-------------|--------------|------------|
| O24-501 | Lyon | 32 | 4 | −10 | 6 |
| O24-502 | Lyon | 28 | 2 | −5 | 6 |
| O24-503 | Lyon | 24 | 1 | −2 | 6 |
| O24-530 | Paris | 40 | 3 | −3 | 10 |
| O24-531 | Paris | 22 | 0 | 4 | 10 |
| O24-540 | Marseille | 18 | 2 | −8 | 2 |

(`stages_total = 5`, defaults.) Output:

```
KPIs   : { orders: 6, offTrack: 4, critical: 2, trucksReady: 1 }
Trucks : Lyon 84/80 READY · Paris 62/80 short 18
Actions:
  [CRIT] Expedite materials for O24-531 — arriving +4h
  [CRIT] Renegotiate or expedite O24-540 — late by 1h
  [ACT ] Push O24-502 — 3h slack
  [ACT ] Push O24-503 — 2h slack
  [ACT ] Paris truck short by 18 pcs (62/80)
  [REV ] Confirm carrier for Lyon — 84/80 pcs
```

`O24-540`: at weld (3 stages left → 3h min) but loads in 2h ⇒ `slack = −1` ⇒ LATE.
`O24-531`: materials in +4h, 5 stages ⇒ earliest +9h vs loading +10h ⇒ 1h slack ⇒ BLOCKED.

## Verifying

```
node src/engine/orchestrator.mjs   # (import into a scratch test as in CHANGELOG)
```

The numbers above are the regression baseline — the UI must match them.

## Caveats before production

- `MIN_STAGE_H` is optimistic for the *slack* estimate. With `opts.elements` the
  capacity layer uses real work-content; the per-order slack still uses MIN_STAGE_H.
- Truck grouping is by `dest` string only. Real consolidation needs address /
  geocoding to decide what can legitimately share a load.
- Constraint-awareness is opt-in via `opts.elements`/`opts.stations`; without them
  the orchestrator is the fast infinite-capacity first pass (per-order vs the clock).
