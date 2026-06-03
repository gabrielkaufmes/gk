# CourtYard · Production Planner Module

> **Integrating into an existing session? Start with [`HANDOFF.md`](HANDOFF.md)** — it has the full orientation, every data contract, and the exact SQL/WHNet wiring seams.


A self-contained module for visualising and planning PVC / aluminium window
production: a drag-editable factory **layout modeler**, an **orchestrator** that
turns scan + delivery data into ranked calls-to-action and truck/work schedules,
a **pipeline dashboard**, and **WFL** — a small domain-specific language that lets
the office write planning logic over SQL columns without a deploy.

This is a drop-in module. It has its own engine (pure, framework-free) and its
own React components. It does not depend on the rest of the CourtYard app.

---

## What's in the box

| Area | File | Purpose |
|------|------|---------|
| Layout modeler | `src/components/LayoutModeler.jsx` | Zone-based factory plan: drag/resize machines, racks, stillages, people; zoom/pan/fit; live element flow; configurable KPI boxes; statistics tab. |
| Orchestrator | `src/components/Orchestrator.jsx` | UI for feasibility, truck plan, order table, ranked actions. |
| Pipeline dashboard | `src/components/PipelineDashboard.jsx` | Stage funnel + element table with readiness. |
| Line builder | `src/components/LineBuilder.jsx` | Define workstations: people, machines, time model, code routing; live capacity + bottleneck. |
| **Cockpit (running mockup)** | `src/components/Cockpit.jsx` | One live screen: bottleneck, Gantt, costed what-if. Runs the whole engine. |
| Station load board | `src/components/StationLoad.jsx` | 200-order / ~1188-pc load per station vs capacity; adjust machines/workers/shifts live. |
| **Multi-day floor load** | `src/components/FloorLoad.jsx` | Backlog drained across days, shown on the floor plan with a day-stepper. |
| **Flow board** | `src/components/FlowBoard.jsx` | Queue over time: arrivals, throughput, backlog in pieces; 2nd-shift suggestion. |
| **Flow grid** | `src/components/FlowGrid.jsx` | Full station × day heatmap — every station, every day, backlog cascading down the line. |
| WFL playground | `src/components/WflPlayground.jsx` | Live editor for the planning language. |
| **Engine** | `src/engine/orchestrator.mjs` | Pure planning logic (feasibility, trucks, schedule, actions). |
| **Engine** | `src/engine/wfl.mjs` | WFL tokenizer / parser / evaluator. |
| **Engine · L1** | `src/engine/workcontent.mjs` | Work content from element geometry + routing by type/options. |
| **Engine · L2** | `src/engine/capacity.mjs` | Finite workforce capacity, overbooked detection, OEE at binding. |
| **Engine · L3** | `src/engine/sequence.mjs` | Deadline-first sequencing + costed what-if levers. |
| **Engine · L4** | `src/engine/learning.mjs` | Actuals loop, rate self-calibration, bottleneck forecast. |
| **Engine · Line** | `src/engine/line.mjs` | User-definable workstations (people/machines/time-model/routing). |
| **Engine · Multi-day** | `src/engine/multiday.mjs` | Spreads the backlog across working days; days-to-clear per station. |
| **Engine · Flow** | `src/engine/flow.mjs` | Queue-over-time simulation: WIP, arrivals, throughput, deadline risk, 2nd-shift logic. |
| **Engine · Order flow** | `src/engine/orderflow.mjs` | Named orders cascading through stations; per-day order lists; scan re-adjustment. |
| Engine barrel | `src/engine/index.js` | Single import point for all logic. |
| Tests | `test/e2e.mjs` | End-to-end test across every module (`npm test`). |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit; data flow.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — input columns, stages, units, layout JSON.
- [`docs/ORCHESTRATOR.md`](docs/ORCHESTRATOR.md) — the planning logic, formulas, worked example.
- [`docs/WFL.md`](docs/WFL.md) — the language: grammar, examples, API.
- [`docs/LAYER1_WORKCONTENT.md`](docs/LAYER1_WORKCONTENT.md) — geometry → minutes, routing.
- [`docs/LAYER2_CAPACITY.md`](docs/LAYER2_CAPACITY.md) — workforce capacity + OEE.
- [`docs/LAYER3_SEQUENCE.md`](docs/LAYER3_SEQUENCE.md) — sequencing + costed what-if.
- [`docs/LAYER4_LEARNING.md`](docs/LAYER4_LEARNING.md) — calibration + forecast.
- [`docs/LINE_BUILDER.md`](docs/LINE_BUILDER.md) — user-definable workstations.
- [`docs/LAYOUT_MODELER.md`](docs/LAYOUT_MODELER.md) — the floor editor: modes, objects, JSON.
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — wiring to SQL Server / WHNet, persistence, mounting components.
- [`docs/COCKPIT.md`](docs/COCKPIT.md) — the running mockup: how to run it, what it shows.
- [`docs/MULTIDAY_FLOOR.md`](docs/MULTIDAY_FLOOR.md) — multi-day backlog on the floor plan.
- [`docs/FLOW.md`](docs/FLOW.md) — production as a queue over time (pieces & days, not %).
- [`docs/ORDERFLOW.md`](docs/ORDERFLOW.md) — order-level flow with per-day order lists, re-adjusted by scans.
- [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) — immediate and strategic roadmap.
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — version history of this module.

## 30-second start

```js
import { orchestrate } from "./src/engine";

const rows = [
  { id: "O24-501", dest: "Lyon", pcs: 32, stage_index: 4, stages_total: 5, materials_in: -10, loading_in: 6 },
  // ...one row per order
];

const { kpis, actions, trucks, schedule } = orchestrate(rows);
// actions[0] is the single most urgent thing to do, with a `why`.
```

```jsx
import LayoutModeler from "./src/components/LayoutModeler.jsx";
export default () => <LayoutModeler />;
```

## Conventions (aligned with CourtYard)

- **Logic is pure and separate from UI.** Every component renders engine output;
  it never embeds business rules. Swap the sample data for live queries and the
  views recompute.
- **Business constants live in data, not code.** Targets, the truck threshold,
  the per-stage minimum, KPI box choices, and the whole layout are values you
  persist and edit — not literals to redeploy.
- **Every action ships with its explanation** (`why`), so the floor trusts it.
- **Times are hours.** `materials_in > 0` means not-yet-arrived.

> Status: functional prototype. The engine is tested; the components use sample
> data. See `docs/INTEGRATION.md` before going to production — in particular the
> note on machine steering, which must stay *advisory* until controls integration
> is hardened.
