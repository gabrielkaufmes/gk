# Next steps

Where the module stands and what to do next, split into **immediate** (days–weeks,
unblock real use) and **strategic** (the arc toward a production brain that steers).

## Where we are

- **Engine (logic):** complete through Layers 1–4 plus the line builder. Pure,
  tested end-to-end (`npm test`, 21/21). Orchestrator baseline never regressed.
- **UI:** LayoutModeler, LineBuilder, Orchestrator, PipelineDashboard, WflPlayground
  — all on sample data, with documented persistence/API seams.
- **Honest gaps:** components aren't wired to live data; the L2–L4 intelligence
  (capacity, OEE, sequencing, what-if, forecast) has engine functions but no
  dedicated UI yet; machine steering is deliberately advisory-only.

## Immediate (unblock real use)

1. **Feed the line real item counts.** Today LineBuilder uses a sample `demo`
   piece count per station. Wire the actual day's items (from the order book /
   material-prep optimization output) through `codeFilter` so load bars reflect
   real orders. *Highest-value, smallest change.*
2. **Wire one read-only data path.** Pick the SQL projection in `INTEGRATION.md`,
   expose it as a REST endpoint, and feed `orchestrate()` + `lineReport()`. Prove
   the regression baseline still holds on live data before building more.
3. **Persist the configs.** Save/load the line JSON, the layout `{zones,objs}`,
   the info-box config, and the engine `cfg`/`COST_DEFAULT` to your store. Replace
   the Export/Import textareas with real load/save.
4. **Resolve binding once.** Have the app compute the binding station from
   `capacityReport` and pass it to `sequence`/`whatIf` via `opts.station` (the one
   wiring nuance from L4 docs), so every view agrees on the constraint.

## Strategic (the production-brain arc)

5. **Build the L2–L4 UI — the constraint cockpit.** A Gantt of the binding station
   (`sequence().timeline`), drag-to-resequence calling `whatIf` live, the OEE
   breakdown, and the 24–48h bottleneck forecast. This is where the manager stops
   firefighting and starts steering — built now because the numbers underneath are
   tested and honest.
6. **Close the learning loop for real.** Stream scan timestamps into
   `recordActuals` → `calibrateRates` nightly, writing tuned per-unit minutes back
   to the rates store. The work-content model becomes self-correcting per station;
   surface the audit so planners trust it.
7. **Address-aware truck consolidation.** Replace `dest`-string grouping with
   geocoding so the planner suggests *which* order to pull forward to fill a short
   truck, and routes legitimately shareable loads together.
8. **One brain, many views.** Make LayoutModeler a consumer of engine output:
   binding station and its calls-to-action light up on the floor map; live dots
   slow at congested stations. The line builder, orchestrator, and floor all read
   the same `computed` rows.
9. **Machine steering — only after hardening.** When controls integration exists,
   let approved actions write setpoints (PLC/MES). Until then the engine proposes,
   a human approves, and every proposed-vs-accepted action is logged.

## Suggested sequence

```
Immediate:  1 → 2 → 3 → 4     (real data flowing, configs persisted)
Strategic:  5 → 6 → 7 → 8 → 9 (cockpit, learning, consolidation, unify, steer)
```

Run `npm test` after every change; the baseline (Lyon 84/READY, Paris 62/short-18,
2 criticals) plus the 21 assertions are the contract that the engine stayed honest.
