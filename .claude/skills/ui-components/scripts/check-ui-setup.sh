#!/usr/bin/env bash
# Read-only audit of a web project's UI setup. Prints what exists and the next commands.
# Usage: check-ui-setup.sh [project-dir]
set -u
dir="${1:-.}"
cd "$dir" 2>/dev/null || { echo "not a directory: $dir"; exit 1; }

say()  { printf '%s\n' "$*"; }
have() { [ -e "$1" ]; }
dep()  { [ -f package.json ] && grep -Eq "\"$1\"[[:space:]]*:" package.json; }

say "== UI setup audit: $(pwd)"

# Package manager
pm="npm"
have pnpm-lock.yaml && pm="pnpm"
have yarn.lock && pm="yarn"
have bun.lockb && pm="bun"; have bun.lock && pm="bun"
say "package manager: $pm"

if ! have package.json; then
  say "no package.json: not a JS project (or wrong directory)."
  say "next: npx shadcn@latest init -n <app> -t next   # or vite | start | react-router | astro"
  exit 0
fi

# Framework
fw="unknown"
dep next && fw="Next.js"
dep vite && fw="Vite"
dep @tanstack/react-start && fw="TanStack Start"
dep react-router && fw="React Router"
dep astro && fw="Astro"
dep nuxt && fw="Nuxt"
dep svelte && fw="Svelte"
dep expo && fw="Expo"
say "framework: $fw"

# Styling
if dep tailwindcss; then
  v=$(grep -Eo '"tailwindcss"[[:space:]]*:[[:space:]]*"[^"]+"' package.json | head -1 | sed -E 's/.*"([^"]+)"$/\1/')
  say "tailwind: $v"
else
  say "tailwind: not found (most 2026 registries assume Tailwind v4)"
fi

# Foundations
found=()
dep radix-ui && found+=("radix-ui")
dep @base-ui/react && found+=("@base-ui/react")
dep react-aria-components && found+=("react-aria-components")
dep @mui/material && found+=("MUI")
dep @mantine/core && found+=("Mantine")
dep @chakra-ui/react && found+=("Chakra")
dep antd && found+=("Ant Design")
dep @heroui/react && found+=("HeroUI")
say "foundation deps: ${found[*]:-none}"
case " ${found[*]:-} " in
  *" MUI "*|*" Mantine "*|*" Chakra "*|*" Ant Design "*|*" HeroUI "*)
    say "note: a full UI kit is present. Use it; do not add shadcn/ui next to it." ;;
esac

# shadcn
if have components.json; then
  say "components.json: present"
  base=$(grep -Eo '"base"[[:space:]]*:[[:space:]]*"[^"]+"' components.json | head -1 | sed -E 's/.*"([^"]+)"$/\1/')
  style=$(grep -Eo '"style"[[:space:]]*:[[:space:]]*"[^"]+"' components.json | head -1 | sed -E 's/.*"([^"]+)"$/\1/')
  say "  base: ${base:-unspecified}  style: ${style:-unspecified}"
  if grep -q '"registries"' components.json; then
    say "  registries:"
    grep -Eo '"@[A-Za-z0-9_-]+"[[:space:]]*:' components.json | sed -E 's/[":[:space:]]//g; s/^/    /'
  else
    say "  registries: none configured (directory namespaces still work)"
  fi
else
  say "components.json: missing"
fi

# Installed components
for d in components/ui src/components/ui app/components/ui components/magicui components/ai-elements components/kibo-ui components/beautifului; do
  if [ -d "$d" ]; then
    n=$(find "$d" -maxdepth 1 -type f | wc -l | tr -d ' ')
    say "installed: $d ($n files): $(ls "$d" | sed -E 's/\.(tsx|ts|jsx|js)$//' | tr '\n' ' ' | cut -c1-160)"
  fi
done

# Specialists
sp=()
dep sonner && sp+=("sonner")
dep vaul && sp+=("vaul")
dep cmdk && sp+=("cmdk")
dep @number-flow/react && sp+=("number-flow")
dep motion && sp+=("motion")
dep framer-motion && sp+=("framer-motion")
dep @tanstack/react-table && sp+=("tanstack-table")
dep recharts && sp+=("recharts")
dep nuqs && sp+=("nuqs")
say "specialists: ${sp[*]:-none}"

# Icons
ic=()
dep lucide-react && ic+=("lucide")
dep @phosphor-icons/react && ic+=("phosphor")
dep @tabler/icons-react && ic+=("tabler")
dep @hugeicons/react && ic+=("hugeicons")
dep @heroicons/react && ic+=("heroicons")
dep react-icons && ic+=("react-icons")
say "icon families: ${ic[*]:-none}"
[ "${#ic[@]}" -gt 1 ] && say "note: more than one icon family. Pick one."

# Fonts and tells
if grep -rEl --include='*.css' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
     -e 'Inter[^a-zA-Z]' -e 'Roboto' -e 'font-sans' . 2>/dev/null | grep -v node_modules | head -3 | grep -q .; then
  say "fonts: Inter/Roboto/default sans referenced. Choose a face for the subject (see anti-ai-look.md)."
fi
if grep -rEl --include='*.tsx' --include='*.jsx' --include='*.css' -e 'from-purple' -e 'to-purple' -e 'violet-' -e 'backdrop-blur' . 2>/dev/null | grep -v node_modules | head -1 | grep -q .; then
  say "tells: purple gradients or blur surfaces found; confirm the brief asks for them."
fi

# Design brief
for f in DESIGN.md design.md docs/DESIGN.md .claude/DESIGN.md; do
  have "$f" && { say "design brief: $f"; brief=1; break; }
done
[ "${brief:-0}" = 1 ] || say "design brief: none. Copy templates/DESIGN.md and fill it before writing UI."

# MCP
have .mcp.json && grep -q shadcn .mcp.json && say "mcp (Claude Code): shadcn server configured in .mcp.json"
have .mcp.json && grep -q magicui .mcp.json && say "mcp (Claude Code): Magic UI server configured"
have .mcp.json && grep -q 21st .mcp.json && say "mcp (Claude Code): 21st server configured"
have .mcp.json || say "mcp: no .mcp.json. Optional: npx shadcn@latest mcp init --client claude"
have CLAUDE.md && grep -qi 'ui rules\|ui-components' CLAUDE.md && say "CLAUDE.md: has UI rules"
have AGENTS.md && grep -qi 'ui rules\|ui-components' AGENTS.md && say "AGENTS.md: has UI rules"

say ""
say "== Suggested next commands"
if ! have components.json && [ -z "${found[*]:-}" ]; then
  say "npx shadcn@latest init            # foundation (base: base | radix | aria)"
fi
if have components.json; then
  dep sonner || say "npx shadcn@latest add sonner      # toasts"
  dep vaul   || say "npx shadcn@latest add drawer      # Vaul drawer"
  dep cmdk   || say "npx shadcn@latest add command     # cmdk command menu"
  dep @number-flow/react || say "$pm add @number-flow/react       # animated numbers"
  say "npx shadcn@latest search @magicui -q <term>   # find the one designed component for the page"
fi
exit 0
