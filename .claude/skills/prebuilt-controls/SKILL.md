---
name: prebuilt-controls
description: Use prebuilt UI controls instead of hand-writing them. Whenever an app needs a button, dialog, drawer, toast, menu, select, combobox, table, date or number input, chart, command palette or animated showpiece, pick the right prebuilt control for the project's stack (shadcn/ui registries, headless Base UI, or framework-agnostic web components for vanilla and Electron apps), install it, theme it with tokens, and avoid the generic AI look. Use for any frontend UI work, UI library choice, shadcn setup, Electron renderer UI, or when the user mentions Magic UI, Aceternity, Cult UI, Kibo UI, Beautiful UI, Base UI, Web Awesome, Sonner, Vaul, cmdk, NumberFlow or registries.
---

# Prebuilt controls first

Stop letting the model build every component from scratch. Hand-written controls miss the
small details users feel (toast stacking and timing, drawer gestures, focus return from
dialogs, keyboard models in menus, number stepping and formatting), and the model's own
design choices converge on the generic "AI look". Two moves fix most of it:

1. **Install, never transcribe.** Every standard control exists as prebuilt source or a
   package. Pick it, install it with a CLI or package manager, read what landed, compose it.
2. **Decide the visual system first** (tokens in `DESIGN.md`), theme the controls with it,
   and ban the default tells.

The three kinds of library worth knowing (the video's framing):

| Kind | Role | Default picks |
|---|---|---|
| **Foundations** | Behaviour and accessibility; you own the code. | shadcn/ui (Base UI base), Base UI, Radix, React Aria, coss ui |
| **Specialists** | The controls AI gets wrong when it writes them. | Sonner (toasts), Vaul (drawers), cmdk (command menu), NumberFlow (changing numbers), TanStack Table + Virtual (data grids), Kibo UI (dropzone, kanban, editor, AI chat) |
| **Designed components** | Finished, styled, usually animated. **One per page.** | Magic UI, Aceternity, Cult UI, Animate UI, Motion Primitives, Tailark (marketing blocks), Beautiful UI (AI product states), 21st.dev |

Default shadcn has become an AI look of its own: use it as the foundation, then change the
tokens (type, radius, surfaces, label treatment) and add one designed component per page.

## Step 0: detect the stack and pick a branch

Run `scripts/check-ui-setup.sh` (read-only) or inspect `package.json`, `components.json`,
`index.html` and the stylesheet. Then follow one branch from `references/stack-branches.md`:

| Project | Branch |
|---|---|
| React + Tailwind (or willing to add it) | **A. shadcn/ui + registries.** The full tier table above. |
| React without Tailwind, or a "no UI framework" rule | **B. Headless Base UI + unstyled specialists**, styled with the project's own CSS tokens. Same behaviour, no Tailwind. |
| Vanilla JS, Electron renderer with classic scripts, strict CSP, or any non-React stack | **C. Web components + single-file vanilla libraries**: Web Awesome Core (MIT; Shoelace's successor), Notyf, Tom Select, Air Datepicker, Floating UI, Tabulator, Chart.js, `number-flow`, ninja-keys. Vendor the files; no CDN. |
| Vue / Svelte / Solid | shadcn-vue, shadcn-svelte, or branch C. |

Respect an existing library. One foundation per project. No migration unless asked.

## Step 1: write the design brief before any markup

Copy `templates/DESIGN.md` (or append to the project's design doc). Fill it from the subject
matter: palette of 4 to 6 named values with roles and one accent, one or two typefaces that are
not the defaults, a type scale and spacing unit, radius and shadow policy, mode, a motion
budget (one orchestrated moment per page), and the **component sources** for this project.
Review each line: if you would write it for any similar prompt, it is a default; change it and
say why. Rules and the ban list: `references/anti-ai-look.md`. If the user gave no brief,
propose the tokens in one short block and proceed; do not block.

## Step 2: map every control to a prebuilt one

Use the control picker in `references/stack-branches.md` (need → control → package or
registry item, per branch). Write the mapping into `DESIGN.md` under Sources, and when the
project already has hand-rolled controls, into `docs/component-decisions.md` as a decision
matrix: need, current solution, candidate, keep or replace, licence, accessibility, migration
effort, rollback.

## Step 3: wire the sources and install

Branch A: `references/registry-setup.md` (shadcn CLI, `components.json` registries, MCP for
Claude Code and Codex). Branch B: `npm i @base-ui/react sonner @number-flow/react
@tanstack/react-table @tanstack/react-virtual`. Branch C: `npm i` the packages and copy their
`dist` files into the renderer's `vendor/` folder in the build script.

```bash
npx shadcn@latest init                          # A: base (Base UI) | radix | aria
npx shadcn@latest search @magicui -q "marquee"  # A: directory registries need no config
npx shadcn@latest view @cult-ui/shift-card      # A: read before installing
npx shadcn@latest add @aceternity/bento-grid sonner drawer command
npx shadcn@latest add https://www.beautifului.dev/r/approval-card.json
```

Always install through a CLI or package manager, never by retyping code from docs. Use
`--dry-run` when unsure. Read what was installed: registry items carry dependencies and CSS.

## Step 4: compose and theme, do not fork

- Wrap each prebuilt primitive once (`components/ui/Dialog.tsx`, or a `wa-dialog` helper) so
  screens call one API and the library can be swapped.
- Customise through CSS variables, data-attribute selectors (`[data-open]`,
  `[data-selected]`), Tailwind tokens or `cva` variants, not by copying a component to edit its
  colours.
- Migrate in small reversible slices: global toast and dialog first, then the heaviest screen,
  then menus, then tables. Keep domain renderers (canvas maps, PDF pipelines) untouched.
- One icon family. Lucide is the default everyone gets; Phosphor, Hugeicons or Tabler when
  the brief has room. Never emoji as icons.

## Step 5: critique before you stop

Render it; screenshot if possible. One memorable element, the rest quiet. No ban-list item
without the brief asking. Responsive to the smallest supported width, visible focus,
`prefers-reduced-motion`, 4.5:1 contrast, touch targets 44 px where gloves or tablets are in
play, line length under 80 characters, sentence case, buttons that say what happens. Remove
one decoration before leaving. Record decisions in `DESIGN.md` and `docs/component-decisions.md`.

## Hard rules

1. **No hand-written standard controls**: button, input, select, combobox, dialog, sheet,
   drawer, dropdown, context menu, tabs, segmented control, toast, tooltip, table, pagination,
   date picker, number field, OTP field, command menu, avatar, badge, skeleton, carousel,
   accordion, progress, chart. Install them.
2. **No hand-written AI interface patterns**: message list, streaming text, reasoning trace,
   tool-call card, approval card, prompt input. Beautiful UI, AI Elements (shadcn/ui),
   prompt-kit, assistant-ui, Kibo UI AI.
3. **Pick the branch that fits the stack.** Do not add Tailwind or React to a project that has
   a rule against them; use branch B or C instead.
4. **One designed component per page.**
5. **Design brief before code**; keep it current.
6. **References over adjectives.** Translate "modern and clean" into a reference and tokens.
7. **One foundation per project. No migrations unless asked.**
8. **CLI or package installs only, then read what landed.** Registries are community code.
9. **The ban list applies by default**; the brief's explicit words win over it.
10. **Say what was not verified.** Licence tiers, framework compatibility and video claims
    you could not check go in the handover, not in the code comments.

## Reference files

- `references/stack-branches.md`: the three branches with a control picker table each
  (need → control → package or registry item) and install notes.
- `references/library-catalog.md`: every library by tier, verified registry namespaces and URLs.
- `references/registry-setup.md`: shadcn CLI, `components.json`, MCP for Claude Code and Codex.
- `references/anti-ai-look.md`: ban list, design method, writing rules, critique checklist.
- `references/sources.md`: what the video showed, what was verified, what was not.
- `templates/DESIGN.md`, `templates/components.registries.json`, `templates/claude-md-snippet.md`,
  `templates/component-decisions.md`.
- `scripts/check-ui-setup.sh`: read-only audit that also names the branch.
