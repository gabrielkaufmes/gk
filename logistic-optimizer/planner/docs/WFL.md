# WFL — Window Flow Language

A tiny domain-specific language so the office can express planning logic over the
SQL columns as editable text, without a deploy. `src/engine/wfl.mjs`.

```js
import { parse, run } from "./src/engine";
const prog = parse(sourceText);
const { kpis, ctas, computed } = run(prog, rows);
```

- `kpis`  — `[{ label, value }]`
- `ctas`  — `[{ sev, id, msg }]`, sorted by severity (0 = critical)
- `computed` — each input row plus its `let` fields, for downstream views

## Statements

| Statement | Purpose |
|-----------|---------|
| `const NAME = EXPR` | Global constant. |
| `let NAME = EXPR` | Per-order derived field (sees row columns + consts + earlier lets). |
| `kpi "Label" = EXPR` | Dashboard metric. Use `@aggregates`. |
| `rule "name" when COND => action(SEVERITY, MESSAGE)` | Fires one CTA per matching row. |

Comments start with `#`.

## Expressions

- **Durations**: `1h` (=1), `30m` (=0.5), `1d` (=24) → hours.
- **Math**: `+ - * / %`
- **Compare**: `== != < <= > >=`
- **Logic**: `and  or  not`, choice `if C then A else B`
- **Functions**: `max min abs round floor ceil`
- **Strings**: `"..."`, `+` concatenates (numbers auto-format).
- **Aggregates** (over all rows): `@count(where C)`, `@sum(EXPR where C)`,
  `@avg`, `@min`, `@max`. The `where` clause is optional.
- **Severity** literals: `critical | action | review`.

## Example (reproduces the orchestrator)

```wfl
const min_stage = 1h
const truck_cap = 80

let remaining = stages_total - stage_index
let mat_ready = max(0, materials_in)
let earliest  = mat_ready + remaining * min_stage
let slack     = loading_in - earliest
let budget    = if remaining > 0 then max(min_stage, (loading_in - mat_ready) / remaining) else 0

kpi "Orders"        = @count()
kpi "Avg slack (h)" = @avg(slack)
kpi "At risk"       = @count(where slack < 4)
kpi "PVC pieces"    = @sum(pcs where material == "pvc")

rule "late"     when slack < 0                                      => action(critical, id + " late by " + abs(slack) + "h")
rule "blocked"  when materials_in > 0                               => action(critical, "Expedite materials for " + id)
rule "expedite" when slack >= 0 and slack < 4 and materials_in <= 0 => action(action, "Push " + id + " — " + slack + "h slack")
```

## Where rules live

Store the program text in your settings table (one per screen/role). The office
edits logic; no redeploy. Treat WFL output as **advisory** until machine-steering
integration is hardened — see `INTEGRATION.md`.

## Grammar notes / limits

- Operator precedence: `or < and < not < compare < + − < * / % < unary − < primary`.
- `if/then/else` is an expression (ternary), usable anywhere a value is expected.
- Aggregates evaluate their `measure`/`where` in each row's scope.
- Errors throw with a readable message; the playground shows them inline.
