# Layer 2 — Finite workforce capacity + OEE

`src/engine/capacity.mjs`. Loads Layer 1's per-element work content against each
station's **people-capacity** for the shift, flags overbooked stations *before*
the shift starts (the queue problem), names the binding station, and computes
**OEE** there.

```js
import { computeBatch } from "./src/engine";          // Layer 1
import { capacityReport, STATION_DEFAULT } from "./src/engine";  // Layer 2

const elements = computeBatch(descriptors);
const report = capacityReport(elements, stations, oeeInputs?);
```

## Capacity model (aligned)

```
availableMin(station) = workers × shifts × 8h × 60 × effective%
```

- `workers`, `shifts` come from the layout modeler's worker placement (fallback config).
- `shifts` is **1–3** (`MAX_SHIFTS`); `effective%` defaults to 0.67 (breaks, changeover), editable.
- One worker, one shift ≈ **321.6 min**; three shifts ≈ 964.8 min.

## Output (`capacityReport`)

| Field | Meaning |
|-------|---------|
| `load[]` | per station: `required_min`, `capacity_min`, `load_pct`, `overbooked`, `over_min`, workers/shifts/effective |
| `binding` | the highest-load station — the pacing resource |
| `bindingLoadPct` | its load % |
| `overbooked[]` | stations where required > capacity |
| `bindingOEE` | OEE breakdown at the binding station (if shift data supplied) |
| `actions[]` | ranked: overbooked (critical), pacing ≥85% (action), OEE (by severity) |

## OEE

`oee({ plannedTime, runTime, idealCycleMin, totalCount, goodCount })` →
`{ availability, performance, quality, oee, losses }`, measured **at the binding
station** (industry practice: OEE belongs at the constraint). The action names the
single biggest loss bucket so the manager knows whether it's downtime, speed, or
scrap. Layer 4 will auto-feed these inputs from scans; for now pass observed data.

## What it answers

Turns *"this order is late"* into *"**cut** is the reason — 210% loaded, over by
5.9h; add a worker/shift or offload."* Doors, Sprossen, shutter and manual stations
are first-class, so hidden overload off the main flow is caught too.

## Example

24 mixed elements (20 windows + 2 sprossen bays + door + HST) on default single-worker
stations → cut 210%, weld 201%, clean 133% overbooked; glaze/fitting (2 workers)
cope. Adding a 2nd weld shift clears weld. This is the lever Layer 3 will let you
pull interactively.

## Status

Engine only, tested (load, overbooked detection, OEE, shift-relief). Orchestrator
baseline re-verified intact — additive.
