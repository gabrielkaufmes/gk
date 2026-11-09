# Prebuilt controls for the Elwiz apps: analysis and proposal

Date: 2026-11-09. Scope: `offer-desk`, `courtyard-inventory` (desktop + tablet build), using the
`courtyard-inventory-design-handover` tokens and screen inventory. Method: read the repos'
`package.json`, renderer sources, stylesheets and handoff docs; checked candidate libraries against
npm (versions quoted are today's `latest`) and their GitHub sources. Nothing was changed in either app.

## 1. What the two apps are

| | Offer Desk | CourtYard Inventory |
|---|---|---|
| Shell | Electron 34, Windows NSIS | Electron 34, Windows NSIS, **plus** a Node server that serves the same React build to Android tablets in Chrome |
| Renderer | **Vanilla JS**, 16 classic `<script>` files, no bundler, CSP `script-src 'self'` | **React 19 + TypeScript + Vite 7**, zustand, lucide-react |
| Styling | one 347-line CSS file, light theme, Segoe UI + Cascadia Mono, tokens at the top | one 1,452-line CSS file, dark theme, JetBrains Mono body + IBM Plex Sans (self-hosted via fontsource), `tokens.css` documented in the handoff |
| Hand-rolled controls | `05-tablekit.js` (column filters with popup, sort, chip bar), toasts, dialogs, week navigation, timelines and gantt drawn in DOM, canvas annotation in Tickets | `ui.tsx` (Seg, Dropdown, RowMenu, ContextMenu, Kpi, Chip, Bar), `Dialogs.tsx` (Modal, DialogHost confirm/prompt, Toast), `DataTable.tsx`, `Filters.tsx` cascading selects, article pickers with 2,699 rows, count modal number inputs, 168 raw `<input>` and 37 raw `<select>` |
| Constraints stated by you | same stack as Logistic Optimizer v6; strict CSP; self-update | handoff §9: "plain CSS custom properties + React components; **no new UI framework**"; fonts self-hosted; dark required, high-contrast light wanted; gloves + scanner on the floor; 1366×768 up to 1920×1080 |

Both apps are exactly the case the video makes: every control is built from scratch, so the
"small details AI skips" (toast stacking and timing, drawer gestures, focus return from dialogs,
keyboard models in menus, number input stepping and formatting) are missing or re-implemented
per screen. The dashboards also carry the default tells the video names: uppercase tracked
labels on every KPI, identical cards, emoji icons.

## 2. CourtYard Inventory: two paths

### Path A (recommended): headless Base UI + unstyled specialists, styled with your tokens

Respects the handoff rule (no Tailwind, no styled framework). Base UI (`@base-ui/react` 1.9,
MIT, the primitives shadcn now builds on) ships **unstyled** components you style with plain CSS
through data attributes, so `tokens.css` stays the single source of truth.

| Today (hand-rolled) | Prebuilt replacement | Why it is better |
|---|---|---|
| `Modal`, `DialogHost` confirm/prompt | Base UI `Dialog`, `AlertDialog` | focus trap, return focus, Escape, nested dialogs, scroll lock, `data-open` animations |
| Count modal on the tablet | Base UI `Drawer` (bottom sheet) | gesture-driven, snap points; the glove-friendly "sheet from the bottom" pattern the video shows with Vaul |
| `Toast` (one at a time, 2.5 s / 6 s) | Base UI `Toast` or **Sonner** 2.0 | stacking, pause on hover, promise state ("Saving… → Saved ✓"), screen-reader announcements |
| `ContextMenu`, `Dropdown`, `RowMenu` | Base UI `ContextMenu`, `Menu`, `Menubar` | typeahead, submenus, keyboard model, collision-aware positioning |
| `Seg` segmented control, `.tabs` | Base UI `ToggleGroup`, `Tabs` | roving focus, arrow keys, `aria-selected` |
| Cascading Zone → Sector → Stack → Pallet `<select>` | Base UI `Select` (keeps native feel) | consistent styling, keyboard, long lists |
| Article pickers (2,699 rows, two search boxes) | Base UI `Combobox` / `Autocomplete` **+** `@tanstack/react-virtual` 3.x | filter by code / PL / ENG in one field, only visible rows rendered; today each pallet editor mounts the full list |
| Bars / Meters inputs in the count modal | Base UI `NumberField` | increment buttons, scrub area, min/max/step, locale formatting; big touch targets for gloves |
| KPI numbers (dashboard, reports) | **NumberFlow** `@number-flow/react` 0.6 | numbers animate when counts change during a stocktake; the video's "numbers that change" pick |
| Progress bars, zone progress | Base UI `Progress`, `Meter` | semantics and labels for free |
| Tooltips (`title=` today) | Base UI `Tooltip`, `PreviewCard` | delay groups, touch behaviour |
| `DataTable.tsx` + `Filters.tsx` | `@tanstack/react-table` 9 + `@tanstack/react-virtual` | sorting, faceted filters, sticky filter row, column sizing persistence (the handoff lists this as a lost feature), 594-row stocktaking grid stays smooth |
| Emoji icons in the sidebar | `lucide-react` (already a dependency) | one family, one weight |
| Scanner input | keep; wrap in Base UI `Field` + `Input` | consistent focus ring, error text slots |
| `OtpField` | Base UI `OtpField` | if you ever add a PIN login on tablets |

Install (no Tailwind, no shadcn):

```bash
npm i @base-ui/react @tanstack/react-table @tanstack/react-virtual @number-flow/react sonner
```

Styling pattern: one CSS block per component in `styles.css`, targeting Base UI's data
attributes (`[data-open]`, `[data-selected]`, `[data-highlighted]`, `[data-disabled]`) with your
existing tokens. No class-name churn in pages: wrap each primitive once in `src/components/ui/`
(for example `ui/Dialog.tsx`) and migrate screens one at a time.

### Path B: Tailwind v4 + shadcn/ui (Base UI base) + registries

Fastest route to finished controls and to the registry ecosystem (`@kibo-ui/dropzone` for
photo upload, `@data-table-filters` for the stocktaking grid, `@sureui` hold-to-confirm for
destructive actions, `@approvals-ui`). Cost: adds Tailwind to the Vite build (the handoff rule
would need relaxing), restyles 1,452 lines of CSS over time, and the tablet build inherits the
CSS size. Choose B only if you want the registry catalog itself; otherwise A gives the same
behaviour with your current CSS.

```bash
npx shadcn@latest init --base base      # Tailwind v4 + components.json
npx shadcn@latest add dialog drawer sonner command number-field combobox tabs toggle-group tooltip
```

### Order of adoption (either path), smallest reversible slices first

1. `Toast` and `Dialog`/`AlertDialog` (global, two files, immediate accessibility win).
2. Count modal: `NumberField` for bars/meters, `Drawer` variant for the tablet, NumberFlow in the header counter.
3. Article pickers: `Combobox` + virtualisation (removes the heaviest screen, `04e` pallet editor).
4. Menus: `ContextMenu` on the map, `Menu` for row actions and export.
5. Tables: TanStack Table under `DataTable.tsx`, restoring column-width persistence.
6. Icons: replace emoji with Lucide; KPI tiles: drop the uppercase tracked labels unless you keep them as a deliberate choice.

Keep untouched: the canvas map engine, the label PDF pipeline (jsPDF + JsBarcode), zustand state,
the `db → bump() → persist()` write pattern.

## 3. Offer Desk: framework-agnostic controls that work with a plain `<script>` renderer

No React, no bundler, and `script-src 'self'`, so everything must ship as local files. Two kinds
of prebuilt controls fit: **web components** (Lit-based, one `<script type="module">`) and
**single-file vanilla libraries**.

| Need | Prebuilt control | Package (npm latest) | Note |
|---|---|---|---|
| Dialogs, drawers, tabs, dropdowns, tooltips, inputs, buttons, badges, progress, spinners, callouts, icons | **Web Awesome Core** (successor to Shoelace; Shoelace is sunset) | `@awesome.me/webawesome` 3.14, MIT, ~70 free components | Lit web components, themed by CSS variables, official dark theme, works in Electron's Chromium and with CSP `'self'` when copied into `src/renderer/vendor/`. Toasts are Pro-only, so see next row. Ships an agent `SKILL.md` in `dist/skills/webawesome/`. |
| Toasts | **Notyf** | `notyf` 3.10, MIT | 3 KB, stacking, dismissable, no deps. |
| Searchable selects (`histPick`, user and offer filters) | **Tom Select** | `tom-select` 2.7, Apache-2.0 | native `<select>` upgrade, tagging, remote search. |
| Week and date pickers (week navigation, Day screen) | **Air Datepicker** | `air-datepicker` 3.6, MIT | range mode and week highlighting; `flatpickr` 4.6 as the alternative. |
| Column filter popups (tablekit) | keep `05-tablekit.js`, position popups with **Floating UI** | `@floating-ui/dom` 1.8, MIT | fixes clipping and flipping; or replace the whole kit with **Tabulator** (`tabulator-tables` 6.7, MIT) for sorting, header filters, column resize, grouping, export. |
| Charts drawn in DOM/canvas (Day, Sales, PBI screens) | **Chart.js** 4.6 (MIT) or **Apache ECharts** 6.1 (Apache-2.0) | | tooltips, legends, responsive resize, accessible fallbacks. ECharts if you need gantt-like timelines and heatmaps. |
| KPI numbers | **NumberFlow** web component | `number-flow` 0.6, MIT | same library as the React one, framework-free. |
| Screen switcher / command palette (Team, Day, Users, Offers, Queue, People, Tickets, Settings) | **ninja-keys** | `ninja-keys` 1.2, MIT | the vanilla equivalent of cmdk; Alt+K to jump between screens and weeks. |
| Ticket annotation canvas | keep | | domain-specific; fine. |

Install and vendor (CSP forbids CDNs):

```bash
npm i @awesome.me/webawesome notyf tom-select air-datepicker @floating-ui/dom number-flow ninja-keys chart.js
# copy dist files into src/renderer/vendor/ in the release script, and load:
# <script type="module" src="vendor/webawesome/webawesome.loader.js"></script>
# <link rel="stylesheet" href="vendor/webawesome/styles/webawesome.css">
```

Map your tokens onto Web Awesome's variables once (`--wa-color-brand-*`, `--wa-font-family-body`,
`--wa-border-radius-*`), and the controls take the Offer Desk look. Order of adoption: Notyf
toasts → `wa-dialog` for the connection/sign-in and ticket dialogs → Tom Select on the two
`<select>`s in the top bar → Floating UI under tablekit → Chart.js on the Sales screens.

## 4. Shared across both apps

- **Tokens**: both already have a token block; add semantic names (`--surface`, `--text-muted`,
  `--accent`, `--warn`, `--danger`, `--ok`) so the same component CSS can serve the dark CourtYard
  and the light Offer Desk. The handoff's `tokens.css` is the better starting point.
- **Icons**: one family. Lucide for CourtYard (installed); Web Awesome's `wa-icon` (Font Awesome
  Free) or inline Lucide SVGs for Offer Desk, replacing the hand-pasted SVG paths in `index.html`.
- **Typography**: CourtYard's mono-everywhere body is a deliberate choice for codes, keep it, but
  cut the thirteen font sizes to a scale. Offer Desk's Segoe UI is the system default; fine for a
  Windows tool, but a self-hosted face (IBM Plex Sans is already in the other app) would unify both.
- **Density**: both apps are data-dense tools; the prebuilt controls above are all CSS-sizable, so
  28 to 32 px rows and 11 px cell text stay possible.

## 5. Risks and licences

- Base UI is 1.x and moving (1.9 today); pin the minor version and read release notes on upgrade.
- Web Awesome Core is MIT; toasts, combobox, date picker and data grid are Pro. Everything proposed
  above uses Core plus MIT or Apache-2.0 libraries. No AGPL anywhere in this list.
- Web components in Electron: fine (Chromium). In the tablet build, Chrome on Android: fine.
- Tabulator is a bigger step than Floating UI under tablekit; decide after the first slice.
- Anything installed through a community shadcn registry (Path B only) is third-party code: read it.

## 6. What was not verified

- The video itself beyond its description and the screens you sent (see
  `.claude/skills/prebuilt-controls/references/sources.md`).
- Web Awesome's exact free component list for 3.14 (documented range 66 to 70; toasts confirmed Pro).
- Runtime behaviour of Base UI `Drawer` inside the Android tablet build. Try it in slice 2 before committing.
- Whether the Offer Desk release script copies `vendor/` into the NSIS bundle; `build.files` includes `src/**/*`, so it should, but check `npm run build:win` once.

## 7. Next steps if you say go

1. CourtYard, slice 1 (Toast + Dialog on Base UI, styled with `tokens.css`), behind the existing
   `Modal`/`Toast` APIs so pages do not change. One PR, screenshots before/after from `scripts/e2e-screens.cjs`.
2. Offer Desk, slice 1 (Notyf + `wa-dialog`, vendored, CSP checked in `npm run dev`).
3. Then the count modal, which is where gloves, scanner and tablet meet.
