# Order-level flow & scan re-adjustment

`src/engine/orderflow.mjs`. Where `flow.mjs` counts pieces, this tracks identifiable
**orders** — each with its id, piece count, destination, and deadline — moving stage
by stage through the line, and produces the actual **list of orders at each station
for each day**. It re-adjusts to reality from **scan events**.

## Model

An order = `{ id, pcs, dest, dueDay, stageIdx, done, history }`. Each day, each
station takes the orders currently at its stage, sorts **earliest-deadline-first**,
and clears up to that day's capacity (shifts solved from deadlines, as in the grid).
Cleared orders move to the next station for the following day. `history` records the
day the order left each station.

## Scan re-adjustment (the key behaviour)

`cfg.scans = [{ id, station, day }]` — "order X was seen leaving station Y on day D."
Applied as **ground truth** before that day's planning:

- The order is placed **just downstream of Y** as of day D, whatever the plan said.
- If Y is the last station, the order is marked **done / shipped that day** — *"if an
  order is done earlier, take it as is"* — freeing capacity for the rest.
- The order is flagged `scanAdjusted`, and everything after it re-plans around the
  new truth on subsequent days.

So the board is not a static plan: as scans arrive from WHNet.Skany, orders jump to
where they really are and the downstream queues recompute.

## API

```js
import { seedOrders, orderFlow } from "./src/engine";
const orders = seedOrders({ count: 90, seed: 42 });
const flow = orderFlow({ orders, days: 28, scans: [{ id: "O1002", station: "glaze", day: 2 }] });
// flow.days[d-1].stations[st].orders → [{ id, pcs, dest, dueDay, dueIn, mustRun, willClear, scanAdjusted }]
```

## In the UI

`FlowGrid.jsx` detail panel: tap any station-day cell and below the numbers you get
the **order list** — id, pieces, destination, due-day/countdown, EDF order, with
markers for ✓ clears today, ⚠ must-run-or-late, and ⟲scan (re-adjusted from a real
scan). Real data replaces `seedOrders` with the SQL order book and feeds `scans`
from the scan stream.
