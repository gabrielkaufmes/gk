# gk

This repository holds the **ui-components** skill: a method for building app UI from
component libraries and shadcn-compatible registries while avoiding the generic AI look.

- Skill: `.claude/skills/ui-components/SKILL.md` (auto-loads in Claude Code for UI work;
  invoke by name with `/ui-components` or by asking for UI).
- Codex export: `codex/AGENTS.md` (full prompt) and `codex/config.toml.snippet` (MCP).
- Same skill exposed for Codex skill discovery at `.agents/skills/ui-components`.

## UI rules (apply in this repo and in any app scaffolded from it)

- Build UI from installed components, never from scratch: shadcn/ui is the foundation;
  Sonner, Vaul (drawer), cmdk (command), NumberFlow for the parts that are hard to get
  right; one designed component per page from Magic UI, Aceternity, Cult UI, Tailark or
  Beautiful UI. Install with `npx shadcn@latest add <item | @registry/item | url>`; read
  what landed; do not retype code from docs.
- Read `DESIGN.md` before touching UI. If it does not exist, write it first from
  `.claude/skills/ui-components/templates/DESIGN.md`, then build. Keep it updated.
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
