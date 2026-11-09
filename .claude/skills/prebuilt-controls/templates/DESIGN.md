# Design brief

Fill this in before writing UI code. Keep it short and specific. Update it whenever a
token, source or rule changes during the work. Everything here overrides the skill's
defaults and its ban list.

## Subject
- **Product**: <what it is, in one sentence>
- **Audience**: <who uses it, in what situation>
- **Primary job**: <the one thing a screen must let them do>
- **World and vernacular**: <materials, places, objects, tone the subject brings with it>
- **References**: <1 to 3 products, screens or styles to echo; links if possible>

## Tokens
### Colour (4 to 6 named values, with roles)
| Token | Value | Role |
|---|---|---|
| surface | #______ | page background |
| surface-raised | #______ | cards, sheets |
| text | #______ | primary text |
| text-muted | #______ | secondary text |
| accent | #______ | <what the accent means: primary action / live state / brand> |
| accent-contrast | #______ | text on accent |

Mode: light | dark | both (default: ____). Contrast target: 4.5:1 for text.

### Type
- **Display**: <family>, weights <…>, from <next/font | fontsource | self-hosted>
- **Text**: <family or "same as display">
- **Scale**: 12 / 14 / 16 / 20 / 28 / 40 / 64 (edit)
- **Measure**: body line length ≤ 72 characters; line-height 1.5 (serif 1.6)
- Rules: sentence case everywhere; no single-word highlights; no all-caps eyebrows.

### Space and shape
- **Base unit**: 4 px | 8 px
- **Radius**: controls ____ px, containers ____ px (or all 0)
- **Shadows**: none | one | layered on <the one element>
- **Borders**: <hairline / none / 2 px>; what a border means here

### Layout
- **Concept**: <one sentence>
- **Alignment**: left | centred | mixed, because <reason>
- **Wireframe**:
```
+--------------------------------------------------+
|                                                  |
+--------------------------------------------------+
```

### Motion
- **The one moment**: <what animates on load or reveal, and why>
- Everything else: reacts to user input only; respects `prefers-reduced-motion`.

## Sources
- **Foundation**: shadcn/ui (base: base | radix | aria) | <other>
- **Specialists**: sonner, drawer (vaul), command (cmdk), number-flow, <tables / charts / editor / upload>
- **Designed component, one per page**:
  - <page>: <@registry/item> because <reason>
- **Icons**: <family>, one family only
- **Themes**: <preset id / tweakcn export / hand-written>

## Principles
1. <what makes this not interchangeable>
2. <where the boldness is spent>
3. <what stays quiet>

## Avoid (project-specific additions to the ban list)
- <…>
