# gk

This repository holds the **prebuilt-controls** skill: use prebuilt UI controls instead of
hand-writing them, pick them for the stack you actually have (shadcn registries, headless
Base UI, or web components for vanilla and Electron apps), theme them with tokens, and avoid
the generic AI look. `PROPOSAL.md` applies it to the Elwiz apps (offer-desk, courtyard-inventory).

- Skill: `.claude/skills/prebuilt-controls/SKILL.md` (auto-loads in Claude Code for UI work;
  invoke by name with `/prebuilt-controls` or by asking for UI).
- Codex export: `codex/AGENTS.md` (full prompt) and `codex/config.toml.snippet` (MCP).
- Same skill exposed for Codex skill discovery at `.agents/skills/prebuilt-controls`.

## UI rules (apply in this repo and in any app scaffolded from it)

- Pick the branch first: A shadcn/ui + registries (React + Tailwind), B Base UI + unstyled
  specialists (React without Tailwind), C Web Awesome + vanilla libraries (no React). Never add
  Tailwind or React to a project whose docs forbid a new UI framework.
- Build UI from installed controls, never from scratch: in branch A shadcn/ui is the foundation;
  Sonner, Vaul (drawer), cmdk (command), NumberFlow for the parts that are hard to get
  right; one designed component per page from Magic UI, Aceternity, Cult UI, Tailark or
  Beautiful UI. Install with `npx shadcn@latest add <item | @registry/item | url>`; read
  what landed; do not retype code from docs.
- Read `DESIGN.md` before touching UI. If it does not exist, write it first from
  `.claude/skills/prebuilt-controls/templates/DESIGN.md`, then build. Keep it updated.
- Avoid by default: Inter/Roboto/system-ui as the only face; purple gradients and glow
  blobs; cream + terracotta; near-black + acid green; centred hero + three feature
  cards; identical rounded cards with the same shadow; ALL-CAPS eyebrows; one
  highlighted headline word; `01/02/03` numbering without a sequence; `→` on links;
  fade-up on every section; hover-lift on every card; two animated showpieces on one
  page; emoji as icons; "Submit"/"Learn more" buttons; marketing filler copy.
  The brief's explicit words override this list.
- Quality floor: responsive to 360 px, visible focus, reduced motion respected, 4.5:1
  text contrast, line length under 80 characters, sentence case, buttons that say what
  happens.
- One icon family. One foundation library. No migrations unless asked.

## Maintenance

- Registry namespaces and URLs in the catalog were verified against
  `https://ui.shadcn.com/r/registries.json` on 2026-11-09. Re-check before relying on
  one that matters; the directory changes weekly.
- `references/sources.md` records what was verified first-hand and what came from
  search snippets. Keep it honest when updating.
