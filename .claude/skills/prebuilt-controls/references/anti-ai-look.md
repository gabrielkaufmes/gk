# Anti-"AI look": the ban list and the design method

The "AI look" is not one style. It is the statistical centre of the training set: the
choices a model makes when nobody made a choice. Every item below is legitimate when a
brief asks for it. The rule is: **the brief's explicit words win; where the brief is
silent, never spend that freedom on a default.**

## The ban list (apply unless the brief asks for the item)

### Typography
- Inter, Roboto, Arial, `system-ui` or the Tailwind default stack as the only face.
- One headline word in a different colour, italic or gradient.
- ALL-CAPS tracked-out "eyebrow" labels above every heading.
- Decorative labels above content that add no information.
- Gradient text.
- A monospace face for small data labels when the content is not code.

### Colour and surfaces
- Purple or blue-to-purple gradients; "AI purple"; glow blobs behind the hero.
- Warm cream (`#F4F1EA`-ish) with a high-contrast serif and a terracotta accent (`#D97757`-ish).
- Near-black with one acid-green or vermilion accent.
- Tinted near-black (`#0B0B0B`, `#111`) standing in for black, with hairline rules everywhere.
- Glassmorphism on every surface.
- The same grey `rgba(0,0,0,.1)` shadow under every card.

### Layout
- Centered hero, then three identical feature cards with an icon each.
- Bento grid as the default answer to "show several things".
- Everything in identical rounded cards with the same radius regardless of hierarchy.
- `01 / 02 / 03` numbering when the content is not a sequence.
- Meta strings joined with middle dots (`A · B · C`) and `WORD — fragment` labels.
- An arrow `→` appended to every link and button.
- Three columns of identical icons with two lines of copy each.

### Motion
- Fade-and-slide-up entrance on every section.
- Hover scale or lift on every card.
- Parallax, particles and animated gradients at the same time.
- Any motion that does not answer a user action, except one orchestrated moment per page.

### Copy
- "Unlock the power of…", "Seamlessly…", "Elevate your…", "Welcome to the future of…".
- Buttons that say "Submit", "Click here", "Learn more" instead of what happens.
- Lorem ipsum or "Feature one / Feature two" placeholders in a deliverable.
- Error messages that apologise or stay vague.
- Emoji as icons or as bullet points.

### Process tells
- Hand-written buttons, dialogs, dropdowns, tables, date pickers, toasts, chat bubbles.
- Two animated showpieces on one page.
- A different icon family per component.
- A new accent colour per section.

## The method: plan, check, build, critique

### 1. Ground the design in the subject
Name the product, the audience and the primary job before choosing anything. Take the
visual vocabulary from that world: a tool for surveyors does not look like a toy for
eight-year-olds does not look like a bond desk. If the brief lacks a subject, propose one
concrete subject and proceed.

### 2. Write the token plan (into `DESIGN.md`)
- **Palette**: 4 to 6 named hex or OKLCH values with roles. One accent, and a sentence
  on what the accent means (primary action, live state, brand).
- **Type**: one or two families, clearly distinct if two; roles; a scale (for example
  12 / 14 / 16 / 20 / 28 / 40 / 64); weights; line length under 80 characters; serif
  body gets a touch more line-height.
- **Space and shape**: a base unit (4 or 8), a radius scale that encodes hierarchy
  (containers larger than controls, or all square), a shadow policy (none, one, or
  layered for one element only).
- **Layout**: a one-sentence concept and an ASCII wireframe. State alignment (left,
  centred, justified) and why.
- **Motion budget**: the one orchestrated moment; everything else reacts to input.
- **Sources**: foundation, specialists, the one designed component per page, icon
  family, font source.
- **Principles**: two or three sentences on what makes this page not interchangeable.

### 3. Check the plan against the brief
Ask: if I were given a similar prompt for a different product, would I produce this?
If yes for any line, it is a default. Revise it and note what changed and why.

### 4. Build from libraries
Install the components (see `registry-setup.md`), compose them, theme them through
tokens. Mind CSS specificity: section-level and element-level selectors that cancel each
other are a common source of broken spacing.

### 5. Critique
- Spend boldness in one place. Let one element be memorable; keep the rest quiet.
- Quality floor without announcing it: responsive to 360 px, visible focus rings,
  `prefers-reduced-motion`, 4.5:1 text contrast, touch targets 44 px, no horizontal
  scroll.
- Screenshot and look. Remove one accessory before leaving.
- Re-read the copy as the user, not as the system.

## Writing in interfaces
- Words exist to make the interface easier to understand. They are content, not decoration.
- Name things the way users think, not the way the system is built ("Notifications", not "Webhook config").
- Active voice. A button says what happens: "Save changes", "Publish", "Delete 3 files". The same action keeps the same name across the flow and its confirmation ("Publish" → "Published").
- Errors say what went wrong and how to fix it, in the product's voice, without apologising.
- Empty states invite the first action.
- Sentence case, plain verbs, no filler, tone matched to the audience.

## Prompting people and models
When the user asks for "modern, clean, professional", convert it before building:
- Ask for or propose a reference: a product, a screen, a style to echo.
- Pin the system: accent and its role, type scale, spacing unit, light or dark.
- Name the component libraries so nothing gets hand-built.
- A short avoid-list does more than a long list of positives.
- Iterate on sections, not whole screens.
