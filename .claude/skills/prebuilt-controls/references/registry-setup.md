# Registry and MCP setup

Everything below is from the shadcn docs source (`shadcn-ui/ui`, `apps/v4/content/docs`)
and the libraries' own READMEs, read 2026-11-09. CLI version at that date: `shadcn` 4.23.

## 1. Initialise shadcn/ui

```bash
npx shadcn@latest init                 # existing project: prompts for base, template, preset
npx shadcn@latest init --base radix    # or: base (Base UI, default) | aria (React Aria)
npx shadcn@latest init -n my-app -t next   # new project (templates: next, vite, start, react-router, laravel, astro)
npx shadcn@latest info                 # what the CLI detected about the project
```

`init` writes `components.json`, adds the `cn` helper and the CSS variables. Removed in
CLI v4 and now erroring: `--style`, `--base-color`, `--src-dir`, `--no-base-style`,
`--css-variables`.

## 2. Add items

```bash
npx shadcn@latest add button card dialog          # core registry
npx shadcn@latest add @magicui/marquee            # directory namespace, zero config
npx shadcn@latest add @kibo-ui/dropzone @cult-ui/shift-card   # several at once
npx shadcn@latest add https://www.beautifului.dev/r/approval-card.json   # by URL
npx shadcn@latest add owner/repo/item             # any GitHub repo with a registry.json
npx shadcn@latest add @aceternity/bento-grid --dry-run    # preview what will be written
npx shadcn@latest add @tailark/dusk-hero-section-one --overwrite
```

Inspect first:

```bash
npx shadcn@latest search @magicui -q "beam"       # search a registry
npx shadcn@latest search @shadcn @magicui -q "card"   # several registries
npx shadcn@latest list @cult-ui                   # everything in a registry
npx shadcn@latest view @motion-primitives/dock    # print the files before installing
```

The CLI resolves `@namespace` against the open-source registry index
(`https://ui.shadcn.com/r/registries.json`) and writes the entry into
`components.json` for you. Namespaces in the index on 2026-11-09 that this skill uses:
`@aceternity`, `@magicui`, `@cult-ui`, `@kibo-ui`, `@animate-ui`, `@motion-primitives`,
`@react-bits`, `@tailark`, `@coss`, `@ai-elements`, `@prompt-kit`, `@assistant-ui`,
`@reui`, `@shadcnblocks`, `@skiper-ui`, `@smoothui`, `@kokonutui`, `@data-table-filters`,
`@tablecn`, `@evilcharts`, `@chartory`, `@dashboardcn`, `@mapcn`, `@sureui`, `@tour`,
`@plate`, `@uploadcn`, `@svgl`, `@react-aria`, `@basecn`, `@intentui`, `@diceui`.

## 3. Registries that need `components.json` entries

Only for sources outside the index, or to pin an alternative host:

```json
{
  "registries": {
    "@tailark-oss": "https://oss-tailark.com/r/{name}",
    "@beautifului": "https://www.beautifului.dev/r/{name}.json",
    "@acme": {
      "url": "https://registry.acme.com/{name}.json",
      "headers": { "Authorization": "Bearer ${REGISTRY_TOKEN}" }
    }
  }
}
```

Rules: names start with `@`, letters, digits, hyphens and underscores only. The
`{name}` placeholder is required; `{style}` is optional. `${VAR}` expands from the
environment, so secrets stay in `.env.local`. A ready-to-merge block is in
`../templates/components.registries.json`.

## 4. Other CLIs

```bash
npx rareui add liquid-metal                       # RareUI (own registry at rareui.in/r)
npx @animate-ui/cli@latest animate all            # swap every installed shadcn primitive for the animated one
npx kibo-ui@latest add kanban                     # Kibo UI's CLI (or use @kibo-ui via shadcn)
npx ai-elements@latest add message                # AI Elements (deprecated end Nov 2026; prefer shadcn/ui AI Elements)
npx @magicuidesign/cli@latest install claude      # Magic UI MCP config for Claude Code
npx @21st-dev/cli@latest init --client claude     # 21st MCP (clients: cursor | claude | vscode | windsurf | codex)
```

## 5. MCP servers

### shadcn MCP (browse, search, install any configured registry)

Claude Code, one command, then restart and check with `/mcp`:

```bash
npx shadcn@latest mcp init --client claude
```

Or write `.mcp.json` at the project root yourself:

```json
{
  "mcpServers": {
    "shadcn": { "command": "npx", "args": ["shadcn@latest", "mcp"] }
  }
}
```

Codex: the CLI cannot edit `~/.codex/config.toml`, so add this by hand:

```toml
[mcp_servers.shadcn]
command = "npx"
args = ["shadcn@latest", "mcp"]
```

Cursor: `npx shadcn@latest mcp init --client cursor` (then enable in settings).
VS Code: `--client vscode`, then Start in `.vscode/mcp.json`. OpenCode: `--client opencode`.

Prompts that work once connected: "Show me components from the magicui registry",
"Install @kibo-ui/dropzone", "Build a pricing section using items from the tailark
registry". The MCP server reads the same `components.json` registries as the CLI.

### Magic UI MCP

```json
{ "mcpServers": { "magicuidesign-mcp": { "command": "npx", "args": ["-y", "@magicuidesign/mcp@latest"] } } }
```

Tools: `listRegistryItems`, `searchRegistryItems`, `getRegistryItem`. Prompts: "Make a
marquee of logos", "Add a blur fade text animation", "Add a grid background".

### 21st MCP (formerly Magic MCP)

HTTP server, API key required (free at 21st.dev/mcp; old Magic keys were reset):

```json
{ "mcpServers": { "21st": { "url": "https://21st.dev/api/mcp", "headers": { "x-api-key": "YOUR_21ST_API_KEY" } } } }
```

Tools: `search`, `get_component`, `get_inspiration`, `search_logo`, and `generate` /
`iterate_generation` when AI access is enabled. Legacy names (`21st_magic_component_builder`
and friends) are still translated. Also installable as a Claude Code plugin:
`claude plugin marketplace add 21st-dev/magic-mcp` then `/plugin install 21st`, with the
key in `API_KEY_21ST`. Keep API keys out of committed files.

### Design reference MCPs

Mobbin and Refero publish MCP servers; connect one when the brief needs real product
references. They return screens and flows, not code.

## 6. Verify the setup

```bash
cat components.json | npx -y json5 2>/dev/null || cat components.json   # base, aliases, registries
npx shadcn@latest info
ls components/ui                                  # what is installed
npx shadcn@latest search @magicui -q marquee      # registry reachable
```

In Claude Code, `/mcp` lists connected servers and their tools. In Codex, restart after
editing `config.toml`.

## 7. Troubleshooting

- **"No tools or prompts"** from the MCP: `npx clear-npx-cache`, re-enable the server, check client logs.
- **Registry item not found**: check the namespace spelling (`@magicui`, not `@magic-ui`), run `npx shadcn@latest list @ns`, confirm the registry is online.
- **Install writes to the wrong folder**: fix `aliases` in `components.json` or pass `--path`.
- **Tailwind v3 project**: most 2026 registries target Tailwind v4 and `tw-animate-css`; check the item's `dependencies` and `cssVars` with `view` before adding.
- **Base mismatch**: an item built for Radix can land in a Base UI project; prefer registries that publish for your base (Tailark has both; Animate UI supports Radix, Base UI and React Aria).
