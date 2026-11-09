# Sources and verification status

This skill was assembled on 2026-11-09. Be honest with users about what is first-hand.

## The video
**"Stop Letting Claude Build Your Components From Scratch"**, Griffin Wooldridge,
https://youtu.be/zsCGS-Yzjnw, published 2026-11-07 (37K views, 927 likes on 2026-11-09).
Search engines list it under the working title "UI Libraries for Claude Code (Ban the AI Look)".

Verified from the user's screenshots of the video page and frames (2026-11-09):
- Description: "One of the easiest ways to make AI-built UI look better is to stop letting it
  build every component from scratch. In this video, I go over the component libraries I use
  with Claude Code, the three kinds worth knowing, what each one is good for, and how to get
  Claude to actually use them. You'll also see why default shadcn has become an AI look of its
  own, the small details AI skips when it builds toasts, …" (cut off). Links the free
  "AI for Designers" guide at griffinwooldridge.com.
- Frames shown: **NumberFlow** (number-flow.barvian.me, "An animated number component.
  Dependency-free. Accessible. Customizable."), **cmdk** via shadcn's Command docs,
  **Vaul** ("Drawer component for React", gesture-driven, by Emil Kowalski), **Sonner**
  ("An opinionated toast component for React", stacking demo), the **shadcn/ui · Base UI ·
  Radix** foundations slide, and a before/after **"Create project" dialog**: the default shadcn
  card next to the same dialog restyled with a serif italic heading, uppercase tracked labels,
  square corners, a grey surface and square buttons. The lever is tokens (type, radius,
  surfaces, label treatment), not new components.
- A later related video by the same author is titled "Opus 5.5 Is a Pro Designer…" (seen in
  the player's up-next card).

Not watched end to end; the transcript was not obtained (YouTube serves a sign-in bot check to
the build environment, and the official API cannot return captions for a video you do not own).
The "designed components" tier and the "one designed component per page" rule come from the
author's companion articles:
- *Best React UI Component Libraries (2026): How to Pick* (2026-10-20): the libraries
  he uses with Claude, grouped as **foundations** (shadcn/ui, Base UI, Radix),
  **specialists** for "the components AI gets wrong when it builds them from scratch"
  (Sonner, Vaul, cmdk, NumberFlow) and **designed components** (Beautiful UI, RareUI,
  Magic UI, Aceternity, 21st.dev). Workflow: add the specialists first, then pull
  **one designed component per page**.
- *How to Prompt AI for UI Design* (2026): references over adjectives; describe the
  job; constrain the visual system up front (one accent and its role, type scale,
  spacing unit, light or dark); name the component library so nothing is hand-built;
  a short avoid-list in the prompt or `AGENTS.md` beats positive instructions.
- *5 Best AI UI Design Reference Sites for Coding Agents*: Mobbin, Refero, 21st.dev,
  Transitions.dev, Beautiful UI; connect an MCP for Mobbin or Refero and keep visual
  rules in an `AGENTS.md` or design markdown file.

## Other inputs merged
- A zip the user supplied, `claude-component-first-skill.zip` (skill `component-first-app`,
  written by another agent without video access): its candidate catalog for data-heavy
  business apps (TanStack Table, AG Grid, TanStack Virtual, React Hook Form, Zod, TanStack
  Query, React Flow, Recharts, ECharts, FullCalendar, dnd kit, MapLibre), the "inventory, no
  destructive changes" start, the decision matrix and the `docs/component-decisions.md`
  deliverable are folded into `stack-branches.md`, `templates/component-decisions.md` and
  the hard rules.
- The user's own apps (`offer-desk`: vanilla JS Electron; `courtyard-inventory`: React 19
  Electron with a tablet build, plain CSS, "no new UI framework" rule) drove branches B and C
  in `stack-branches.md`. The analysis is in the repo root `PROPOSAL.md`.

## Verified first-hand (fetched from GitHub or npm), continued
- Base UI 1.9.0 component list from the published package (`@base-ui/react` tarball).
- Web Awesome and Shoelace READMEs (`shoelace-style/webawesome`, `shoelace-style/shoelace`):
  Shoelace is sunset; Web Awesome Core is MIT and Lit-based.
- npm `latest` for: `@awesome.me/webawesome`, `notyf`, `tom-select`, `air-datepicker`,
  `flatpickr`, `@floating-ui/dom`, `tabulator-tables`, `ag-grid-community`, `chart.js`,
  `echarts`, `number-flow`, `ninja-keys`, `sortablejs`, `a11y-dialog`, `@zxing/browser`,
  `html5-qrcode`, `@tanstack/table-core`, `@tanstack/virtual-core`, `lit`.

## From search snippets only, continued
- Web Awesome free component count (66 to 70 depending on version) and that toasts,
  combobox, date picker and data grid are Pro.

## Verified first-hand (fetched from GitHub or npm)
- shadcn docs source: `cli.mdx`, `(root)/mcp.mdx`, `registry/mcp.mdx`, `registry/namespace.mdx`,
  `registry/registry-index.mdx`, `registry/github.mdx`, `components-json.mdx`.
- The official registry directory `apps/v4/registry/directory.json` (548 registries):
  every `@namespace` and URL pattern in the catalog marked **directory** comes from it.
- READMEs: Magic UI, Magic UI MCP (`magicuidesign/mcp`), Cult UI, Kibo UI (+ docs intro),
  Animate UI, 21st-dev/magic-mcp (Magic MCP → 21st MCP), coss ui / Origin UI, Tailark
  blocks registry, Vercel AI Elements (deprecation notice), RareUI, ReUI.
- Anthropic's `frontend-design` skill (`anthropics/skills`): the calibration list of
  AI-design clusters, typography and motion rules, the plan-then-critique method and
  the writing guidance in `anti-ai-look.md` are adapted from it.
- npm `latest` versions quoted in the catalog.

## From search snippets only (not fetched; treat as likely, verify when it matters)
- Beautiful UI (beautifului.dev) component list, MIT licence and URL-install pattern.
- Mowgli.ai workflow (ban list in `CLAUDE.md` or `.claude/rules/`), Untitled UI's
  "22 libraries for vibe coding", community "use-ui-libraries" skill by cruzedevelopment
  (fetched; its decision flow inspired step 0 and the hard rules).
- Aceternity's "262 components" figure; Tailark Pro pricing.
- Codex skill discovery path `.agents/skills/` and `AGENTS.md` layering behaviour.
