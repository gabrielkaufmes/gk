# Running the cockpit mockup

The cockpit (`src/components/Cockpit.jsx`) is a self-contained running mockup: it
embeds the engine logic inline and recomputes everything live, so it runs with
nothing but React.

## In Claude.ai artifacts
Open `Cockpit.jsx` as a React artifact — it renders directly (only dependency is
React; styling is inline).

## In a Vite app
```bash
npm create vite@latest planner -- --template react
cd planner && npm install
# copy src/components/Cockpit.jsx into src/
```
```jsx
// src/App.jsx
import Cockpit from "./components/Cockpit.jsx";
export default function App() { return <Cockpit />; }
```
```bash
npm run dev
```

## What you can do in it
- **Click any station** in the load list to inspect its schedule (pins the binding).
- **Apply a what-if lever** (+ Worker / + Shift / +2h Overtime / Outsource latest) —
  the schedule, lateness, and euro cost recompute instantly.
- **Apply ✓** commits a capacity lever into the line, so the bottleneck shifts and
  you can chase the next constraint.

## Relation to the real engine
The cockpit's inline logic mirrors `src/engine/*`. For production, replace the
embedded functions with imports from `../engine` and feed real orders/stations —
the component's render logic stays the same. See `INTEGRATION.md`.

## How the euro figure is calculated

Each lever has a **direct cost** plus a **late-penalty change**; the net is the sum:

```
net €  =  deltaCost  +  latePenaltyDelta
latePenaltyDelta = (lateMinutesAfter − lateMinutesBefore) / 60 × €25
```

Direct costs (editable in `COST`): +Worker `€180×shifts`, +Machine `€1200 + crew×€180`,
+Shift `€220×workers`, +2h Overtime `2×€38×workers`, Outsource `minutes×€1.40`.

A lever that erases lateness produces a **negative** latePenaltyDelta (a saving)
that can outweigh its cost → **net negative = saves time *and* money**. A lever
that adds capacity but doesn't change the schedule leaves the penalty at €0, so you
simply pay its cost for nothing → "no change", don't do it.

## Machine-paced vs people-paced stations (important)

Throughput lanes are **not** the headcount at a machine station:

```
lanes = machines ? min(machines, floor(workers / crew)) : workers
```

- **Schirmer cutting** = 1 machine, crew 2 (one loads, one unloads). A 3rd worker
  adds **no** lane — the machine sets the pace — so +Worker correctly shows
  "no change". Removing a worker drops below crew → 0 usable machines → the station
  stalls. The lever that actually adds throughput here is **+Machine**.
- **Welding** = 3 machines, 1 each → 3 lanes; a 4th worker is capped at 3.
- **Benches** (fittings, glazing, QC) have no machine → people-paced, so +Worker
  *does* add a lane.

This matches `src/engine/capacity.mjs` (`usableMachines`) and `line.mjs`
(`stationLanes`): people-paced stations with no `machines` field behave exactly as
before (backward compatible).

## Levers you can actually pull

A cut-station overload with one machine, the same crew, and no subcontractor has
exactly **two** real levers — and the cockpit shows only those:

- **Overtime** — solves for the hours needed (below). Uses the crew you have.
- **+ Shift** — a 2nd shift also clears the backlog, but it adds a *whole* shift of
  capacity. The cockpit reports how much of that new shift the backlog actually
  uses; if it's low (e.g. 19% for a 1.5h backlog), it warns "open it only if
  there's other work to fill it", and you can compare its cost (€440) against
  overtime (€114).

Removed as non-options: **+Machine** (can't add a saw on the day — a capital
project, not a shift decision), **Outsource** (no subcontractor for cutting), and
**+Worker** (machine-paced — a 3rd person can't speed one machine).

### Overtime solves for the hours

Overtime is no longer a fixed "+2h". It **solves for the minimum hours** needed to
clear the backlog at the binding station: it finds the worst lateness, rounds up to
the next half-hour (capped at a realistic 4h), and reports that number and its cost
(`hours × €38 × crew`). If the backlog exceeds the cap it says "max — partial".

Example (seed shop): cut has 15 late orders but the worst is only 1.5h late →
**1.5h overtime clears all 15, cost €114** (1.5 × €38 × 2 crew). That is the
answer to "just tell me how much".

> Earlier versions modelled overtime as a capacity bump while leaving deadlines
> fixed, so it wrongly reported "no change". Fixed: overtime extends the production
> window, recovering every order whose lateness fits inside it.
