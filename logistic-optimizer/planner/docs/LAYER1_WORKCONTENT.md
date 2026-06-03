# Layer 1 — Work-content & routing model

`src/engine/workcontent.mjs`. Replaces the old "1 hour per stage" fiction with
**real work content computed from each element's geometry/BOM**, and a **route**
decided by the element's type and options.

```js
import { computeElement, RATES_DEFAULT, ROUTES_DEFAULT } from "./src/engine";
const r = computeElement(descriptor, rates?, routes?);
```

## Element descriptor (input)

```jsonc
{
  "id": "O24-501·P03·E2",
  "type": "window",          // window | door | special_hst | special_sliding | special_irregular
  "frames": 1, "mullions": 2, "sashes": 2, "glasses": 3,
  "sprossen": 0,             // >0 inserts the Sprossen station
  "roller_shutter": false,   // true inserts the shutter station
  "stage_index": 0,          // how far along its route (remaining work counts toward ETA)
  "components": [{ "kind": "glass", "eta_h": 12 }, ...],  // >0 = not yet arrived
  "dest": "Lyon", "loading_in": 6
}
```

## How work is computed

Geometry → physical work units → minutes. Each driver you specified is explicit:

| Driver | Units | Stations affected |
|--------|-------|-------------------|
| frames | × 4 sides | cut, weld; corners → clean |
| mullions | each | cut, weld |
| sashes | × 4 sides; 1 fitting set each | cut, weld, **fitting** |
| glasses | × 4 glazing beads | glaze (+ beads at cut) |
| sprossen | each (cut+apply) | **+sprossen station** |
| roller shutter | one mount | **+shutter station** |

`workByStation[op] = Σ(count × per-unit-minutes)`. The per-unit minutes are the
**only** tunable constants (`RATES_DEFAULT`) — everything else is derived, so any
element's time is auditable ("why 47 min at weld?" → frame+mullion+sash math).

## Routing

`ROUTES_DEFAULT[type]` gives the ordered station path:

- **window** → cut → weld → clean → fitting → glaze → qc → pack
- **door** → same path, but a `door.multiplier` (1.6×) slows every station
- **special_hst / sliding** → manual → fitting → glaze → qc → pack
- **special_irregular** → manual → qc → pack

Options insert stations into the route: `sprossen` before glaze, `shutter` before qc.

## Output

| Field | Meaning |
|-------|---------|
| `route` | ordered stations this element visits |
| `workByStation` | minutes per station (explainable) |
| `totalMin`, `remainingMin` | total / remaining-from-stage_index |
| `matReady_h`, `bindingComponent` | latest component ETA + which one binds |
| `earliest_h` | honest earliest-ready = `matReady_h + remainingMin/60` |

`earliest_h` is the drop-in replacement for the orchestrator's old
`remaining × MIN_STAGE_H`. Layer 2 consumes `workByStation` for finite-workforce
capacity.

## Tuning

`RATES_DEFAULT` ships as sensible defaults. Per the alignment: the office edits
them via settings, **and** Layer 4 will calibrate them from scan actuals
(write-back to the same object). Pass your own `rates`/`routes` to override.

## Status

Engine only, tested across window/door/special + sprossen/shutter, fully
explainable. Orchestrator baseline re-verified intact (Layer 1 is additive).
