# AGENTS.md — UI from component libraries, no AI look

<!--
Full prompt for ChatGPT Codex (CLI, IDE extension or cloud). Use it one of three ways:
1. Save as AGENTS.md at the root of the project you want Codex to build (recommended).
2. Save as ~/.codex/AGENTS.md to apply to every project.
3. Paste the whole file as the first message of a Codex task.
Edit the "Project settings" block; everything else can stay as is.
-->

## Project settings (edit me)

- Stack: <Next.js 16 / Vite + React 19 / TanStack Start>, Tailwind CSS v4, TypeScript.
- Foundation: shadcn/ui with base **base** (Base UI). Alternatives: radix, aria.
- Design brief: `DESIGN.md` at the repo root. If missing, write it first (template below).
- Package manager: <pnpm | npm | bun>.
- MCP: shadcn MCP configured in `~/.codex/config.toml` (see "Tooling"). Optional: 21st MCP.

## Why these rules exist

AI-built interfaces look generic for two reasons: the model hand-writes components that
libraries already ship (so they are worse than the library version), and the model makes
design choices nobody asked for (so it picks the statistical average). The fix is to
**install instead of write** and to **decide the visual system before coding**, then ban
the default tells.

## Hard rules

1. **Never hand-write a standard component.** Button, input, select, combobox, dialog,
   sheet, drawer, dropdown, tabs, toast, tooltip, table, pagination, calendar, date
   picker, command menu, avatar, badge, skeleton, carousel, accordion, chart, sidebar:
   install them. If a component exists in `components/ui`, use it.
2. **Never hand-write AI interface patterns.** Message lists, streaming text, reasoning
   traces, tool-call cards, approval cards, prompt inputs with attachments come from
   Beautiful UI, AI Elements (shadcn/ui), prompt-kit, assistant-ui or Kibo UI.
3. **Install via CLI, then read what landed.** `npx shadcn@latest add …`. Never retype
   component code from documentation. Use `--dry-run` when unsure. Review third-party
   code: registries are community-maintained.
4. **One foundation per project.** Do not add MUI, Mantine, Chakra or Ant Design next
   to shadcn/ui, and do not migrate an existing kit unless asked.
5. **Design brief before UI code.** Read `DESIGN.md`. If it is missing, write it from
   the subject matter (template below), state the tokens in a short block in your
   reply, and proceed. Do not block waiting for approval.
6. **One designed (animated, showpiece) component per page.** Two fight each other.
7. **References over adjectives.** When a request says "modern, clean, professional",
   translate it into a concrete reference and tokens before building.
8. **The ban list applies by default.** The brief's explicit words always win over it.
9. **Compose and theme, do not fork.** Change looks through CSS variables, Tailwind
   tokens, `cva` variants and wrapper components, not by copying a component to edit
   its colours.
10. **Keep `DESIGN.md` current.** Any token, source or rule you add during the task is
    written back into it.

## The library stack

### Foundations (behaviour and accessibility; the code is yours)
- **shadcn/ui** (`npx shadcn@latest init`, `add <item>`). Base UI is the default base;
  `--base radix` or `--base aria` if the project needs it. Flags `--style`, `--base-color`,
  `--css-variables` were removed in CLI v4.
- Direct primitives only when shadcn lacks one: `@base-ui/react`, `radix-ui`,
  React Aria (`@react-aria/<item>` registry).
- Alternatives with the same model: **coss ui** `@coss` (Cal.com, ex-Origin UI),
  **basecn** `@basecn`, **Intent UI** `@intentui`, **Dice UI** `@diceui`.

### Specialists (the parts AI gets wrong when it writes them from scratch; add these first)
- Toasts **Sonner**: `npx shadcn@latest add sonner`
- Drawer and mobile bottom sheet **Vaul**: `npx shadcn@latest add drawer`
- Command menu and combobox **cmdk**: `npx shadcn@latest add command`
- Changing numbers **NumberFlow**: `npm i @number-flow/react`
- Data tables: `@data-table-filters/<item>`, `@tablecn/<item>` (TanStack Table, faceted filters, URL state)
- Composite widgets **Kibo UI** `@kibo-ui/<item>`: dropzone, kanban, gantt, calendar, code block, editor, AI chat
- Rich text: `@plate/<item>`, `@shadcn-editor/<item>`
- Charts: `npx shadcn@latest add chart` plus `@evilcharts`, `@chartory`, `@dashboardcn`
- Calendar views `@calendarcn`; uploads `@uploadcn`, `@better-upload`; maps `@mapcn`
- Confirmations `@sureui`; onboarding `@tour`, `@stepper`; forms `@formcn`, shadcn `field`, `input-group`
- URL state `nuqs`; loaders `@loadercn`
- Vendor blocks: `@clerk`, `@better-auth-ui`, `@supabase`, `@billingsdk`, `@c15t` (consent), `@openstatus`, `@emailcn`

### Designed components (finished and styled; one per page, as the memorable element)
- **Magic UI** `@magicui/<item>` (marquee, bento grid, blur fade, globe, shimmer button, animated beam). MIT.
- **Aceternity UI** `@aceternity/<item>` (spotlight, lamp, typewriter, 3D card, background beams). Strong look; use sparingly.
- **Cult UI** `@cult-ui/<item>` (dynamic island, shift card, device mockups, fluted glass, kanban).
- **Animate UI** `npx @animate-ui/cli@latest animate all` or `@animate-ui/<item>`: animated versions of the primitives you already installed.
- **Motion Primitives** `@motion-primitives/<item>`, **React Bits** `@react-bits/<item>`, **Smooth UI** `@smoothui`, **Kokonut UI** `@kokonutui`, **Skiper UI** `@skiper-ui`, **Fancy UI** `@fancy-ui`, **Keyframery** `@keyframery` (one `<Cuts />` animates dialogs, sheets, tabs, toasts).
- **RareUI** (own CLI): `npx rareui add liquid-metal`. MIT, asks for a visible credit.
- Marketing blocks: **Tailark** `@tailark/<item>` (also `@tailark-oss` at `https://oss-tailark.com/r/{name}`), **Shadcnblocks** `@shadcnblocks`, **Launch UI** `@launchui`, **Cnippet Blocks** `@cnippet-blocks`, `@blocks-so`, `@shadcn-studio`.
- Dashboards: `@dashboardblocks`, `@dashboardcn`, `@shadcn-dashboard`. E-commerce: `@commercn`, `@ecomcn`.
- **AI product UI**: **Beautiful UI** `npx shadcn@latest add https://www.beautifului.dev/r/<item>.json` (thinking trace, streaming text with sources, approval card, tool-call chips, task rows, prompt bar; merge its foundation stylesheet once); **AI Elements** `@ai-elements/<item>` (moving into shadcn/ui, standalone package deprecated end of Nov 2026); `@prompt-kit`, `@assistant-ui`, `@kibo-ui/ai`, `@tool-ui`, `@agent-ui-kit`, `@approvals-ui`, `@hextaui`; voice `@elevenlabs-ui`, `@pipecat`, `@agents-ui`.
- Alternative aesthetics when the brief wants a world: `@retroui`, `@neobrutalism`, `@brut-ui`, `@8bitcn`, `@ui95`, `@nostalgia-ui`, `@cupertinoui`, `@materialcn`, `@fluent2-react-kit`, `@glass-ui`, `@neumorphism-ui`, `@fibo`, `@ai2`, `@reui`.

All `@namespace` entries above are in the official shadcn registry directory
(`https://ui.shadcn.com/r/registries.json`, 2026-11-09), so they install with no
`components.json` change. Sources outside the directory go under `registries`:

```json
{
  "registries": {
    "@beautifului": "https://www.beautifului.dev/r/{name}.json",
    "@tailark-oss": "https://oss-tailark.com/r/{name}",
    "@private": { "url": "https://registry.acme.com/{name}.json", "headers": { "Authorization": "Bearer ${REGISTRY_TOKEN}" } }
  }
}
```

### Icons
One family per product. Lucide (`lucide-react`) is the default everyone gets; consider
Phosphor (`@phosphor-icons/react`), Hugeicons or Tabler. Animated single-file icons:
`@lucide-animated`, `@icons-animated`, `@animateicons`. Brand logos: `@svgl/<brand>`.
Never emoji as icons.

### Themes and type
`npx shadcn@latest apply <preset>` (`--only theme | font`); tweakcn.com exports shadcn
CSS variables with fonts, radius and shadows. Load fonts with `next/font` or
`@fontsource-variable/*`. Define 4 to 6 colour tokens once in `globals.css`.

### Discovery
```bash
npx shadcn@latest search @magicui -q "marquee"   # search a registry
npx shadcn@latest list @cult-ui                  # list a registry
npx shadcn@latest view @aceternity/bento-grid    # read files before installing
npx shadcn@latest add @kibo-ui/dropzone --dry-run
```
Reference sites to point at instead of adjectives: Mobbin (real product screens), Refero
(full flows), 21st.dev (components), Transitions.dev (motion), beautifului.dev (AI UI).

## Tooling

shadcn MCP for Codex (the CLI cannot write this file; add it by hand to `~/.codex/config.toml`):

```toml
[mcp_servers.shadcn]
command = "npx"
args = ["shadcn@latest", "mcp"]
```

Then run `npx shadcn@latest mcp init --client codex` in the project and restart Codex.
With the MCP connected, prompts like "show me components from the magicui registry" or
"install @kibo-ui/dropzone" work directly. Optional 21st MCP: `npx @21st-dev/cli@latest
init --client codex` (needs a free API key from 21st.dev/mcp; keep it out of the repo).

Magic UI MCP (stdio): command `npx`, args `["-y", "@magicuidesign/mcp@latest"]`.

## Workflow for any UI task

1. **Audit**: read `package.json`, `components.json`, `components/ui`, `DESIGN.md`.
   Note the foundation, base, installed components, icon family, fonts.
2. **Brief**: read or write `DESIGN.md`. Check every line: would I produce this for a
   different product with a similar prompt? If yes, it is a default; change it and say why.
3. **Sources**: name the foundation items, the specialists, and the one designed component
   for this page, with the exact install command for each.
4. **Install**: run the commands. Read the installed files. Note dependencies and CSS they added.
5. **Compose**: build the screen from the installed parts. Theme through tokens and variants.
6. **Critique**: run the app, look at it (screenshot if possible). Check the ban list,
   the quality floor and the copy. Remove one decoration before finishing.
7. **Record**: update `DESIGN.md` with anything new. Summarise sources and decisions in
   the reply.

## Ban list (defaults to avoid unless the brief asks)

Typography: Inter, Roboto, Arial or `system-ui` as the only face; one headline word in a
different colour, italic or gradient; ALL-CAPS tracked eyebrow labels; decorative labels
above content; gradient text; monospace for non-code data labels.

Colour and surfaces: purple or blue-to-purple gradients and "AI purple"; glow blobs behind
the hero; warm cream (`#F4F1EA`-ish) with a serif display and terracotta accent
(`#D97757`-ish); near-black with one acid-green or vermilion accent; tinted near-black
(`#0B0B0B`, `#111`) with hairline rules everywhere; glassmorphism on every surface; the
same `rgba(0,0,0,.1)` shadow under every card.

Layout: centred hero then three identical feature cards; bento grid as the default
answer; identical rounded cards with one radius regardless of hierarchy; `01 / 02 / 03`
numbering when content is not a sequence; middle-dot meta strings (`A · B · C`) and
`WORD — fragment` labels; `→` appended to links and buttons; three columns of icons with
two lines of copy.

Motion: fade-and-slide-up on every section; hover scale or lift on every card; parallax
plus particles plus animated gradients; any motion that does not answer a user action
beyond one orchestrated moment per page.

Copy: "Unlock the power of…", "Seamlessly…", "Elevate…", "Welcome to the future of…";
buttons that say "Submit", "Click here", "Learn more"; lorem ipsum or "Feature one"
placeholders in deliverables; apologetic or vague errors; emoji as icons or bullets.

Process: hand-written standard components; two animated showpieces on a page; several
icon families; a new accent colour per section.

## Design principles (positive)

- Ground the design in the subject: the product's world supplies the palette, type and
  imagery. A surveying tool, a toy for eight-year-olds and a bond desk look nothing alike.
- Typography carries the personality: one or two clearly distinct families, a real type
  scale, intentional weights, line length under 80 characters, serif body with slightly
  more line-height.
- Structure is information: borders, numbering, dividers and labels encode something
  about the content or they go.
- Spend boldness in one place; keep everything else quiet.
- Motion: one orchestrated moment per page; everything else reacts to input; respect
  `prefers-reduced-motion`.
- Quality floor without announcing it: responsive to 360 px, visible keyboard focus,
  4.5:1 text contrast, 44 px touch targets, no horizontal scroll.
- Writing: words make the interface easier to use. Name things as users think. Active
  voice; a button says what happens ("Save changes", not "Submit") and keeps its name
  through the flow ("Publish" → "Published"). Errors say what went wrong and how to fix
  it, without apologising. Empty states invite the first action. Sentence case.

## DESIGN.md template

```markdown
# Design brief
## Subject
- Product: … | Audience: … | Primary job: … | World and vernacular: … | References: …
## Tokens
### Colour (4–6 named values with roles; one accent and what it means)
| token | value | role |
### Type
- Display: <family, weights, source> | Text: <family> | Scale: 12/14/16/20/28/40/64 | Measure ≤ 72ch
### Space and shape
- Base unit: 4|8 px | Radius: controls __ / containers __ | Shadows: none|one|layered on <element>
### Layout
- Concept: … | Alignment: … because … | Wireframe: (ASCII)
### Motion
- The one moment: … | Everything else reacts to input; reduced motion respected.
## Sources
- Foundation: shadcn/ui (base: …) | Specialists: sonner, drawer, command, number-flow, …
- Designed component, one per page: <page> → <@registry/item> because …
- Icons: <one family> | Theme: <preset / tweakcn / hand-written>
## Principles
1. … 2. … 3. …
## Avoid (project-specific)
- …
```

## Reply format for UI tasks

Start with the decisions: subject, tokens in one block, the component sources with
install commands. Then what was installed and composed, with file paths. Then the
critique: what you checked, what you removed. Keep it short; the code is the deliverable.
