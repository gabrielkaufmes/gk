# Architecture

## Layered design

```
┌──────────────────────────────────────────────────────────────┐
│  SQL Server 2019  (orders, delivery dates, materials)         │
│  WHNet.Skany      (scan events → current stage per element)   │
└───────────────────────────┬──────────────────────────────────┘
                            │  ETL / REST API  (one row per order/element)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  ENGINE  (pure, framework-free — src/engine)                  │
│                                                               │
│   orchestrator.mjs   rows ─▶ feasibility ─▶ trucks            │
│                                       └────▶ actions          │
│                                       └────▶ schedule         │
│                                                               │
│   wfl.mjs            rules(text) + rows ─▶ KPIs + actions     │
└───────────────────────────┬──────────────────────────────────┘
                            │  plain objects (computed, kpis, actions, trucks…)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  UI  (React — src/components)                                 │
│   LayoutModeler · Orchestrator · PipelineDashboard · WFL       │
│   Each is a *renderer* of engine output. No business rules.   │
└──────────────────────────────────────────────────────────────┘
```

## Why this split

The engine is the single brain. Both the schedules and the live floor map are
just different views of the same `computed` rows, so a number can never disagree
between two screens. The engine has **no DOM and no React**, which means it runs
identically in the browser, a Web Worker, or the backend — useful when you later
want the server to precompute the plan.

## Data flow, end to end

1. ETL projects each order/element to a flat row (see `DATA_MODEL.md`).
2. `orchestrate(rows)` (or a WFL program via `run(parse(src), rows)`) returns
   plain objects.
3. Components receive those objects as props and render. The layout modeler also
   owns its own `{zones, objs}` layout state, which is *presentation* data, kept
   separate from the planning rows.

## What is NOT here (deliberately)

- **No machine actuation.** The engine *proposes*. Writing setpoints to
  PLCs/MES is a separate, safety-critical integration. Keep WFL output advisory
  until that layer exists. See `INTEGRATION.md`.
- **No persistence layer.** Components expose Export/Import (JSON) as the seam;
  wire it to your store of choice.
- **No auth / API client.** `INTEGRATION.md` shows where the fetch goes.
