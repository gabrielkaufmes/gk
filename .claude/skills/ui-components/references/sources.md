# Sources and verification status

This skill was assembled on 2026-11-09. Be honest with users about what is first-hand.

## The video
**"UI Libraries for Claude Code (Ban the AI Look)"**, Griffin Wooldridge,
https://youtu.be/zsCGS-Yzjnw, published around 2026-11-08.

The video itself could not be watched or transcribed from the build environment
(YouTube was blocked by the network policy). What is known first-hand: the title, and
the description, which says one of the easiest ways to improve AI-built UI is to stop
letting the model make design choices on its own, and links the author's free
"AI for Designers" guide (griffinwooldridge.com/ai-for-designers).

The video's substance was reconstructed from the author's companion articles, found
through web search snippets:

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

If you can watch the video, diff it against `library-catalog.md` and update this file.

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
