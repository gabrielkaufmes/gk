# Production flow (queue over time)

`src/engine/flow.mjs` + `src/components/FlowBoard.jsx`. Models production as a
**queue that moves through time**, not a load snapshot — because a real line is
never "2700% loaded", it has a backlog that takes days to clear.

## Why this replaces "% load" at scale

A single-day capacity view divides a multi-week backlog by one day's capacity and
reports absurd percentages (2000%+). That number is meaningless: the station isn't
"20× overloaded", it has ~20 days of queue. The honest questions are **how many
pieces are waiting, is the queue growing or shrinking, and will pieces finish before
their deadline.** Flow answers those in pieces and days.

## The model

- **Start state**: pieces already `in work` (500) + `waiting` to be released (300).
- **Arrivals**: each day a random `50–150` new pieces enter, each with a deadline
  **2–4 weeks** out.
- **Throughput**: the line completes `100–140` pieces per shift, earliest-deadline-first.
- **Shifts are solved from DEADLINES, not backlog.** Each day, each station looks at
  the pieces that *must run today* to still ship on time (due-day minus the remaining
  downstream lead time ≤ today) and opens just enough shifts — **1, 2, or 3** — to
  clear them: `shifts = ceil(mustToday / throughput)`, capped at 3. A big backlog all
  due weeks out stays at **1 shift**; a small batch due tomorrow can need **3**. If
  even 3 shifts can't clear what's due, the day is flagged **escalate** (pull work
  forward / renegotiate / outsource). Only `cut, weld, fitting, glaze, pack` can take
  extra shifts.

## `simulateFlow(cfg)` → `{ days[], summary }`

Each `days[]` entry: `{ day, arrivals, backlogStart, done, secondShift, backlogEnd,
atRisk, lateToday }`. `summary`: `{ peakBacklog, endBacklog, totalLate,
secondShiftDays, clearedByDay, avgArrivals, avgDone }`.

All `cfg` knobs are in `FLOW_DEFAULTS` (start state, arrival/throughput ranges,
deadline window, risk thresholds, which stations allow a 2nd shift). `seed` makes a
run reproducible.

Reference run (500+300 start, 28 days): peak backlog ~893 pcs, drains to ~38, **0
late**, 2nd shift fired ~2 days. No quantity is ever expressed as an impossible %.

## `FlowBoard.jsx`

- **KPIs** in pieces: backlog now, peak, day-28 backlog (draining/growing), late
  pieces, 2nd-shift days.
- **Backlog-over-time** line chart with purple bands on 2nd-shift days and red dots
  on any late day; a day stepper scrubs a marker along it.
- **Arrivals vs completed** daily bars (green = single shift, purple = 2nd shift).
- **Day detail** card: backlog start/in/done/end, due-≤5-days, late today, and the
  2nd-shift recommendation for that day.
- **Knobs**: in-work, waiting, and a reseed for a different random arrival stream.

## Relation to the rest

This is the planning-horizon view; the orchestrator handles per-order deadline
triage and `capacity.mjs` the per-station shift detail. Flow ties them across weeks
and is where the 2nd-shift decision actually lives. The earlier `%`-based
`FloorLoad`/`StationLoad` remain for single-horizon station inspection but should
not be read as "load over 100% = N× overloaded" — that's what flow corrects.

## Full grid: `gridFlow` + `FlowGrid.jsx`

The flow board's summary tiles hide the per-station detail. `gridFlow(cfg)` returns
the **complete station × day matrix**: backlog cascades through the line
(`cut → weld → clean → fitting → glaze → qc → pack`) — each station receives
upstream output, works its queue at its own throughput (×2 on a warranted 2nd
shift), and passes completed pieces on.

Returns `{ stations, days, grid: {station:[{day,backlog,done,second,daysOfWork}]},
byDay, peak, bottleneck }`. Per-station throughput is `THROUGHPUT_DEFAULT`
(cut/clean are the slow ones), overridable via `cfg.throughput`.

`FlowGrid.jsx` renders it as a heatmap: rows = stations, columns = all days, each
cell coloured by **days of work waiting in that station's queue** (never an
impossible %), numbered with either pieces-in-queue or days-of-work (toggle). The blue dot on a cell means a **2nd shift is suggested** that day (queue > 1.5× a
shift). **Tap any cell** to open a detail panel: backlog start, pieces received from
upstream, capacity (1 or 2 shifts), completed, carried to next day, the shift
recommendation in plain words, and a mini per-station trend you can tap to jump
across days. The bottleneck row is flagged ◆. All stations, all days, at once.


## Realistic output: scan-driven, never flat

Output is **not** a constant rate. Two ways it's set:

1. **From scans (production).** Pass `cfg.scans = { station: [day0, day1, …] }` — the
   actual completed-piece counts from WHNet.Skany. That count IS the day's output
   (it already reflects whatever shifts ran, breakdowns, absences). Cells show
   `from scans`.
2. **Simulated (planning/mockup).** When no scans are given, each station's daily
   output is drawn from a **variance envelope** (`VARIANCE_DEFAULT`): a normal-day
   band (e.g. cut 60–115% of nominal) plus an occasional **breakdown day** (cut 8%
   chance → ~35% output). So no two days are identical — cut might do 222, 188, 192,
   168, then a jam day at 99. The envelopes would be **fitted per station from scan
   history**.

The entry station (cutting) also runs extra shifts to keep pace when its queue is
genuinely building, so it drains instead of sitting pinned — a real bottleneck still
escalates, but the line doesn't show a frozen number forever.


## Today divider: actual (left) vs planned (right)

`cfg.today` (day index) splits the grid. A **red vertical line** marks today:

- **Left of today = actual.** Each cell is the pieces actually completed that day,
  from scans (`cfg.scans`). This is history — what the floor really did per day.
- **Right of today = planned.** Each station runs **to capacity** day after day,
  draining the backlog, until backlog + incoming drops below one day's capacity —
  after that it only plans what's actually arriving (the tail tapers naturally).

Each cell carries `phase`. The number means something different per phase:
- **Past** → `done` = that station's OWN realised output that day (from scans or its
  own variance envelope) — varies station to station, not an echo of upstream.
- **Today** → two numbers, `doneSoFar` / `planned` (the shift is partway, so part of
  the plan is already complete). Shown stacked in the cell and as "done / planned".
- **Future** → `done` = planned output run to capacity (×shifts), draining backlog.
Past cells are muted + `scan`-tagged; future ≥2-shift cells carry the shift badge or
⚠ escalate. One grid: variable actual on the left, today's plan-vs-progress at the
line, the capacity plan on the right.
