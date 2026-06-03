# Line builder — user-definable workstations

`src/engine/line.mjs` (logic) + `src/components/LineBuilder.jsx` (UI). Lets you
declare the production line yourself: each workstation's people, machines,
parallelism, scan rule, code routing, and a **time model**.

```js
import { defineLine, lineReport, stationCapacityMin, stationLanes, EXAMPLE_LINE } from "./src/engine";
```

## Station schema

```jsonc
{
  "id": "cut_schirmer",
  "label": "Cutting 1 · Schirmer",
  "people": 2,
  "machines": 1,              // 0 = manual / no-machine station
  "peoplePerMachine": 1,      // staffing needed to run one machine
  "shifts": 1,                // 1–3
  "effective": 0.85,          // station utilisation (setup/breaks)
  "scan": "per_piece",        // per_piece | per_batch | per_optimization
  "codeFilter": ["monoblock_frame"],  // [] = handles everything; else only these codes/types
  "time": { "model": "per_piece", "seconds": 20 }
}
```

## Time models

| Model | Fields | Meaning | Example |
|-------|--------|---------|---------|
| `per_piece` | `seconds` | fixed seconds per piece | Schirmer 20s, monoblock 35s |
| `per_batch_of` | `secondsPerBatch`, `batch` | seconds per group of N → per-unit = /batch | Welding 180s per 4 = 45s/unit |
| `manual` | `minutes` | flat minutes per element | specials |
| `optimization` | — | no per-piece time; produces bar bundles | material prep |

## Parallelism (the key rule)

Throughput is bounded by **both** people and machines:

```
lanes      = machines ? min(machines, floor(people / peoplePerMachine)) : people
capacity   = lanes-equivalent × shifts × 8h × 60 × effective
```

So 2 machines with 1 person each = 2 lanes (capacity doubles); but 3 machines with
only 1 person at `peoplePerMachine:1` = 1 usable lane — you can't run iron you can't
staff. A no-machine station (material prep) is bounded purely by people.

## Code routing

`codeFilter` limits which items a station processes. The monoblock saw fed the
whole day's item list counts **only** monoblock frames; the double-mitre saw only
its blind mullions + additional profiles. This models "define which codes go here".

## The eight reference stations (`EXAMPLE_LINE`)

Encodes exactly the examples given: material prep (3P/0M, optimization), Schirmer
(2P/1M, 20s), double-mitre (1P/1M, 15s, coded), monoblock (1P/1M, 35s, coded),
steel (2P/2M, 15s), screwing (2P/2M, 25s), fittings-frames (1P/1M, 35s, frames),
welding (3P/3M, 180s/4). Validated: welding 1200 units → 900 min; monoblock saw
ignores non-monoblock; steel/screwing show 2 parallel lanes.

## UI

`LineBuilder.jsx`: list of stations with live capacity bars and a BOTTLENECK badge
on the highest-load station; an editor for people/machines/peoplePerMachine/shifts/
effective, the time model (with the right fields per model), scan rule, comma-sep
code routing, and notes; reorder/add/delete; Export/Import the whole line as JSON.
A summary strip shows total stations, people, machines, and the current bottleneck.

## How it connects

This is the real, user-defined version of Layer 2's station config. `lineReport()`
returns the same binding-station concept the orchestrator/sequence layers consume,
so a line you build here can feed capacity loading, sequencing, and what-if. The
per-piece/per-batch seconds are the measured-time inputs Layer 4 calibrates.

## Status

Engine tested against all eight examples (parallelism, every time model, code
routing). UI on sample demand. Orchestrator baseline intact — additive.
