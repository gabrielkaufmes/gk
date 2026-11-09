# gk · ui-components skill

A skill that makes coding agents build app UI **from component libraries and
shadcn-compatible registries** instead of hand-writing components, and **ban the
generic AI look**. It packages the approach from Griffin Wooldridge's video
["UI Libraries for Claude Code (Ban the AI Look)"](https://youtu.be/zsCGS-Yzjnw) and
his companion articles, Anthropic's `frontend-design` skill, and the official shadcn
registry directory, into one thing you can drop into any project.

The core idea: stop letting the model make design choices on its own. Decide the visual
system first, install the parts (foundations → specialists → one designed component per
page), compose, then critique against a ban list of default tells.

## What is in here

```
.claude/skills/ui-components/
  SKILL.md                         the skill: tiers, workflow, hard rules
  references/library-catalog.md    ~90 libraries by role with verified install commands
  references/registry-setup.md     shadcn CLI, components.json registries, MCP for Claude Code and Codex
  references/anti-ai-look.md       the ban list, the token-plan method, writing rules, critique checklist
  references/sources.md            what was verified first-hand vs. reconstructed from search
  templates/DESIGN.md              the design brief to fill in per project
  templates/components.registries.json   ready-to-merge registries block
  templates/claude-md-snippet.md   short rules block for a project's CLAUDE.md / AGENTS.md
  scripts/check-ui-setup.sh        read-only audit of a project's UI setup + next commands
.agents/skills/ui-components       same skill, on the path Codex scans for skills (symlink)
codex/AGENTS.md                    full, self-contained prompt for ChatGPT Codex
codex/config.toml.snippet          shadcn / Magic UI / 21st MCP entries for ~/.codex/config.toml
CLAUDE.md                          repo instructions: points at the skill, carries the rules
.mcp.json                          shadcn MCP server for Claude Code in this repo
```

## Use it in Claude Code

**In this repo**: it already works. Open the repo in Claude Code and ask for any UI;
the skill loads on its own, or call it with `/ui-components`. Approve the `shadcn` MCP
server from `.mcp.json` when prompted (optional, lets Claude browse registries).

**In another project** (project-scoped, shared with the team):

```bash
mkdir -p .claude/skills
cp -r /path/to/gk/.claude/skills/ui-components .claude/skills/
cat /path/to/gk/.claude/skills/ui-components/templates/claude-md-snippet.md >> CLAUDE.md
npx shadcn@latest mcp init --client claude    # optional
```

**For every project** (personal): copy the folder to `~/.claude/skills/ui-components`.

## Use it in ChatGPT Codex

1. Copy `codex/AGENTS.md` to the root of the project (or to `~/.codex/AGENTS.md` for all
   projects), and edit the "Project settings" block at the top.
2. Append `codex/config.toml.snippet` to `~/.codex/config.toml` so Codex gets the shadcn
   MCP server, then run `npx shadcn@latest mcp init --client codex` in the project and
   restart Codex.
3. Optionally copy `.agents/skills/ui-components` (resolve the symlink: copy
   `.claude/skills/ui-components`) into the project's `.agents/skills/` so Codex can load
   the full references as a skill.

No files? Paste `codex/AGENTS.md` as the first message of a Codex task. A short kickoff
message that works well after that:

> Build <screen> for <product>. Audience: <who>. Reference: <product or screen to echo>.
> Follow AGENTS.md: write DESIGN.md first, install the components (foundation,
> specialists, one designed component for this page), compose, then critique against the
> ban list. Report the tokens and sources you chose before the code.

## Quick start inside a project

```bash
bash .claude/skills/ui-components/scripts/check-ui-setup.sh     # what exists, what to add
cp .claude/skills/ui-components/templates/DESIGN.md DESIGN.md   # fill it in
npx shadcn@latest init                                          # if no components.json
npx shadcn@latest add sonner drawer command                     # specialists
npx shadcn@latest search @magicui -q marquee                    # pick the one showpiece
npx shadcn@latest add @magicui/marquee
```

## Provenance and honesty

The video could not be played from the build environment (YouTube is blocked there), so
its content was reconstructed from its title and description plus the author's blog
posts, which carry the same three-tier structure. Every registry namespace and URL in
the catalog was checked against `https://ui.shadcn.com/r/registries.json` on
2026-11-09, and every CLI command against the shadcn docs source or the library's own
README. Details in `.claude/skills/ui-components/references/sources.md`.

## Sources

- Video: https://www.youtube.com/watch?v=zsCGS-Yzjnw
- Griffin Wooldridge: https://griffinwooldridge.com/blog/best-react-ui-component-libraries, https://griffinwooldridge.com/blog/ai-prompts-for-ui-design, https://griffinwooldridge.com/blog/ai-ui-design-reference-sites, https://griffinwooldridge.com/ai-for-designers
- Anthropic frontend-design skill: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- shadcn docs: https://ui.shadcn.com/docs/mcp, https://ui.shadcn.com/docs/registry/namespace, https://ui.shadcn.com/docs/directory, https://ui.shadcn.com/docs/cli
- Libraries: https://magicui.design, https://ui.aceternity.com, https://www.cult-ui.com, https://www.kibo-ui.com, https://animate-ui.com, https://tailark.com, https://www.beautifului.dev, https://21st.dev/mcp, https://coss.com/ui, https://rareui.in, https://ai-sdk.dev/elements
- Community skill that inspired the decision flow: https://github.com/cruzedevelopment/use-ui-libraries
