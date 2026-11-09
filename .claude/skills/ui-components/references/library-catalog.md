# Library catalog

Organised by the role a library plays. Within a tier, the first entries are the
defaults; the rest are alternatives for when the brief calls for a different
character. Namespaces marked **directory** are in the official shadcn registry
directory (`https://ui.shadcn.com/r/registries.json`, verified 2026-11-09), so
`npx shadcn@latest add @namespace/item` works with no `components.json` change.
Namespaces marked **manual** need a `registries` entry (see `registry-setup.md`).

Versions quoted are the npm "latest" tags on 2026-11-09. Always review third-party
registry code before shipping it; the directory is community-maintained.

---

## Tier 1: Foundations (behaviour and accessibility; you own the code)

| Library | What it is | Install | Notes |
|---|---|---|---|
| **shadcn/ui** (`shadcn` 4.23) | The distribution platform: CLI copies component source into your repo, themed by CSS variables. The default for new React projects. | `npx shadcn@latest init` then `npx shadcn@latest add button dialog …` | `init --base base` (Base UI, default), `--base radix`, or `--base aria`. Flags `--style`, `--base-color`, `--css-variables` were removed in CLI v4. Presets: `npx shadcn@latest apply <preset>` (`--only theme` or `--only font`). |
| **Base UI** (`@base-ui/react` 1.9) | Headless primitives from the Radix, Floating UI and MUI authors. Now shadcn's default base. | installed by `shadcn init` | Use directly only for a primitive shadcn lacks. |
| **Radix UI** (`radix-ui` 1.8) | The original headless primitive set. Still a valid shadcn base. | `shadcn init --base radix` | Pick when the project already uses Radix. |
| **React Aria** (`@react-aria` registry, **directory**) | Adobe's accessibility-first components with Tailwind styles. | `npx shadcn@latest add @react-aria/<item>` or `shadcn init --base aria` | Best choice for internationalisation and complex a11y. |
| **coss ui** (`@coss`, **directory**) | Cal.com's design system, formerly Origin UI. Base UI + Tailwind, "built for developers and AI". | `npx shadcn@latest add @coss/<item>` | Legacy Origin UI (Radix) is frozen; use coss for new work. |
| **basecn** (`@basecn`, **directory**) | shadcn components rebuilt on Base UI. | `npx shadcn@latest add @basecn/<item>` | Alternative base-flavoured kit. |
| **Intent UI** (`@intentui`, **directory**) | React Aria based, copy-and-own component library. | `npx shadcn@latest add @intentui/<item>` | |
| **Dice UI** (`@diceui`, **directory**) | Accessible shadcn extensions (tags input, sortable, masonry, editable). | `npx shadcn@latest add @diceui/<item>` | URL carries `{style}`. |

Non-shadcn full kits (use only if the project already has one): Mantine, MUI,
Chakra, Ant Design, HeroUI, Park UI. Never add one of these next to shadcn/ui.

---

## Tier 2: Specialists (the parts AI gets wrong when it hand-writes them)

Install these *before* the showpieces. They fix the things users actually touch.

| Need | Library | Install | Why not hand-write |
|---|---|---|---|
| Toasts | **Sonner** (`sonner` 2.0) | `npx shadcn@latest add sonner` | Stacking, swipe, promise states, a11y announcements. |
| Drawer / mobile bottom sheet | **Vaul** (`vaul` 1.1) | `npx shadcn@latest add drawer` | Gesture physics, snap points, scroll locking. |
| Command menu / combobox | **cmdk** (`cmdk` 1.1) | `npx shadcn@latest add command` | Fuzzy filtering, keyboard model, grouping. |
| Numbers that change | **NumberFlow** (`@number-flow/react` 0.6) | `npm i @number-flow/react` | Per-digit transitions and locale formatting. |
| Data tables | **data-table-filters** (`@data-table-filters`, **directory**), **tablecn** (`@tablecn`, **directory**) | `npx shadcn@latest add @data-table-filters/<item>` | Faceted filters, URL-synced state, infinite scroll, server-side filtering on TanStack Table. |
| Rich text | **Plate** (`@plate`, **directory**), **shadcn-editor** (`@shadcn-editor`, **directory**) | `npx shadcn@latest add @plate/<item>` | Editors are months of work. |
| Composite app widgets | **Kibo UI** (`@kibo-ui`, **directory**; `kibo-ui` CLI 1.1) | `npx shadcn@latest add @kibo-ui/dropzone` or `npx kibo-ui@latest add <item>` | Dropzone, kanban, gantt, calendar, list, code block, AI chat primitives, tags, color picker. Composable and MIT. |
| Calendar views | **calendarcn** (`@calendarcn`, **directory**) | `npx shadcn@latest add @calendarcn/<item>` | Day/week/month/agenda, drag, ICS. |
| File upload | **uploadcn** (`@uploadcn`), **better-upload** (`@better-upload`), **mediadrop** (`@mediadrop`) (**directory**) | `npx shadcn@latest add @uploadcn/<item>` | Queues, resumable S3/R2, progress. |
| Charts | **evilcharts** (`@evilcharts`), **chartory** (`@chartory`, 100 MIT chart types), **dashboardcn** (`@dashboardcn`), **plotcn** (`@plotcn`) (**directory**) plus shadcn `chart` (Recharts) | `npx shadcn@latest add chart` then a registry item | Axis, legend, tooltip, responsive sizing. |
| Maps | **mapcn** (`@mapcn`, MapLibre), **shadcn-map** (`@shadcn-map`, Leaflet) (**directory**) | `npx shadcn@latest add @mapcn/<item>` | |
| Confirmations | **sureui** (`@sureui`, **directory**) | `npx shadcn@latest add @sureui/<item>` | Undo, hold-to-confirm, type-to-confirm. |
| Onboarding tours, steppers | **tour** (`@tour`), **stepper** (`@stepper`) (**directory**) | `npx shadcn@latest add @tour/<item>` | |
| Forms | **formcn** (`@formcn`, **directory**) and shadcn `field`, `input-group`, `input-otp` | `npx shadcn@latest add field input-group` | |
| URL state | **nuqs** (`@nuqs`, **directory**) | `npm i nuqs`; parsers via `npx shadcn@latest add @nuqs/<item>` | Type-safe search params. |
| Loaders | **loadercn** (`@loadercn`), **shadcnloaders**, **loading-ui** (**directory**) | `npx shadcn@latest add @loadercn/<item>` | Pure CSS, no dependencies. |
| Auth, billing, consent, status, email | `@clerk`, `@better-auth-ui`, `@supabase`, `@billingsdk`, `@c15t`, `@openstatus`, `@emailcn` (**directory**) | `npx shadcn@latest add @clerk/<item>` | Vendor-maintained blocks wired to their backends. |

---

## Tier 3: Designed components (finished, styled, animated; one per page)

### Animation and effects

| Library | Character | Install | Licence / tooling |
|---|---|---|---|
| **Magic UI** (`@magicui`, **directory**; URL pattern `https://magicui.design/r/{name}`) | 150+ animated components and effects: marquee, bento grid, blur fade, globe, shimmer button, animated beam. The default "add motion to a shadcn page" library. | `npx shadcn@latest add @magicui/marquee` | MIT. Official MCP: `npx @magicuidesign/cli@latest install claude` (package `@magicuidesign/mcp` 2.1; tools `listRegistryItems`, `searchRegistryItems`, `getRegistryItem`). |
| **Aceternity UI** (`@aceternity`, **directory**; `https://ui.aceternity.com/registry/{name}.json`) | Landing-page showpieces: bento grid, typewriter, spotlight, lamp, 3D card, background beams. Strong, recognisable look. Use sparingly. | `npx shadcn@latest add @aceternity/bento-grid` | Free components MIT; Aceternity Pro is paid. |
| **Cult UI** (`@cult-ui`, **directory**; `https://cult-ui.com/r/{name}.json`) | 150+ animated shadcn-compatible components, Tailwind v4, Motion. Dynamic island, shift card, globe, kanban, device mockups, fluted glass. Leans toward AI product UI. | `npx shadcn@latest add @cult-ui/shift-card` | Free; Cult Pro separate. |
| **Animate UI** (`@animate-ui`, **directory**; CLI `@animate-ui/cli` 2.4) | Animated drop-in primitives for Radix, Base UI and React Aria. Swap the import, keep your shadcn components. | `npx @animate-ui/cli@latest animate all` or `npx shadcn@latest add @animate-ui/<item>` | MIT + Commons Clause (cannot resell the components). |
| **Motion Primitives** (`@motion-primitives`, **directory**; `https://motion-primitives.com/c/{name}.json`) | Tasteful motion components: text effects, dock, morphing dialog, in-view, sliding number. | `npx shadcn@latest add @motion-primitives/<item>` | MIT. |
| **React Bits** (`@react-bits`, **directory**) | Large collection of animated backgrounds, text animations and interactive pieces. Also `@vue-bits`, `@svelte-bits`. | `npx shadcn@latest add @react-bits/<item>` | |
| **Smooth UI** (`@smoothui`), **Kokonut UI** (`@kokonutui`), **Skiper UI** (`@skiper-ui`, `https://skiper-ui.com/registry/{name}.json`), **Fancy UI** (`@fancy-ui`), **Eldora UI** (`@eldoraui`), **PaceUI** (`@paceui`, `@paceui-gsap`), **tween-ui** (`@tween-ui`, GSAP), **UI Layouts** (`@ui-layouts`) (**directory**) | Micro-interactions and uncommon components. Pick one whose voice matches the brief. | `npx shadcn@latest add @smoothui/<item>` | Mostly MIT; check each. |
| **Keyframery** (`@keyframery`, **directory**) | A motion layer: one `<Cuts />` animates dialogs, sheets, tabs and toasts; helpers for lists, numbers, skeletons. | `npx shadcn@latest add @keyframery/<item>` | Good when you want motion without picking per-component libraries. |
| **RareUI** (`rareui` CLI 0.1; **manual**, own CLI) | Premium-feel animated components: liquid metal, animated buttons, text effects. React 19, Tailwind 4, Motion. | `npx rareui add liquid-metal` | MIT; the project asks for a visible credit link. Not a shadcn registry. |
| **Motion** (`motion` 14.10) | The animation runtime most of the above depend on. | installed as a dependency | Use for the one orchestrated moment; do not scatter entrance effects. |

### Marketing sections and blocks

| Library | What | Install |
|---|---|---|
| **Tailark** (`@tailark`, **directory**; `https://tailark.com/r/{name}.json`) | Shadcn marketing blocks: hero, features, pricing, testimonials, footers. Base UI default; a Radix variant exists. The open-source registry is also published as `@tailark-oss` at `https://oss-tailark.com/r/{name}` (Radix: `/r/radix/{name}`). Tailark Pro is paid. | `npx shadcn@latest add @tailark/<item>`; item names from `/r/registry.json` |
| **Shadcnblocks** (`@shadcnblocks`, **directory**) | 1,400+ blocks, 1,100+ component variants, templates, themes. Free subset; paid for the rest. Has its own MCP. | `npx shadcn@latest add @shadcnblocks/<item>` |
| **Launch UI** (`@launchui`), **Cnippet Blocks** (`@cnippet-blocks`, 110+ free sections), **blocks.so** (`@blocks-so`), **shadcn studio** (`@shadcn-studio`, theme generator), **zippystarter** (`@zippystarter`), **shadcndesign** (`@shadcndesign`) (**directory**) | More landing and app blocks. | `npx shadcn@latest add @launchui/<item>` |
| **Dashboard blocks**: `@dashboardblocks`, `@dashboardcn`, `@shadcn-dashboard`, `@tailwind-admin`, `@shadcnuikit` (**directory**) | KPI cards, chart cards, tables, full dashboards. | `npx shadcn@latest add @dashboardcn/<item>` |
| **E-commerce**: `@commercn`, `@ecomcn` (**directory**) | Product cards, filters, cart, checkout. | |

### AI product interfaces (streaming, reasoning, approvals, agents)

| Library | What | Install |
|---|---|---|
| **Beautiful UI** (beautifului.dev; **manual**, URL install) | 21 crafted primitives for AI-native interfaces: Thinking trace, Streaming Text with sources, Approval Card, Tool Call chips, Task rows, diff and records tables, Prompt Bar, plus a live agent harness. MIT. The "designed component" source for AI products. | `npx shadcn@latest add https://www.beautifului.dev/r/approval-card.json` (merge its foundation stylesheet once) |
| **AI Elements** (`@ai-elements`, **directory**; `npx ai-elements@latest`) | Vercel's chat, code, voice and workflow components on shadcn/ui and AI SDK. **Moving into shadcn/ui proper** (`ui.shadcn.com/docs/ai-elements`); the standalone package is deprecated end of November 2026. | `npx shadcn@latest add @ai-elements/prompt-input` (prefer the shadcn/ui version when available) |
| **prompt-kit** (`@prompt-kit`, **directory**; `https://www.prompt-kit.com/c/{name}.json`) | Core building blocks for AI apps: prompt input, message, markdown, reasoning, loader. | `npx shadcn@latest add @prompt-kit/<item>` |
| **assistant-ui** (`@assistant-ui`, **directory**) | Radix-style primitives for AI chat with adapters for AI SDK, LangGraph, Mastra. | `npx shadcn@latest add @assistant-ui/<item>` |
| **Kibo UI AI** (`@kibo-ui`) | AI input, message, response, reasoning, sources, tool components. | `npx shadcn@latest add @kibo-ui/ai` |
| **tool-ui** (`@tool-ui`), **agent-ui-kit** (`@agent-ui-kit`), **approvals-ui** (`@approvals-ui`), **hextaui** (`@hextaui`, hard states handled), **simple-ai** (`@simple-ai`) (**directory**) | Tool call widgets, run timelines, human-in-the-loop approvals, diff review, policy gates. | `npx shadcn@latest add @tool-ui/<item>` |
| **Voice and realtime**: `@elevenlabs-ui`, `@pipecat`, `@agents-ui` (LiveKit), `@audiocn` (**directory**) | Agent and audio components, visualisers, mixers. | |
| **21st.dev** (`@21st-dev/cli` 1.18; MCP at `https://21st.dev/api/mcp`) | Community component marketplace and the 21st MCP (formerly Magic MCP): `search`, `get_component`, `get_inspiration`, `generate` (hosted AI generation needs AI access). Free API key at 21st.dev/mcp. | `npx @21st-dev/cli@latest init --client claude` (or `codex`) |

### Alternative aesthetics (when the brief wants a distinct world)

`@retroui` and `@neobrutalism` and `@brut-ui` (neo-brutalist), `@8bitcn` (8-bit),
`@ui95` (Windows 95), `@nostalgia-ui` (Mac OS 9), `@cupertinoui` (macOS),
`@materialcn` (Material 3 Expressive), `@fluent2-react-kit` (Fluent 2),
`@glass-ui` / `@glasscn` / `@glassyui` (glassmorphism), `@neumorphism-ui`,
`@fibo` (achromatic Base UI system), `@ai2` (OKLCH token design system),
`@reui` (1,000+ components and patterns), `@ncdai` (pixel-perfect personal set),
`@sans` (includes a Claude Code terminal spinner). All **directory**.

A themed registry is a legitimate way to escape the default look, but pick one and
commit; mixing two aesthetics is its own tell.

---

## Icons

| Family | Package | Note |
|---|---|---|
| Lucide | `lucide-react` 1.70 | shadcn default. Fine, but it is what every generated page uses. |
| Phosphor | `@phosphor-icons/react` 2.1 | Six weights; duotone gives character. |
| Hugeicons, Tabler, Heroicons | respective packages | |
| Animated icons | `@lucide-animated`, `@icons-animated`, `@animateicons`, `@hugeicons-animated`, `@heroicons-animated`, `@doodle-icons` (hand-drawn), `@coolicons` (**directory**) | Each icon installs as one editable file. |
| Brand logos | `@svgl` (**directory**) | `npx shadcn@latest add @svgl/<brand>` |

One family per product. Never use emoji as icons.

---

## Themes, tokens and typography

- **shadcn presets**: `npx shadcn@latest apply <id>` applies a theme and fonts; `--only theme` or `--only font`.
- **tweakcn** (tweakcn.com): visual theme editor that exports shadcn CSS variables, including fonts, radius and shadows. Use it to leave the stock grey theme.
- **Fonts**: load with `next/font` or `@fontsource-variable/*`. Choose for the subject; see the ban list for the families to avoid by default. Pair a display face with a quiet text face, or use one family with strong weight contrast.
- **Color**: define tokens in OKLCH or hex once, in `globals.css`, and reference them. 4 to 6 named values. One accent with a stated meaning.

---

## Discovery and reference (for the design brief)

- **shadcn directory**: `npx shadcn@latest search @<ns> -q "<term>"`, or browse `ui.shadcn.com/docs/directory`. `@shadcn-exchange` searches every public registry with live previews.
- **registry.directory**: explorer for the shadcn registry ecosystem.
- **21st.dev**: components with previews, MCP search.
- **Mobbin** (real product screens), **Refero** (full flows), **Transitions.dev** (motion patterns): the reference sites to point at instead of adjectives. Mobbin and Refero have MCP servers.

---

## Outside React

- **Vue**: shadcn-vue, `@vue-bits`. **Svelte**: shadcn-svelte, `@svelte-bits`. **Solid**: `@audiocn-solid`, `@gc-solid`.
- **React Native / Expo**: React Native Reusables (shadcn for RN), `@glassyui-native`.
- **Plain HTML/CSS**: Tailwind UI (paid), `@motion-menu` (HTML/CSS/JS motion patterns).
