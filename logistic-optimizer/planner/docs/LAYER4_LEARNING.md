# Layer 4 — Closing the loop (calibration + forecast)

`src/engine/learning.mjs`. Makes the engine learn: it records what the floor
actually did, folds the variance back into Layer 1's per-unit minutes, and
forecasts bottleneck risk for upcoming shifts.

```js
import { recordActuals, calibrateRates, forecastBottleneck, ALPHA_DEFAULT } from "./src/engine";
```

## `recordActuals(plannedByStation, scans)`

`scans = [{ id, station, in_ts, out_ts }]` (epoch ms). Actual dwell = `out − in`;
the gap between consecutive stage scans **is** the real per-station time. Returns
per station: `planned_min`, `actual_min`, `variance_min`, `ratio` (>1 = slower
than planned).

## `calibrateRates(rates, history, alpha?, damping?)`

`history = { station: [ratio, ratio, …] }` (recent shifts). For each station:

```
rolling = mean(ratios)
ewma    = exponential weighting by alpha
blend   = (1-alpha)·rolling + alpha·ewma
factor  = 1 + (blend-1)·damping        # damped so one noisy shift can't whipsaw
```

Then it scales that station's per-unit minutes by `factor`. **`alpha` is exposed**
(aligned): `0` = pure rolling (smooth, slow to react), `1` = pure EWMA (recent
shifts dominate). Returns a **new** rates object (never mutates) plus an `audit`
(`rolling`, `ewma`, `blend`, `applied_factor`) so calibration is never a black box.

This writes back to the same shape Layer 1 reads — the work-content model
self-calibrates per station over time, exactly as specified.

## `forecastBottleneck(shiftsAhead, stations, trendByStation, rates?)`

`shiftsAhead = [{ label, descriptors }]` — the known order book per upcoming shift.
`trendByStation = { station: ratio }` — observed drift (from `recordActuals`).
For each shift it projects load% per station (`required × trend / capacity`) and
flags `ok` / `at_risk` (≥85%) / `overbooked` (≥100%).

Returns `{ horizon[], next, window48, earliestOverbook, alerts[] }` — both
horizons (aligned): the **next shift** and the **24–48h window** (up to 6 × 8h
shifts). Alerts are ranked, e.g. *"weld overbooks at +2 (24h) — build capacity now."*

## What it answers

*"We keep estimating weld too fast — the model now knows it runs 1.25× and has
corrected itself. And with the current order book, weld overbooks in ~24h, so add
the shift today, not when it's on fire."*

## Wiring note

`sequence()` and `capacityReport()` each pick the highest-load station as the
binding one. Under a full multi-station load they can differ; when driving a
what-if from the capacity report's binding, pass `opts.station` to `sequence`/
`whatIf` to pin them together. The UI layer should resolve the binding once and
pass it down.

## Status

Engine only, tested (variance, alpha blend extremes, damping, multi-shift
forecast). Orchestrator baseline intact. All four layers verified threading
through the public barrel.
