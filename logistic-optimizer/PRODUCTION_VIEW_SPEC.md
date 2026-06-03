# Production View — Module Specification

**Status:** Draft for review (no code yet)
**Target phase:** 5.17
**Author:** working spec for Gabriel / Elwiz Logistic Optimizer

---

## 0. Design principle: self-contained module

The Production feature is built as **one isolated module** with a deliberately
narrow contract to the rest of the app. The goal: you can rewrite, restyle, or
re-spec the whole Production view later and the change cannot break Orders,
Mapping, or App Spec.

### The only ties to the rest of the app ("the contract")

The module reads **four things** from the host app and touches **nothing else**:

| # | What it reads | Where it comes from | Direction |
|---|---|---|---|
| 1 | Raw rows of the production query | `lastResultRows['sql_05']` (the cache the Mapping screen already fills on Run preview / Refresh) | host → module |
| 2 | Connection config | `getConnectionConfig()` (already exists) | host → module |
| 3 | The SQL text of the production query | `currentMapping.queries[id==sql_05].sql` | host → module |
| 4 | Production settings (holidays + stuck thresholds) | `currentMapping.production` (NEW sub-object in mapping.json) | host ↔ module |

The module **writes** only:
- `currentMapping.production` (its own settings sub-tree), via the existing `scheduleAutoSave()`.
- Its own DOM inside `#screen-production`.

It never touches `lastOrders`, `statusMapping`, `variableMappings`, the Orders
DOM, or any other screen's state. If the Production module is deleted, the rest
of the app runs unchanged.

### Physical file layout

```
public/
  app.js              ← host. Adds ONE line: production.init() at boot, and ONE sidebar item.
  production.js       ← NEW. The entire module. ~all Production logic lives here.
  production.css      ← NEW. All Production styles. Loaded after style.css.
  index.html          ← adds: 1 sidebar <div>, 1 <section id="screen-production">, 2 <script>/<link> lines
```

`production.js` exposes a single global namespace `window.Production` with a
tiny public surface:

```js
window.Production = {
  init(),                 // called once at app boot — wires sidebar, settings, refresh
  onShow(),               // called when the Production screen becomes visible
  refresh(),              // fetch sql_05 + rebuild + render
};
```

Everything else in the module is private (closure-scoped). The host calls
`Production.init()` once and `Production.onShow()` from `switchScreen`. That's
the entire integration.

### The input-data contract (most important tie)

The module consumes the **flat rows of sql_05** exactly as returned by
`window.sqlAPI.runQuery`. The contract is the **column names** listed in §2.
As long as sql_05 keeps producing those columns, the module works. If you
rename a column in sql_05, you change it in **one place**: the `COL` map at the
top of `production.js` (§2.3). Nothing else in the module references raw column
names.

```js
// production.js — the ONLY place raw sql_05 column names appear
const COL = {
  orderNo:        'orderNo',
  product:        'OrderProductFromOferty',
  prodWeek:       'DD-1',
  orderStatus:    'OrderStatus',
  statusDate:     'Date_OrderStatus',
  promisedDeliv:  'promisedDeliveryDate',
  keyElement:     'key_Element',
  fs:             'F/S',
  color:          'Color',
  frameW:         'FrameWidth',
  frameH:         'FrameHeight',
  sashW:          'SashWidth',
  sashH:          'SashHeight',
  lastNo:         'Last_No',
  lastScanData:   'LastScanData',
  lastProdStatus: 'LastPROD_Status',
  lastEnglish:    'LastEnglishTranslation',
  lastNextStep:   'LastWorkStationNextStep',
  scanData:       'ScanData',
  scanNo:         'No',
  scanProdStatus: 'PROD_Status',
  scanEnglish:    'EnglishTranslation',
  scanNextStep:   'WorkStationNextStep',
  zakonczone:     'Zakonczone',
  optym:          'Optym',
  unmappedCount:  'UnmappedScanCountForElement',
};
```

Change a name here → whole module follows. This is the single seam.

---

## 1. Where it lives in the UI

- **New sidebar item "Production"** below Orders, above Mapping.
- Clicking it shows `#screen-production` (same show/hide mechanism as the other screens — `switchScreen('production')`).
- The screen has its own top bar:

```
┌─ Production ───────────────────────────────────────────────────────────┐
│ [today/week info]   [ALU | PVC]    [By order][By element][By section]   │
│                                       [⚙ Settings] [↔ Reset cols] [Refresh]│
├─────────────────────────────────────────────────────────────────────────┤
│ (banner: query errors / "sql_05 not configured")                         │
├─────────────────────────────────────────────────────────────────────────┤
│ (view content — scrolls; sticky headers reuse the Orders plumbing)       │
└─────────────────────────────────────────────────────────────────────────┘
```

- **ALU | PVC** is a product toggle (one active at a time). It filters everything below.
- **By order / By element / By section** is the view toggle.
- **⚙ Settings** opens the Production settings panel (holidays + stuck thresholds).
- **Refresh** fetches sql_05 and rebuilds.

---

## 2. Input data — the sql_05 contract

### 2.1 Row shape

sql_05 returns **one row per (element × historical scan)**. An element with N
historical scans appears on N rows; an element with no scans appears on 1 row
with `ScanData = NULL`. Order/element-level fields repeat identically on every
row of the same element.

### 2.2 Columns consumed (and which view needs them)

| Column | Type | Used by | Purpose |
|---|---|---|---|
| `orderNo` | text | all | order identity, grouping |
| `OrderProductFromOferty` | ALU/PVC | all | product toggle |
| `DD-1` | `yy_ww` | By order, By element | production week |
| `OrderStatus` | text | all | status tag (color from Status mapping) |
| `Date_OrderStatus` | datetime | stuck calc | when order entered production status |
| `promisedDeliveryDate` | MM/DD/YYYY | By order | shown as customer delivery date |
| `key_Element` | text | all | element identity (collapse key) |
| `F/S` | F/S/NULL | all | frame vs sash |
| `Color` | text | element detail | element color |
| `FrameWidth/Height`, `SashWidth/Height` | num | element detail | dimensions |
| `Last_No` | int 1..18 | all | current flow position |
| `LastScanData` | datetime | stuck calc, all | timestamp of current position |
| `LastPROD_Status` | text | By section | current section |
| `LastEnglishTranslation` | text | all | current station name |
| `LastWorkStationNextStep` | text | By section | label of next step |
| `ScanData` | datetime | scan trail | one historical scan time |
| `No` | int | scan trail | the flow-step of that scan |
| `PROD_Status` | text | scan trail | section of that scan |
| `EnglishTranslation` | text | scan trail | station name of that scan |
| `WorkStationNextStep` | text | queue calc | next-step label of that scan |
| `Zakonczone` | 0/1 | all | element done flag |
| `Optym` | text | element detail | optimization batch |
| `UnmappedScanCountForElement` | int | diagnostics | unmapped-scan warning |

### 2.3 Column-name seam

All raw names confined to the `COL` map (§0). Rest of module uses `COL.lastNo` etc.

---

## 3. Data model — collapse logic

Three nested objects built once per refresh, all private to the module.

### 3.1 Element object (collapse N scan-rows → 1 element)

Group all rows by `key_Element`. For each group:

```js
Element = {
  key,                       // key_Element
  orderNo,
  product,                   // ALU | PVC
  fs,                        // F | S
  color, dims,               // from any row (repeat identically)
  optym,
  zakonczone,                // done flag

  // Current position (same on every row of the element)
  lastNo,                    // 1..18, or null if never scanned
  lastScanData,              // datetime, or null
  lastStationName,           // LastEnglishTranslation
  lastProdStatus,            // current section
  lastNextStep,              // LastWorkStationNextStep

  // Scan trail (one entry per row that has a ScanData)
  scans: [ { data, no, prodStatus, stationName, nextStep }, ... ]
         // sorted ascending by data; empty if never scanned

  // Derived (computed in §4)
  stuckFrom,                 // datetime to measure stuck-time from
  stuckWorkingMs,            // working-time since stuckFrom
  isStuck,                   // bool, per product threshold
  queueNo,                   // the No this element is WAITING for (lastNo+1, or 1 if never scanned)
}
```

**Collapse rule:** the element's `lastNo` / `lastScanData` come from the
`Last_*` columns (identical on all rows). The `scans[]` array is built from the
distinct `ScanData`+`No` values across the rows (NULL ScanData → no entry).

**Never-scanned element:** `scans` empty, `lastNo` null → `queueNo = 1`
(waiting at station 1).

### 3.2 Order object (group elements → order)

Group elements by `orderNo`:

```js
Order = {
  orderNo,
  product,
  prodWeek,                  // DD-1
  orderStatus,               // for the colored tag
  promisedDeliveryDate,
  fridayDeadline,            // Friday of the DD-1 ISO week (computed §4)

  elements: [ ... ],
  elementCount,
  doneCount,                 // elements with zakonczone=1 (or lastNo at max)
  stuckCount,                // elements where isStuck

  slowestNo,                 // min lastNo across elements (null counts as 0 = not started)
  pressure,                  // 'green' | 'amber' | 'red'  (computed §4)
}
```

### 3.3 Section aggregation (for By section view)

Iterate all elements of the active product; bucket by **destination section**
(the section the element is queued *for*, = the `PROD_Status` of `queueNo`):

```js
Section = {
  prodStatus,                // e.g. '5_WELDING'  (the section label)
  sortKey,                   // leading number for ordering
  queuedCount,               // elements whose queueNo lands in this section
  stuckCount,                // of those, how many are stuck
  elements: [ ... ],         // drill-down list
}
```

A station's `No` maps to a `PROD_Status` via the **client-side copy of the
WorkstationsTable** (see §6). Sections sorted by `sortKey` ascending.

---

## 4. Working-day engine + derived fields

### 4.1 Working-day function

```
workingMsBetween(a, b, holidays):
   count milliseconds between a and b that fall on Mon–Fri
   and are NOT in the holidays set (yyyy-mm-dd strings).
```

- Weekends (Sat/Sun) excluded.
- Holidays (from settings) excluded.
- Used for stuck-time and for "working days to Friday".

### 4.2 Stuck calc (per element)

```
stuckFrom = lastScanData ?? Date_OrderStatus ?? null
if stuckFrom == null:           isStuck = TRUE     (NULL date ⇒ late by rule)
else:
    stuckWorkingMs = workingMsBetween(stuckFrom, now, holidays)
    threshold = (product == 'PVC') ? settings.stuckPVC : settings.stuckALU   // working days → ms
    isStuck = stuckWorkingMs > threshold
```

Done elements (`zakonczone=1` or at max station) are **never** stuck.

### 4.3 Friday deadline (per order)

```
prodWeek = 'yy_ww'  (DD-1)
fridayDeadline = Friday of that ISO week
if prodWeek is NULL: fridayDeadline = null
```

### 4.4 Order pressure (slowest element vs Friday)

```
slowestNo = min(lastNo over elements; never-scanned counts as 0)
maxNo = 18 (PVC) or 12 (ALU)
stepsRemaining = maxNo - slowestNo
workingDaysLeft = workingDaysBetween(today, fridayDeadline)   // 0 if past

if fridayDeadline == null:                pressure = red      (no week ⇒ late by rule)
else if workingDaysLeft <= 0 and stepsRemaining > 0: pressure = red
else:
    ratio = stepsRemaining / max(workingDaysLeft, 0.5)
    pressure = ratio <= GREEN_MAX ? green
             : ratio <= AMBER_MAX ? amber
             : red
```

`GREEN_MAX` / `AMBER_MAX` are module constants (proposed 2.0 / 3.5 — i.e. "≤2
steps per remaining working day = comfortable"). Tunable; we can expose later.

---

## 5. The three views

All three reuse the **sticky-header** and **column-resize** plumbing already
built for Orders (CSS variables + `.col-resize-handle`). The Production module
gets its own CSS-var namespace (`--pcol-*`) so its column widths are independent
of Orders' (`--col-*`).

### 5.1 View "By order"

Grouped by **prod week** (DD-1). Inside each week, one row per **order**, all
collapsed by default (100 orders/week → must collapse).

**Week group header** (sticky): `26_19 · Fri 08/05 · 42 ord · 18 stuck`

**Order row** (collapsed):

| ● | OrderNo | [status tag] | Elements | Done | Stuck | Slowest station | Deadline pressure bar |
|---|---|---|---|---|---|---|---|
| ▸ | F24_5179 | `Do produkcji` | 12 | 8 | 2 | 5 · Welding | ▓▓▓▓░░░ green/amber/red |

- Row tinted by `pressure` (green/amber/red wash).
- `[status tag]` colored with the bucket color from **Status mapping** (read-only
  read of the color — see note below).
- Click ▸ → expands to the element list (§5.1.1).

> **Status-tag color tie:** the module reads the bucket color by calling a tiny
> read-only helper `getBucketColorForStatus(orderStatus)` that looks up
> `currentMapping.statusMapping.buckets` by `erpValue`. This is a READ only; the
> module never writes statusMapping. If statusMapping is absent, tag is gray.
> This is the one *optional* tie beyond the four core ones; it degrades
> gracefully.

#### 5.1.1 Expanded order → element strips

One row per element. The row shows the **station pipeline** as a horizontal
strip of chips (the visual analog of the Orders materials chips):

```
key_Element        F/S  Color  Dim         [1][2][3][4][5][6]...[18]
F24_5179_P1_O1_PC1_F  F   White  1200×800     ✓  ✓  ✓  ●              ← ✓done ●current(bold) blank=todo
                                              08/05 ... 12/05         ← scan date under reached chips
```

- Chips colored by **PROD_Status section** (8 phases → 8 colors).
- Current chip (`lastNo`) gets a **bold outline**.
- A **stuck** element: its current chip turns **red** + the row gets a red left tint.
- Done element (`zakonczone`): row desaturated.
- ALU shows 12 chips, PVC shows 18.

### 5.2 View "By element"

Flat list of all elements (active product), **sorted by stuck working-time
descending** so the worst float to the top. Optional "show only stuck" toggle.

| Stuck | key_Element | OrderNo | Wk | Current station | Last scan | F/S | Dim | Color |
|---|---|---|---|---|---|---|---|---|
| ⚠ 4d | F24_5179_..._F | F24_5179 | 26_19 | 5 · Welding | 20/05 14h | F | 1200×800 | White |

- Row color: 0 = normal, ≥1 wd = amber, ≥2 wd (or threshold) = red.
- Never-scanned w/ NULL status-date = red ("late, unknown since when").
- Sortable columns; default sort = stuck desc.

### 5.3 View "By section"

Grouped by **PROD_Status** (the factory section). Sorted by the section's leading
number. One row per section showing the queue:

```
5_WELDING                                queued: 47   stuck: 6 ⚠
  ├ (drill: list of the 47 elements waiting to be welded, sorted stuck-desc)
6_FITTINGS_FRAME                         queued: 23   stuck: 1
  ├ ...
```

- "queued" = count of elements whose `queueNo` PROD_Status == this section
  (finished previous step, waiting here). Never-scanned land in section of step 1.
- "stuck" = of those queued, how many exceed the threshold.
- Section row shaded by load (heavier queue = darker), or simply show the number;
  **proposal: show a horizontal bar proportional to queue depth** for quick scan.
- Click a section → drill to its queued element list.

---

## 6. Client-side WorkstationsTable copy

The queue math (`queueNo → PROD_Status`, `maxNo per product`, chip section
colors) needs the **No → PROD_Status / section** mapping. The query already has
this inline, but to compute `queueNo`'s section (the NEXT step, which may not be
present on the element's own rows) the module keeps a **small static copy** of
the WorkstationsTable, reduced to distinct `(product, No) → {prodStatus,
sectionSortKey, englishName, nextStepLabel}`.

This is hardcoded in `production.js` (mirrors the SQL's VALUES list). It changes
rarely. If the factory flow changes, update this table in one place. (Future
option: surface it as an editable mapping; out of scope for v1.)

**Phase color palette** (8 sections, distinct hues) is also a module constant.

---

## 7. Production settings (⚙)

Stored in `mapping.json` under a NEW `production` key — isolated from everything else:

```json
"production": {
  "stuckThresholdPVC": 1,        // working days
  "stuckThresholdALU": 1,        // working days
  "holidays": ["2026-05-01", "2026-12-25", ...]   // yyyy-mm-dd
}
```

Settings panel (modal or inline):
- Two number inputs: stuck threshold PVC / ALU (working days, default 1).
- A **calendar / date-list** to add and remove holidays. Simple: a date input +
  "Add" → chips list with × to remove. Stored as the array above.
- Saves via `scheduleAutoSave()`.

Working-day engine reads `holidays` + thresholds from here.

---

## 8. Refresh flow (mirrors Orders, but isolated)

```
Production.refresh():
  1. read connection (getConnectionConfig)
  2. find the production query (currentMapping.queries with id 'sql_05')
       - if missing → banner "Add a query named sql_05 in Mapping" + stop
  3. window.sqlAPI.runQuery(conn, sql05.sql)
  4. on success: store rows in lastResultRows['sql_05'] (shared cache, harmless)
  5. build Elements → Orders → Sections (private)
  6. render the active view + active product
  7. on failure: banner with the error
```

No dependency on `refreshOrders` or `lastOrders`. Independent refresh button.
(If you later want one button to refresh everything, that's a host concern.)

---

## 9. What stays OUT of scope for v1

- Editing the WorkstationsTable from the UI (it's a module constant for now).
- Predicting an exact completion date (we show pressure ratio, not a date).
- Cross-product views (ALU and PVC never mixed — always one product active).
- Writing anything back to SQL (read-only, like the rest of the app).

---

## 10. Build order (once spec is approved)

1. Scaffolding: sidebar item, `#screen-production`, `production.js` + `production.css`, `Production.init()` hook. Empty screen renders.
2. Settings panel + `currentMapping.production` plumbing + working-day engine (unit-testable in isolation).
3. Data model: collapse rows → Elements → Orders → Sections. Console-verify against the xlsx.
4. View "By order" (week groups, order rows, pressure, expand→element strips).
5. View "By element" (stuck-sorted flat list).
6. View "By section" (queue depth, drill-down).
7. Wire ALU/PVC toggle + view toggle + reuse sticky/resize plumbing.
8. Package, test against live sql_05, iterate on your screenshots.

---

## 11. Open items for your confirmation

1. **Pressure thresholds** (GREEN_MAX=2.0, AMBER_MAX=3.5 steps-per-working-day) — accept as starting values, tune later?
2. **"Done" definition** — `Zakonczone=1` OR `lastNo == maxNo`? Or only `Zakonczone=1`? (some elements may sit at MG without the flag set)
3. **By section load bar** — proportional bar (my pick) vs just the number vs color shading?
4. **Settings location** — modal popup (my pick) vs a 4th tab inside the Production top bar?
5. **Element strip chips** — show scan date under reached chips (my pick) vs station number only vs hover-for-date?
6. **Status-tag color** — read from Status mapping (my pick, graceful gray fallback) vs a fixed neutral tag?

Answer these (or "yes defaults go") and I build per §10.
