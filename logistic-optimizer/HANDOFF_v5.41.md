# Logistic Optimizer — Handoff (v5.41)

**Last shipped build:** `logistic-optimizer-phase5.41.zip`
**Date of handoff:** 2026-06-03
**Owner/user:** Gabriel — dispatcher/production planner at **Elwiz** (Polish PVC + ALU window & door factory, plants in Świdnica + Zielona Góra).

---

## 0. HOW TO USE THIS DOCUMENT
Read top to bottom once before touching code. The single most important rule is in §1. The architecture invariants in §4 are what keep changes from breaking things. §7 is the running changelog so you know what each version did and why. §8 lists open/known issues. §9 is the working loop for shipping a new version.

---

## 1. THE GOLDEN RULE (do not violate)
**NEVER break existing working functionality. Make surgical changes only; preserve all behavior not explicitly being changed.**

This is saved in persistent memory. It exists because a specific regression recurred *many* times across this session: **refreshing one screen stopped refreshing the other.** Gabriel got (rightly) frustrated each time. As of v5.41 this is solved structurally (see §3). Do not reintroduce per-screen refresh logic that can drift.

When asked for a change: identify the minimum edit, make it, validate, and confirm you did not touch unrelated behavior. When in doubt, say what you're about to change and why before doing it.

---

## 2. WHAT THE APP IS
An **Electron desktop app** (Electron 34, Node 24, `mssql` 11, sandboxed renderer) that reads—**strictly read-only**—two SQL Server 2019 databases at `192.168.10.8\SQL_2019`:
- **Aluplast** — order-level data (one row per order).
- **WHNet** — workstation scan events (element-grain; one row per element × scan).

The app helps Gabriel plan production and (eventually) logistics: batching, pallet/truck loading, route optimization, own-truck-vs-partner (Damian) cost decisions. Today it is a **reporting + production-tracking** tool; the optimization/route modules are future work.

Persistent config (connection, queries, mappings, settings) is stored in **`mapping.json`** in `%APPDATA%`.

Major customer: **F24** (French distributor, ~18% revenue). ~95% of deliveries go to France.

### Screens (left ribbon)
1. **Orders** — order-grain table grouped By status / By prod week. Rich filters (customer, order type, STR_STI_STP_MRK, NoFr, orderTypeDetail).
2. **Production** — element-grain tracking with 3 views: **By order**, **By element**, **By section**. Pipeline scan strips, pressure bars, materials chips, stuck detection.
3. **Mapping** — Connection tab + per-query SQL editor tabs (`sql_01`, `sql_05_LATEST`, …) + Variable mapping + Status mapping.
4. **App Spec** — living documentation / lineage tables.

---

## 3. THE REFRESH MODEL (critical — read this)
**As of v5.41 there is exactly ONE refresh button**, located in the **left ribbon under the version label** (`#sbRefreshBtn`). There are **no per-screen Refresh buttons** anymore (removed from both Orders and Production headers).

**Flow:** ribbon button → `refreshOrders()` (in `app.js`) runs **all** queries in `currentMapping.queries`, caches successful results into the shared `lastResultRows[queryId]`, renders Orders, then calls `window.Production.refreshFromCache()` which rebuilds Production from that same fresh cache. **One button, both screens, one code path — they cannot drift.**

Supporting mechanisms (keep all of these):
- `window.refreshOrders = refreshOrders;` — exposed globally (app.js, right after the function) so any module can trigger the unified refresh.
- `Production.refreshFromCache()` — rebuilds Production's model from `lastResultRows[spineId()]` **without** re-running SQL. **Hardened:** if the spine query's rows are missing/empty (e.g. it aborted in the batch), it does **nothing** rather than blanking Production. Also clears `#prodBanner`.
- `Production.onShow()` — on **every** show, if spine rows exist in cache, it rebuilds from cache and renders (this restored the pre-S2 "rebuild on show" behavior). First open with no cache routes through `window.refreshOrders()`.
- The ribbon button shows a **spinning icon** while running (`.sb-refresh.refreshing` + `@keyframes sb-spin`). `refreshOrders` adds/removes `.refreshing` at all three exit points and uses `#sbRefreshBtn` as its `btn`.

**Why it kept breaking before v5.41:** the link relied on the heavy `sql_05_LATEST` query (~17s, ~11–12k rows) succeeding inside the combined Orders batch. When it **aborted**, the shared cache stayed stale and Production didn't update → looked "disconnected." The v5.40/v5.41 changes (don't-blank-on-empty + single button) removed that fragility.

---

## 4. ARCHITECTURE INVARIANTS (do not break)
- **Production is a self-contained module** exposing `window.Production = { init, onShow, refresh, refreshFromCache }`. It reads host globals but owns its own DOM (`#prodListInner`, `#prodBanner`, header bits) and its own settings (`currentMapping.production`).
- **Shared host globals** (in `app.js` scope, used by Production):
  - `lastResultRows` — `{}` keyed by query id; the cross-screen cache. (`const`, app.js top.)
  - `getConnectionConfig()` — reads the Connection form inputs.
  - `scheduleAutoSave()` — debounced persist of `currentMapping`.
  - `escapeHTML` / `escapeAttr`.
  - `window.sqlAPI.runQuery` — the IPC bridge to run SQL.
  - `window.refreshOrders` — unified refresh.
- **Mapping seam:** `COL_DEFAULTS` + `getCol()` in production.js; variable mappings are namespaced under `currentMapping.variableMappings.production`.
- **`migrateMapping` is idempotent.** `seedQueryRoles()` and `seedProductionDefaults()` never overwrite user-set values.
- **Query roles (multi-query engine, "S2"):** each query has a `role`: `spine` (element grain, the one Production groups by `key_Element`), `order-join` (merge by `orderNo`), or `element-join` (merge by `key_Element`). `orderNo` is the ONLY order merge key (first-wins per orderNo). `spineId()` resolves the spine via: keyElement's source if tagged spine → first query tagged `spine` → legacy `sql_05` → first query. `orderJoinId()` returns the single `order-join` query.
- **Materials reuse `sql_01`** (order-join) — there is NO separate materials query. Both real queries share an 8-status whitelist, so every Production order has a matching `sql_01` row.

---

## 5. THE DATA / QUERIES
Two real queries (Gabriel's, pasted earlier in the session). The repo `config/default-*.sql` files are **stale** and do not match these shapes — ignore them as anything but placeholders.

### sql_01 — order grain (1 row per orderNo), role `order-join`
Aliases: `orderNo, customerCode, product, pcs, OrderType, STR_STI_STP_MRK, NoFr, OrderTypeDetail, status, Loading (from o.dlalogistyki), FinancialValDate, dd, termRe`, plus per-material `matX_orderNo / matX_confirmed / matX_actual` for X in **P, F, A, G, R, D, O**, plus `deliveryCity, notesInitial`.
`matX_orderNo` = the PO number, **ignored by the app.** WHERE `stan IN` an 8-value whitelist (Akceptacja finansowa, Waiting ordering, Planowanie, Waiting for Comarch, Mat_zam, Planowanie do OPT, Do produkcji, Magazyn wyrobów gotowych).

### sql_05_LATEST — element grain (1 row per element × scan), role `spine`
**Tab label is "sql_05_LATEST"; its query id is most likely `sql_02`** (ids are minted sequentially `sql_NN`; the *name* is free text). Spine resolution is role-based so this still works.
Key aliases: `orderNo, OrderProductFromOferty, key_Frame, [F/S], key_Element (..._PC###_F or ..._PC###_S###), FrameWidth/FrameHeight/SashWidth/SashHeight, Color, Last_No, LastScanData, LastEnglishTranslation, LastPROD_Status, Zakonczone, ScanData, ScanStanowisko, No, EnglishTranslation, PROD_Status, [DD-1], promisedDeliveryDate, Date_OrderStatus`, etc.
Stricter `StatusToggleTable` (only 3 statuses IncludeStatus=1: Planowanie do OPT, Do produkcji, Magazyn wyrobów gotowych) + a ±30-day window. Heavy: ~11–12k rows, ~17s.
**Important:** every sql_05 row carries BOTH frame dims and sash dims (they come from the same element record). See dim bug fix in §7 (v5.38).

---

## 6. FILE MAP (working dir: `/home/claude/logistic-optimizer/`)
- **`public/index.html`** (~521 lines) — app shell. Sidebar/ribbon at top: `.logo`, `#appVersion` (line 17), **`#sbRefreshBtn`** (line 18, the unified refresh), then `<nav>`. Orders screen + Production screen + Mapping + App Spec markup. **Version string lives at line 17.**
- **`public/app.js`** (~4341 lines) — Orders, Mapping, App Spec, connection, query runner, shared globals. `refreshOrders()` ≈ line 2571. Sidebar wiring + `wireSidebarRefresh()` ≈ line 187–200. `getConnectionConfig()` ≈ line 242. `ensureDefaultQueries()` ≈ 590.
- **`public/production.js`** (~1491 lines) — the self-contained Production module (IIFE → `window.Production`). `COL_DEFAULTS` ≈ line 40. `spineId()` ≈ 158. `buildModel` order loop + pcs computation ≈ 660–700. `buildDims` (F/S-aware) ≈ 690. `ORDER_GRID_TEMPLATE` = **line 874** (16 tracks). Render fns: `renderByOrder`, `renderOrderHeaderRow`, `renderOrderRow`, `renderByElement`, `renderBySection`, `renderSectionOrderRow`. `pipelineStripHTML` (furthest-reached marker). Public API ≈ line 1436.
- **`public/style.css`** (~2128 lines) — global + Orders + sidebar. Ribbon refresh button CSS (`.sb-refresh`, `@keyframes sb-spin`) at the END of the file. Orders `.hdr-right-cluster` anchoring at the "Phase 5.34" block. `.run-indicator` pulsing dot near end.
- **`public/production.css`** (~321 lines) — Production-only. `.prod-orow` (no hardcoded template — comes from inline `orderGridStyle()`), `.prod-orow-hdr` (sticky top:30px), `.prod-grp-hdr` (sticky top:0, pinned 30px), `.prod-orow.open` (sticky open order row top:52px), materials/date chip states, pipeline chips.
- **`config/default-*.sql`** — STALE placeholders. Not the real queries.
- **`public/vendor/`** — bundled libs (CodeMirror etc.).

---

## 7. CHANGELOG (this session: 5.24 → 5.41) — what & why
- **5.24–5.27** Orders polish: week-view header gap (pin outer `.grp-hdr` to 30px); Description column reaching right edge (`.list-inner` width:max-content; min-width:1500px); CUST cell full-height (`align-self:stretch`).
- **5.28** Rebuilt Production **By section** to mirror Orders By-status (section bands, collapsible via `collapsed` Set keyed `psec:<status>`).
- **5.29 (S2)** **Multi-query engine.** Query roles (`spine`/`order-join`/`element-join`), `seedQueryRoles()`, join lookups in buildModel, field accessor `f(r,varName)`, refresh fetches spine + referenced join sources.
- **5.30–5.32 (S3)** Materials chips + Loading in Production; then **removed the column-visibility checkboxes** ("lottery" bug) and made all those columns **permanent**.
- **5.33** Production header ISO week; fixed By-section row layout; widened mat-dates; added DD + TermRe (order-grain from sql_01); pipeline border = furthest reached; sticky group-header flush.
- **5.34** Orders Refresh anchored top-right (`.hdr-right-cluster`, absolute, scoped `#screen-orders`); expanded order row sticky (`top:52px`); Production **Collapse all / Expand all** button (`#prodToggleAll`, `updateToggleAllLabel()`).
- **5.35** Restored linked refresh: `onShow` rebuilds from cache on **every** show (regression from S2).
- **5.36** Unified refresh both directions + "Running…" indicator on both buttons. Exposed `window.refreshOrders`.
- **5.37** Fixed Production "Connection not configured" banner: first-open routes through `window.refreshOrders`; `refreshFromCache` clears `#prodBanner`.
- **5.38** **Dim bug fix (app logic, not SQL):** every sql_05 row has both frame & sash dims; old `buildDims` always preferred frame → sash rows showed frame dims. Now `buildDims(r, f, fs)` picks the pair by the element's F/S type. (F → frame dims, S → sash dims, with fallback.)
- **5.39** Relabeled "stuck" → "pcs" in totals + By-order group headers (**PURE TEXT relabel** — the underlying number is still the stuck-element count; FLAGGED to Gabriel, awaiting confirmation if he wants a real piece count). Renamed columns **ELEM→el_T, DONE→el_D**. Added **pcs_T** (distinct `key_Frame` per order; sash-only pieces fall back to distinct element key) and **pcs_R** (pieces where ALL elements done). Grid grew to 16 tracks.
- **5.40** Hardened linkage: `refreshFromCache` no longer blanks Production when spine rows are empty/missing; Production button (then still present) fetched its own data + triggered Orders.
- **5.41** **Refresh redesign.** Removed Refresh from both headers; added single **ribbon Refresh button** (`#sbRefreshBtn`) under the version label; it runs all mapping queries and updates both screens. Spinning icon while running. This is the structural fix for the recurring disconnect.
- **5.42 (CURRENT)** **Real piece count in aggregates.** The totals bar (`updateTotals`) and By-order **week group headers** now show the actual piece count under the **"pcs"** label — sum of per-order `pcsT` (one frame = one piece; sash-only orders count sashes) — instead of the stuck-element count. Stuck is still shown, now as its own **"stuck"** number (red). Resolves open item §8.1. The per-order `pcsT`/`pcsR` definition (production.js ~675) was unchanged — it already encoded the frame-else-sash rule.

---

## 8. OPEN / KNOWN ITEMS
1. **"pcs" relabel semantics (from 5.39) — RESOLVED in 5.42.** The totals bar and By-order week group headers now show a real piece count (sum of per-order `pcsT`: one frame = one piece; sash-only orders count sashes). Stuck moved to its own labeled number. Confirmed rule with Gabriel 2026-06-03.
2. **`sql_05_LATEST` is heavy (~17s).** It occasionally aborts. The app now tolerates this (doesn't blank Production), but the refresh feels slow. Future: consider server-side narrowing or incremental fetch.
3. **Route column** renders `—` everywhere (no route data source yet). It's a permanent placeholder for the future route-builder module.
4. **Row width:** with 16 permanent columns the Production order row is ~1700px; horizontal scroll appears on narrower windows. Expected.
5. **By section** was historically fragile (column-count mismatches between the shared header and the section rows). It's aligned now (16 cols everywhere). If you change the column set, update **all three**: `ORDER_GRID_TEMPLATE`, `renderOrderHeaderRow`, `renderOrderRow`, AND `renderSectionOrderRow` — they must all emit the same number of cells.

---

## 9. DEV LOOP (how to ship a version)
1. Make the surgical edit(s).
2. `node --check public/app.js && node --check public/production.js` — must pass.
3. If you changed the order column set, **count tracks vs cells**: template tracks must equal header cells must equal row cells (By order AND By section). Current = 16.
4. Bump the version string at **`public/index.html` line 17** (`v5.41` → next).
5. Zip: `cd /home/claude && zip -r /mnt/user-data/outputs/logistic-optimizer-phaseX.YY.zip logistic-optimizer -x "*/node_modules/*"`
6. `present_files` the zip with a concise summary.
7. Gabriel runs `npm run dev` from the extracted folder and sends screenshots (often with red annotations). He's decisive, wants surgical changes, and pushes back hard on regressions and scope creep. Confirm ambiguous design questions with `ask_user_input` BEFORE building (esp. anything touching data semantics).

---

## 10. PRODUCTION COLUMN ORDER (current, 16 tracks)
`ORDER_GRID_TEMPLATE = '28px 140px 150px 60px 60px 50px 50px 54px 54px 54px 160px 150px 230px 90px 130px 120px'`

caret · Order no · Status · **DD** · **TermRe** · **el_T** · **el_D** · **pcs_T** · **pcs_R** · Stuck · Slowest · Materials(7 letters) · Mat dates(7 dates) · Route · Loading · **Pressure (always last)**

- **el_T** = total elements; **el_D** = done elements.
- **pcs_T** = distinct pieces (key_Frame; sash-only → distinct element). **pcs_R** = pieces fully complete.
- Materials letters/dates: confirmed→"promised" slot, actual→delivered; overdue if actual > promised.
- Pressure bar color/width by computed pressure (red/amber/green).
- Element strip (drill-down) is **order-line-only** — optional columns do NOT repeat per element (Gabriel's explicit choice).

---

*End of handoff. The shipped artifact is `logistic-optimizer-phase5.41.zip`.*
