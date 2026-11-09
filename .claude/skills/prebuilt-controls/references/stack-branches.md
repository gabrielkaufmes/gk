# Stack branches: the right prebuilt control for the project you actually have

Detect first (`scripts/check-ui-setup.sh`). Then use one table. Versions are npm `latest`
on 2026-11-09. Every entry is MIT or Apache-2.0 unless marked.

## Branch A: React + Tailwind → shadcn/ui and registries

Foundation `npx shadcn@latest init` (base: `base` default, `radix`, `aria`). Then:

| Need | Control | Install |
|---|---|---|
| Toasts | Sonner | `npx shadcn@latest add sonner` |
| Drawer, bottom sheet | Vaul | `npx shadcn@latest add drawer` |
| Command menu, combobox | cmdk | `npx shadcn@latest add command` (also `combobox`) |
| Changing numbers | NumberFlow | `npm i @number-flow/react` |
| Dialog, alert dialog, sheet, popover, tooltip, tabs, menu, context menu, select, switch, slider, progress, toggle group, field, input group, OTP | shadcn core | `npx shadcn@latest add dialog alert-dialog sheet popover tooltip tabs dropdown-menu context-menu select switch slider progress toggle-group field input-group input-otp` |
| Data table with filters, URL state, infinite scroll | `@data-table-filters`, `@tablecn` | `npx shadcn@latest add @data-table-filters/<item>` |
| Dropzone, kanban, gantt, calendar, code block, editor, AI chat | Kibo UI | `npx shadcn@latest add @kibo-ui/<item>` |
| Date range picker | shadcn `calendar` + `date-picker` blocks; `@diceui` | `npx shadcn@latest add calendar` |
| Phone, tags, multi-select | `@wds/multi-select`, `@diceui/tags-input`, shadcn-phone-input | `npx shadcn@latest add @wds/multi-select` |
| Charts | shadcn `chart` + `@evilcharts`, `@chartory`, `@dashboardcn` | `npx shadcn@latest add chart` |
| Maps | `@mapcn` (MapLibre) | `npx shadcn@latest add @mapcn/<item>` |
| Confirmations (undo, hold, type to confirm) | `@sureui` | `npx shadcn@latest add @sureui/<item>` |
| Rich text | `@plate`, `@shadcn-editor` | `npx shadcn@latest add @plate/<item>` |
| Upload | `@uploadcn`, `@better-upload` | |
| AI product UI | Beautiful UI (URL), AI Elements, `@prompt-kit`, `@assistant-ui`, `@kibo-ui/ai` | `npx shadcn@latest add https://www.beautifului.dev/r/<item>.json` |
| One designed component per page | `@magicui`, `@aceternity`, `@cult-ui`, `@animate-ui`, `@motion-primitives`, `@tailark` | `npx shadcn@latest add @magicui/marquee` |

Details, namespaces and URLs: `library-catalog.md`; CLI and MCP: `registry-setup.md`.

## Branch B: React without Tailwind (or "no UI framework" rule) → headless Base UI + unstyled specialists

Base UI (`@base-ui/react` 1.9, MIT) is the unstyled primitive layer shadcn builds on. You
style it with your own CSS through data attributes, so the project's tokens stay in charge.
Components in 1.9: accordion, alert-dialog, autocomplete, avatar, button, checkbox,
checkbox-group, collapsible, combobox, context-menu, dialog, **drawer**, field, fieldset, form,
input, menu, menubar, meter, navigation-menu, **number-field**, otp-field, popover,
preview-card, progress, radio, radio-group, scroll-area, select, separator, slider, switch,
tabs, **toast**, toggle, toggle-group, toolbar, tooltip, plus a `csp-provider` for strict CSP.

| Need | Control | Install |
|---|---|---|
| Dialog, confirm, prompt | Base UI `Dialog`, `AlertDialog` | `npm i @base-ui/react` |
| Bottom sheet on tablets | Base UI `Drawer` (or Vaul `vaul`, unstyled) | |
| Toasts | Base UI `Toast` or Sonner (`sonner`, themable CSS) | `npm i sonner` |
| Context menu, row menu, export menu | Base UI `ContextMenu`, `Menu`, `Menubar` | |
| Segmented control, tabs | Base UI `ToggleGroup`, `Tabs` | |
| Select, cascading selects | Base UI `Select` | |
| Searchable picker over thousands of rows | Base UI `Combobox` / `Autocomplete` + `@tanstack/react-virtual` | `npm i @tanstack/react-virtual` |
| Numeric input with stepper and units | Base UI `NumberField` | |
| Changing numbers | NumberFlow | `npm i @number-flow/react` |
| Command menu | cmdk (`cmdk`, unstyled) | `npm i cmdk` |
| Data tables | `@tanstack/react-table` 9 + `@tanstack/react-virtual` | `npm i @tanstack/react-table @tanstack/react-virtual` |
| Date picker | `react-day-picker` 9 (unstyled CSS module) | `npm i react-day-picker` |
| Forms | `react-hook-form` + `zod` | |
| Drag and drop (lists, kanban) | `@dnd-kit/*` | |
| Charts | Recharts (React) or Apache ECharts (`echarts-for-react`) | |
| Icons | `lucide-react` (one family) | |
| Tooltips, hover cards, progress, meter, OTP | Base UI | |

Pattern: wrap each primitive once in `components/ui/<Name>.tsx` with the project's class
names; style with `[data-open]`, `[data-selected]`, `[data-highlighted]`, `[data-disabled]`
selectors in the existing stylesheet. Migrate page by page.

## Branch C: vanilla JS, classic-script Electron renderers, strict CSP, non-React stacks → web components + single-file libraries

Everything must be vendored (CSP `script-src 'self'` forbids CDNs): `npm i`, then copy `dist`
into the renderer's `vendor/` in the build script, and load with one
`<script type="module">`.

| Need | Control | Package | Note |
|---|---|---|---|
| Dialog, drawer, tabs, dropdown, tooltip, select, input, button, badge, progress, spinner, callout, icon, card, details, switch, radio, checkbox, slider, tree, split panel | **Web Awesome Core** | `@awesome.me/webawesome` 3.14, MIT, ~70 free components | Lit web components; CSS-variable theming (`--wa-color-brand-*`, `--wa-font-family-body`, `--wa-border-radius-*`); official dark theme. Successor to Shoelace (sunset). Toasts, combobox, date picker and data grid are **Pro** (paid), so use the rows below for those. Ships an agent skill at `dist/skills/webawesome/SKILL.md`. |
| Toasts | **Notyf** | `notyf` 3.10 | 3 KB, stacking, dismissable |
| Searchable select, tags | **Tom Select** | `tom-select` 2.7, Apache-2.0 | upgrades a native `<select>` |
| Date, range, week picker | **Air Datepicker** or **flatpickr** | `air-datepicker` 3.6, `flatpickr` 4.6 | |
| Popup positioning (filters, menus) | **Floating UI** | `@floating-ui/dom` 1.8 | flip, shift, arrow |
| Data table with header filters, sort, resize, grouping, export | **Tabulator** | `tabulator-tables` 6.7 | or keep a custom table kit and add Floating UI under its popups |
| Big grids | **AG Grid Community** | `ag-grid-community` 36, MIT | enterprise features are paid |
| Charts | **Chart.js** or **Apache ECharts** | `chart.js` 4.6, `echarts` 6.1 | ECharts for gantt-like timelines and heatmaps |
| Changing numbers | **NumberFlow** web component | `number-flow` 0.6 | same library as the React one |
| Command palette | **ninja-keys** | `ninja-keys` 1.2 | the vanilla cmdk |
| Drag and drop | **Sortable** | `sortablejs` 1.15 | |
| Accessible dialog without a component library | **a11y-dialog** | `a11y-dialog` 8.1 | |
| Barcode / QR from camera | **@zxing/browser** or **html5-qrcode** | `@zxing/browser` 0.2, `html5-qrcode` 2.3 | |
| Icons | Web Awesome `wa-icon` (Font Awesome Free) or inline Lucide SVG | | one family |

Vue: shadcn-vue, `@vue-bits`. Svelte: shadcn-svelte, `@svelte-bits`. Solid: `@audiocn-solid`.
React Native / Expo: React Native Reusables, `@glassyui-native`.

## Choosing between branches when the project is React but has no Tailwind

Ask one question: is adding Tailwind acceptable? If the owner wrote "no new UI framework" or the
stylesheet is large and tokenised, choose B; you get the same behaviour from the same
primitives shadcn uses, with no CSS migration. Choose A only when you want the registry
catalog itself (blocks, dropzones, AI components). Never run both.

## What all branches share

- A design brief in `DESIGN.md` and a decision matrix in `docs/component-decisions.md`
  (`templates/component-decisions.md`).
- Wrap once, migrate in slices: toasts and dialogs first, then the heaviest screen, then menus,
  then tables. Keep domain renderers (canvas, PDF) as they are.
- One icon family, one foundation, tokens before colours in components.
- Say what was not verified (licence tier, framework compatibility, mobile or tablet behaviour).
