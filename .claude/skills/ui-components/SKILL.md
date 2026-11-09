---
name: ui-components
description: Build app UI from established component libraries and shadcn-compatible registries instead of hand-writing components, and ban the generic "AI look". Use whenever creating or restyling frontend UI (pages, screens, components, landing pages, dashboards, AI chat interfaces), setting up shadcn/ui, picking a UI library, or when the user mentions Magic UI, Aceternity, Tailark, Cult UI, Kibo UI, Beautiful UI, 21st.dev, registries, or wants the UI to stop looking AI-generated.
---

# UI Components: libraries first, no AI look

The single biggest quality gain for AI-built UI is to **stop letting the model make
design choices on its own**. Two moves do most of the work:

1. **Never hand-build a component that a library already ships.** Buttons, dialogs,
   drawers, command menus, toasts, tables, date pickers, charts, chat transcripts and
   animated effects all exist as copy-into-your-project source. Install them with a
   CLI and compose them.
2. **Decide the visual system before writing code**, write it down, and ban the
   default tells that make a page read as generated.

The skill is organised as a three-tier library stack plus a workflow. Details live in
`references/`; read the file named in each step when you reach it.

## The three tiers (what to reach for)

| Tier | Role | Default picks |
|------|------|---------------|
| **Foundations** | Behaviour, accessibility, keyboard and focus handling. Own the code. | shadcn/ui (Base UI base by default; Radix or React Aria selectable), coss ui, Base UI, Radix |
| **Specialists** | The parts AI gets wrong when it writes them from scratch. | Sonner (toasts), Vaul (drawers / bottom sheets), cmdk (command menu), NumberFlow (changing numbers), Kibo UI (dropzone, kanban, gantt, editor, AI chat), data-table and chart registries |
| **Designed components** | Finished, styled, usually animated pieces. **One per page**, as the memorable element. | Magic UI, Aceternity, Cult UI, Animate UI, Motion Primitives, React Bits, Tailark (marketing blocks), Beautiful UI (AI product states), 21st.dev |

Full catalog with verified install commands: `references/library-catalog.md`.

## Workflow

### 0. Detect what the project already has

Run `scripts/check-ui-setup.sh` (or inspect `package.json`, `components.json`,
`.mcp.json`). Respect an existing library. Never add a second foundation (for example
MUI next to shadcn/ui). If the project has nothing, default to shadcn/ui.

### 1. Write the design brief before any JSX

Copy `templates/DESIGN.md` into the project (or append to an existing design doc) and
fill it in **from the subject matter**: who uses this, what job it does, what its world
looks like. Commit to:

- a palette of 4 to 6 named hex values with roles (surface, text, one accent and what
  the accent means),
- one or two typefaces that are not the defaults (see the ban list), a type scale and
  a spacing unit,
- a radius scale, a shadow policy, light or dark mode,
- a motion budget: one orchestrated moment per page, otherwise motion only answers a
  user action,
- the component sources for this project: foundation, specialists, and the **one**
  designed component per page.

Then review the plan against the brief: if any line is what you would produce for any
similar prompt, it is a default, not a choice. Change it and say why. Rules and the
ban list: `references/anti-ai-look.md`.

### 2. Wire the registries

Follow `references/registry-setup.md`. In short:

```bash
npx shadcn@latest init                       # picks a base: base (Base UI), radix or aria
npx shadcn@latest search @magicui -q "marquee"   # directory registries need no config
npx shadcn@latest view @cult-ui/shift-card       # inspect before installing
npx shadcn@latest add @aceternity/bento-grid     # installs source into components/ui
npx shadcn@latest add https://www.beautifului.dev/r/approval-card.json   # URL install
```

Registries that are not in the shadcn directory go in `components.json` under
`registries` (template: `templates/components.registries.json`). When an MCP server is
available (shadcn MCP, Magic UI MCP, 21st MCP) use it to browse and install; the MCP
setup for Claude Code and Codex is in the same reference.

### 3. Install, do not transcribe

Always install through the CLI (`shadcn add`, `rareui add`, `ai-elements add`,
`@animate-ui/cli`). Never retype component code from documentation. Use `--dry-run`
when unsure what a registry item will write. Read what was installed: registry items
can carry dependencies, CSS and config.

### 4. Compose and theme, do not rewrite

- Build screens by composing installed components. Customise through CSS variables,
  Tailwind tokens, `cva` variants and wrapper components. Do not fork a component to
  change its colour.
- Keep installed components where the CLI put them (`components/ui`, `components/magicui`,
  `components/ai-elements`). Put composed screens elsewhere (`components/<feature>`).
- Icons: pick one family for the whole app. Lucide is fine, but it is the default
  everyone gets; consider Phosphor, Hugeicons or Tabler when the brief has room.

### 5. Critique before you stop

Render it. Screenshot it if the environment allows. Then check:

- Does one element carry the page, and is everything else quiet?
- Any item from the ban list present without the brief asking for it?
- Responsive down to 360 px, visible keyboard focus, `prefers-reduced-motion`
  respected, text contrast at least 4.5:1, line length under 80 characters.
- Copy: sentence case, verbs on buttons that say what happens, no filler, errors that
  explain the fix.
- Remove one decoration before leaving.

## Hard rules

1. **No hand-written standard components** (button, input, select, dialog, sheet,
   drawer, dropdown, tabs, toast, table, pagination, date picker, command menu,
   avatar, badge, skeleton, carousel, accordion, tooltip, chart). Install them.
2. **No hand-written AI interface patterns** (message list, streaming text,
   reasoning trace, tool call card, approval card, prompt input with attachments).
   Use Beautiful UI, AI Elements (now part of shadcn/ui), prompt-kit, assistant-ui
   or Kibo UI AI components.
3. **One designed component per page.** Two animated showpieces fight each other.
4. **Design brief before code.** If the user gave none, propose the tokens, state
   them in one short block, and proceed; do not block on it.
5. **References over adjectives.** When the user says "modern and clean", ask for or
   propose a concrete reference (a product, a screen, a style) and translate it into
   tokens. Adjectives produce the average of the training set.
6. **Respect the existing stack.** One foundation per project; no migrations unless
   asked.
7. **CLI installs only**, then read what landed. Review third-party code: registries
   are community-maintained.
8. **Ban list applies by default**; the brief's explicit words always win over it.
9. **Keep the brief current.** When you add a source, a token or a rule during the
   work, write it back into `DESIGN.md` so the next session inherits it.

## Reference files

- `references/library-catalog.md`: every library by tier, what it is for, install
  command, licence notes, verified registry namespaces and URLs.
- `references/registry-setup.md`: shadcn CLI, `components.json` registries, MCP
  servers for Claude Code and Codex, verification steps, troubleshooting.
- `references/anti-ai-look.md`: the ban list, the design-plan method, typography and
  motion rules, copywriting rules, the self-critique checklist.
- `references/sources.md`: where this knowledge came from and how much of it was
  verified.
- `templates/DESIGN.md`: the design brief to fill in per project.
- `templates/components.registries.json`: ready-to-merge `registries` block.
- `templates/claude-md-snippet.md`: paste into a project's `CLAUDE.md` or `AGENTS.md`.
- `scripts/check-ui-setup.sh`: read-only project audit with suggested next commands.
