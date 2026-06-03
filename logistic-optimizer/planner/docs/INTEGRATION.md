# Integration

How to take this from prototype to wired-in.

## 1. Mount a component

These are standard React function components, default-exported.

```jsx
import LayoutModeler from "./src/components/LayoutModeler.jsx";
import Orchestrator from "./src/components/Orchestrator.jsx";

<LayoutModeler />
```

**Dependencies**: React, and `recharts` (charts in the modeler stats tab,
pipeline, orchestrator). Components are styled with inline styles + two Google
fonts (Archivo, Space Mono) — no Tailwind/CSS setup required.

## 2. Feed real data to the engine

Replace the sample arrays with a query result shaped per `DATA_MODEL.md`.

```js
import { orchestrate } from "./src/engine";

const rows = await api.get("/planner/orders");   // ETL view: one row per order
const { kpis, actions, trucks, schedule } = orchestrate(rows, cfg);
```

Suggested SQL projection (SQL Server 2019 + WHNet):

```sql
SELECT o.order_id              AS id,
       o.dest,
       o.pcs,
       s.stage_index,
       o.stages_total,
       DATEDIFF(hour, GETDATE(), o.materials_eta)  AS materials_in,
       DATEDIFF(hour, GETDATE(), o.loading_at)     AS loading_in,
       o.customer, o.material
FROM   dbo.orders o
JOIN   (/* latest scan per element/order from WHNet.Skany */) s
       ON s.order_id = o.order_id;
```

Expose it through the REST layer you were planning; the engine doesn't care where
rows come from.

## 3. Persist what is configurable

Keep business values in your store, not in code:

- engine `cfg`: `{ MIN_STAGE_H, TRUCK_THRESHOLD, RISK_SLACK_H }`
- modeler info boxes: `{ target, boxes: ["output_today", ...] }`
- layout: the `{ zones, objs }` JSON (Export/Import is the seam — wire those
  buttons to load/save instead of the textarea)
- WFL programs: the rule text, one per screen/role

This mirrors the CourtYard rule that constants never live in code.

## 4. Wire Export/Import to a real store

In `LayoutModeler.jsx`, `exportJ` / `importJ` currently read/write a textarea.
Point them at your persistence:

```js
const exportJ = async () => api.put("/layouts/floor1", { zones, objs });
const importJ = async () => { const v = await api.get("/layouts/floor1"); setZones(v.zones); setObjs(v.objs); };
```

(Per CourtYard's safety rules, treat sharing/permissions changes as user-driven,
not automated.)

## 5. Live floor + WFL as one brain

The clean target: the orchestrator/WFL `computed` rows drive *both* the schedules
and the live map. Pass actions keyed by station `id` into the modeler so badges
light up on the floor where the problem is. (The earlier floor-editor artifact
shows the badge-on-object pattern.)

## 6. Machine steering — read this

"Automatically steer production" means writing setpoints to PLC / MES / scanners.
That is a **separate, safety-critical project**. Until it is built and hardened:

- WFL and the orchestrator **propose**; a human approves.
- Do not let rule output actuate equipment directly.
- Keep an audit trail of proposed vs accepted actions.

## Sanity check

`docs/ORCHESTRATOR.md` has the regression baseline. After wiring, run the same 6
rows through `orchestrate()` and confirm Lyon 84/READY, Paris 62/short-18, and the
two criticals — if those match, the engine is intact.
