# Multi-day load & floor plan

`src/engine/multiday.mjs` (logic) + `src/components/FloorLoad.jsx` (view).
Spreads the full work-content backlog across working days and shows it draining on
the factory floor plan.

## Why

A day's order book (200 orders / ~1188 pcs) is several days of work — a single-day
capacity view just shows everything red. The multi-day planner answers the real
question: **how many days to clear each station, and what's the load each day.**

## `multiDayPlan(elements, stations, { days })`

`elements` = work-content rows (`computeBatch`); `stations` = per-day config
(workers/machines/crew/shifts/effective). It drains each station's total required
minutes at its **per-day** capacity, carrying the remainder forward.

Returns:

```jsonc
{
  "maxDaysToClear": 5,
  "binding": "clean",
  "stations": [
    { "station": "clean", "totalReq_min": 3660, "dayCap_min": 816,
      "daysToClear": 5,
      "perDay": [ { "day": 1, "load_pct": 449, "over": true }, … ] }
  ],
  "byDay": [ { "day": 1, "load": { "clean": 449, "cut": 356, … }, "anyOver": true } ]
}
```

Example (the seed plant): corner cleaning takes **5 days** to clear, draining
449 → 349 → 249 → 149 → 49%; cutting 4 days; welding 3.

## `FloorLoad.jsx`

The 80×30 m hall with each station as a positioned box, plus:

- **Day stepper** (slider + numbered buttons; days with any overload tinted red) —
  step through and watch the floor drain.
- **Each station box** colored by the selected day's load, filled proportionally,
  showing the day's % (or ✓ when cleared) and a **days-to-clear badge**.
- **Flow arrows** along the main line (cut → weld → clean → fitting → glaze → pack).
- **Inspector** — click a station for its per-day drain as a bar chart; click a bar
  to jump to that day.

## Notes

- "Day" = one shift-capacity of work cleared; the rest carries forward. It assumes
  the backlog is available to work (materials in, upstream feeding) — couple with
  the orchestrator's materials gate for a true release schedule.
- Per-day capacity honours the machine-paced rule (`capacity.mjs`): machine
  stations are bound by staffable machines, not raw headcount.
