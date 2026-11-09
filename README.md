# gk · prebuilt-controls skill

A skill that makes coding agents **use prebuilt UI controls instead of hand-writing them**,
pick them for the stack the project actually has, theme them with tokens, and **ban the
generic AI look**. It packages Griffin Wooldridge's video
["Stop Letting Claude Build Your Components From Scratch"](https://youtu.be/zsCGS-Yzjnw)
(7 Nov 2026) and his companion articles, Anthropic's `frontend-design` skill, the official
shadcn registry directory, and an analysis of two real Electron apps (`PROPOSAL.md`) into one
thing you can drop into any project.

Three branches, chosen by the audit script:

| Stack | Branch |
|---|---|
| React + Tailwind | **A** shadcn/ui + registries (Magic UI, Aceternity, Cult UI, Kibo UI, Tailark, Beautiful UI …) |
| React without Tailwind, or a "no UI framework" rule | **B** headless Base UI + Sonner, cmdk, Vaul, NumberFlow, TanStack Table and Virtual, styled with your own CSS tokens |
| Vanilla JS, Electron classic scripts, strict CSP | **C** Web Awesome Core web components + Notyf, Tom Select, Air Datepicker, Floating UI, Tabulator, Chart.js, `number-flow`, ninja-keys, vendored locally |

## What is in here

```
.claude/skills/prebuilt-controls/
  SKILL.md                         the skill: three kinds of library, three stack branches, workflow, hard rules
  references/stack-branches.md     control picker per branch: need → prebuilt control → package or registry item
  references/library-catalog.md    ~110 libraries by role with verified install commands
  references/registry-setup.md     shadcn CLI, components.json registries, MCP for Claude Code and Codex
  references/anti-ai-look.md       the ban list, the token-plan method, writing rules, critique checklist
  references/sources.md            what was verified first-hand vs. reconstructed from search
  templates/DESIGN.md              the design brief to fill in per project
  templates/components.registries.json   ready-to-merge registries block
  templates/claude-md-snippet.md   short rules block for a project's CLAUDE.md / AGENTS.md
  templates/component-decisions.md decision matrix for replacing hand-rolled controls
  templates/component-decisions.md decision matrix for replacing hand-rolled controls
  scripts/check-ui-setup.sh        read-only audit of a project's UI setup + next commands
.agents/skills/prebuilt-controls       same skill, on the path Codex scans for skills (symlink)
codex/AGENTS.md                    full, self-contained prompt for ChatGPT Codex
codex/config.toml.snippet          shadcn / Magic UI / 21st MCP entries for ~/.codex/config.toml
CLAUDE.md                          repo instructions: points at the skill, carries the rules
.mcp.json                          shadcn MCP server for Claude Code in this repo
PROPOSAL.md                        analysis of offer-desk and courtyard-inventory with a concrete adoption plan
```

## Use it in Claude Code

**In this repo**: it already works. Open the repo in Claude Code and ask for any UI;
the skill loads on its own, or call it with `/prebuilt-controls`. Approve the `shadcn` MCP
server from `.mcp.json` when prompted (optional, lets Claude browse registries).

**In another project** (project-scoped, shared with the team):

```bash
mkdir -p .claude/skills
cp -r /path/to/gk/.claude/skills/prebuilt-controls .claude/skills/
cat /path/to/gk/.claude/skills/prebuilt-controls/templates/claude-md-snippet.md >> CLAUDE.md
npx shadcn@latest mcp init --client claude    # optional
```

**For every project** (personal): copy the folder to `~/.claude/skills/prebuilt-controls`.

## Use it in ChatGPT Codex

1. Copy `codex/AGENTS.md` to the root of the project (or to `~/.codex/AGENTS.md` for all
   projects), and edit the "Project settings" block at the top.
2. Append `codex/config.toml.snippet` to `~/.codex/config.toml` so Codex gets the shadcn
   MCP server, then run `npx shadcn@latest mcp init --client codex` in the project and
   restart Codex.
3. Optionally copy `.agents/skills/prebuilt-controls` (resolve the symlink: copy
   `.claude/skills/prebuilt-controls`) into the project's `.agents/skills/` so Codex can load
   the full references as a skill.

No files? Paste `codex/AGENTS.md` as the first message of a Codex task. A short kickoff
message that works well after that:

> Build <screen> for <product>. Audience: <who>. Reference: <product or screen to echo>.
> Follow AGENTS.md: write DESIGN.md first, install the components (foundation,
> specialists, one designed component for this page), compose, then critique against the
> ban list. Report the tokens and sources you chose before the code.

## Quick start inside a project

```bash
bash .claude/skills/prebuilt-controls/scripts/check-ui-setup.sh     # what exists, what to add
cp .claude/skills/prebuilt-controls/templates/DESIGN.md DESIGN.md   # fill it in
npx shadcn@latest init                                          # if no components.json
npx shadcn@latest add sonner drawer command                     # specialists
npx shadcn@latest search @magicui -q marquee                    # pick the one showpiece
npx shadcn@latest add @magicui/marquee
```

## Provenance and honesty

The video could not be played from the build environment (YouTube answers it with a sign-in
bot check). Its title, description and several frames (NumberFlow, cmdk, Vaul, Sonner, the
shadcn/Base UI/Radix slide, the restyled "Create project" dialog) were verified from the
user's screenshots; the rest comes from the author's blog posts, which carry the same
three-kinds structure. Every registry namespace and URL in
the catalog was checked against `https://ui.shadcn.com/r/registries.json` on
2026-11-09, and every CLI command against the shadcn docs source or the library's own
README. Details in `.claude/skills/prebuilt-controls/references/sources.md`.

## Sources

- Video: https://www.youtube.com/watch?v=zsCGS-Yzjnw
- Griffin Wooldridge: https://griffinwooldridge.com/blog/best-react-ui-component-libraries, https://griffinwooldridge.com/blog/ai-prompts-for-ui-design, https://griffinwooldridge.com/blog/ai-ui-design-reference-sites, https://griffinwooldridge.com/ai-for-designers
- Anthropic frontend-design skill: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- shadcn docs: https://ui.shadcn.com/docs/mcp, https://ui.shadcn.com/docs/registry/namespace, https://ui.shadcn.com/docs/directory, https://ui.shadcn.com/docs/cli
- Libraries: https://magicui.design, https://ui.aceternity.com, https://www.cult-ui.com, https://www.kibo-ui.com, https://animate-ui.com, https://tailark.com, https://www.beautifului.dev, https://21st.dev/mcp, https://coss.com/ui, https://rareui.in, https://ai-sdk.dev/elements
- Community skill that inspired the decision flow: https://github.com/cruzedevelopment/use-ui-libraries
