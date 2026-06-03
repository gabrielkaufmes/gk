# Layer 3 — Sequencing & what-if (with € costing)

`src/engine/sequence.mjs`. Turns capacity analysis into steering: a deadline-first
schedule of the binding station (the data behind a Gantt), and a pure `whatIf`
that applies a lever, recomputes, and reports what's saved, what slips, and the
**euro cost**.

```js
import { sequence, whatIf, COST_DEFAULT } from "./src/engine";
const plan = sequence(elements, stations);
const option = whatIf(elements, stations, { kind:"add_worker", station:"weld" });
```

## `sequence(elements, stations, opts?)`

Packs the binding station's queue earliest-deadline-first across `workers`
parallel lanes, within capacity.

Returns `{ station, parallel, capacity_min, required_min, makespan_min, lateCount,
overbooked, over_min, timeline[] }` where each timeline entry is
`{ id, lane, start_min, end_min, work_min, loading_min, late_min, late }`.
That timeline is exactly what a Gantt view renders.

## `whatIf(elements, stations, lever, cost?, opts?)`

Levers (all aligned with your list):

| Lever | Shape |
|-------|-------|
| Add worker | `{ kind:"add_worker", station, n? }` |
| Add shift (max 3) | `{ kind:"add_shift", station, n? }` |
| Overtime | `{ kind:"overtime", station, minutes }` |
| Pull forward | `{ kind:"pull_forward", id, to_loading_in }` |
| Split load | `{ kind:"split_load", id, fraction }` |
| Outsource / subcontract | `{ kind:"outsource", id }` |
| Resequence | `{ kind:"resequence", order:[ids] }` |

Returns:

```jsonc
{
  "note": "+1 worker(s) at weld",
  "before": { "lateCount": 6, "over_min": 0, "makespan_min": 228 },
  "after":  { "lateCount": 1, ... },
  "saved":   ["B","C","D","E","F"],   // were late, now on time
  "slipped": [],                       // were on time, now late
  "deltaCost_eur": 180,
  "latePenaltyDelta_eur": -92,         // less lateness = saving
  "netCost_eur": 88,
  "verdict": "recovers 5 order(s) for €88"
}
```

## Cost model (`COST_DEFAULT`, € — editable/persisted)

`overtime_per_h 38 · extra_shift_per_worker 220 · add_worker_per_shift 180 ·
extra_truck 450 · subcontract_per_min 1.4 · late_penalty_per_h 25`

Net cost = direct lever cost + change in late-penalty. A negative net means the
move **saves time and money** (e.g. outsourcing a bottleneck element can net −€15).

## What it answers

The manager's daily trade-off, costed: *"+1 welder recovers 5 late orders for €88;
the 2nd welder is wasted (€268, same recovery); outsourcing A is net-negative — do
it; overtime changes nothing here, don't pay for it."*

## Next

This is the last engine-only step. The first **new UI** — a constraint load/Gantt
with drag-to-resequence calling `whatIf` live — is built on this. Then Layer 4
feeds actuals back to tune Layer 1's per-unit minutes.

## Status

Engine only, tested (sequence, all levers, costing, diminishing-returns case).
Required a Layer 1 fix to pass through planning fields (`loading_in`, `dest`,
`pcs`, `stage_index`); orchestrator baseline re-verified intact.
