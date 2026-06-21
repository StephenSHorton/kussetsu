# kussetsu/compat — coverage map

> What an existing React app's HTML/CSS/Tailwind maps onto **today**, and what is a
> renderer feature in disguise. The on-ramp is honest by construction: anything not in
> the "supported" column is a **build-time error with a file:line**, never a silent drop.
>
> The limiter is the **paint surface**, not the parser. The renderer draws exactly three
> things — a rounded-rect (one radius, solid fill, rect clip), atlas glyphs (system-ui,
> one tint), and refractive glass — and lays out with Yoga flexbox over the wired `Style`
> fields. Every "no target" below is a real paint/layout feature to build, and as those
> ship, coverage widens for free. (This table reflects what the code in this folder
> actually does; it was cross-checked against the renderer source, not assumed.)

## CSS properties

### ✅ Supported (maps to a wired field + paints today)
| CSS | → Style | notes |
|---|---|---|
| `display:flex` | `direction:'row'` | **emits row** — CSS flex defaults row, kussetsu defaults column |
| `display:block` | (default column container) | every `<view>` is already a flex column |
| `flex-direction` | `direction` | `row`/`column`; `*-reverse` → fails |
| `flex-wrap:wrap` | `wrap:true` | |
| `flex-grow` / `flex-shrink` | `grow` / `shrink` | |
| `flex:N` | `grow:N, shrink:1` | basis approximated to content (no `flex-basis`); a non-`0`/`auto` basis fails — items grow-from-content, not equal-size |
| `justify-content` | `justify` | `start`/`center`/`end`; `space-*` → fails |
| `align-items` | `align` | `start`/`center`/`end`; `stretch`/`baseline` → fails |
| `align-self:stretch` | `width:'stretch'` | the only per-child align that's wired |
| `gap` | `gap` | one value, both axes |
| `width` (px/rem) | `width` | |
| `width:100%` | `width:'stretch'` | ⚠ fills the **cross axis** — correct in column containers |
| `height` (px/rem) | `height` | no percent/auto-stretch height |
| `min-width` / `max-width` | `minWidth` / `maxWidth` | |
| `padding` (single / symmetric) | `padding` | |
| `position:absolute` + `top`/`left` | `absolute:{x,y}` | ⚠ parent-relative (like CSS); `right`/`bottom`/`inset` → fail |
| `overflow:hidden\|scroll\|auto` | `overflow` | ⚠ clips **both** axes; scroll is **vertical-only** |
| `background`/`background-color` (solid) | `background` (RGBA) | named/#hex/rgb()/rgba() |
| `border-radius` (uniform) | `radius` | per-corner → fails |
| `color` | `color` | |
| `font-size` | `fontSize` | |
| `font-weight` | `fontWeight` | `normal`/`bold`/numeric |
| `font-family` (system/sans stack) | (ignored — already system-ui) | a named family (Inter, serif…) → fails |
| `box-sizing`, `cursor`, `user-select` | (ignored — no paint/layout footprint) | `pointer-events:none` → **fails loud** (interactivity is set by role, not CSS) |

### 🚫 Fails loud — a renderer/layout feature in disguise
| CSS | why there's no target |
|---|---|
| `margin` (any side) | **not wired in Yoga at all** — convert vertical rhythm to a parent `gap` |
| `padding-*` (per-side / asymmetric) | only a single all-sides padding is wired |
| `min-height` / `max-height` / `aspect-ratio` | not wired to layout |
| `flex-basis`, `order`, `align-content` | not wired |
| `gap` with differing row/column | one gap for both axes |
| `display:grid` / `inline*` / `none` | no grid/inline layout; no visibility flag (render conditionally in React) |
| `position:relative`(offsets)/`fixed`/`sticky`, `z-index` | no stacking context — paint order is tree order |
| `box-shadow` | no shadow pass |
| `border` / `border-*` / `outline` / `ring` | **no stroke primitive** |
| `background:linear-gradient()` / `url()` / `background-image` | no gradient/texture pipeline |
| `opacity` | refused entirely — no per-node alpha multiply at all (fold alpha into `background`/`color`) |
| `gap-x`/`gap-y` (single-axis), differing row/column gap | only a single both-axes `gap` is wired |
| `text-transform` (uppercase/…) | the text path applies no case transform |
| `transform` / `rotate`/`scale`/`skew` | camera is whole-scene translate+scale only |
| `filter` / `backdrop-filter` | no filter pass — *real blur is the `glass={{blur}}` prop* |
| `transition` / `animation` / `@keyframes` | no animator — drive animation from React state |
| `line-height`, `letter-spacing`, `text-align`, `text-decoration`, `font-style:italic`, `text-overflow`, `white-space:nowrap` | the glyph atlas has none of these |
| `var(--x)` / `currentColor` / `theme()` / `calc()` | not statically resolvable |

## HTML elements
| element | → | notes |
|---|---|---|
| `div`, `section`, `main`, `article`, `aside`, `header`, `footer`, `nav`, `figure`, `figcaption`, `form`, `ul`, `ol`, `li`, `dl`/`dt`/`dd` | `view` | list/landmark semantics lost unless a role is added; `<form onSubmit>` fails loud |
| `span`, `label`, `small`, `code`, `blockquote` | `text` | |
| `p` | `text` + `role="paragraph"` | |
| `h1`–`h6` | `text` + `role="heading"` + `level` | |
| `strong`, `b` | `text` + `fontWeight:700` | |
| `button` | `view` + `role="button"` | `onClick` → `onActivate` |
| `input` (text-type) | `view` + `editable` | requires `value`+`onChange`; `onChange` gets an event-shaped arg; a `<text>` child renders the value |
| `hr` | `view` + a thin bar | injects `width:'stretch'`+background or it'd be invisible |
| `a` | `text` | **`href` navigation fails loud** (route in React) |
| `em`, `i`, `br` | 🚫 | italic / forced break have no target |
| `img`, `picture`, `svg`, `video`, `canvas`, `iframe` | 🚫 | no texture/SVG pipeline — **icons & images block migration** |
| `table`/`tr`/`td`…, `select`/`option`, `textarea`, `progress`/`meter`, `details`/`summary`, `dialog` | 🚫 | no grid/table layout, no multi-line field, no non-text controls, no stacking/portal |

A `<text>` host holds **plain strings only**. `<p>a <strong>b</strong></p>` (inline rich
text) fails loud — there are no inline style runs yet. A `<view>` never paints bare
strings, so textual children are auto-lifted into a `<text>` (`<div>Hi {name}</div>` works).

## Tailwind subset
Supported families map to the CSS above and run through the **same** rules:
`flex`/`inline-flex`/`flex-row`/`flex-col`/`items-*`/`justify-*`/`flex-wrap`/`grow`/`shrink`/`self-stretch` ·
`p-{n}`/`gap-{n}` · `w-{n}`/`h-{n}`/`w-full`/`min-w-*`/`max-w-*` · `rounded*` ·
`bg-{color}`/`text-{color}` (curated palette + `bg-[#hex]`) · `text-{size}` ·
`font-{weight}` (`font-sans` ignored) · `overflow-{hidden|auto|scroll}` ·
`absolute`+`top-{n}`/`left-{n}` · arbitrary values `w-[37px]`, `p-[10px]`, `text-[#fff]`.

Fail loud: `m-*`/`space-*` (margins) · `px-/py-` asymmetric · `gap-x-*`/`gap-y-*` (single-axis)
· `shadow-*` · `border-*`/`ring-*` · `bg-gradient-*` · `opacity-*` · `rotate-*`/`scale-*` ·
`blur-*`/`backdrop-*` (use glass) · `transition-*`/`animate-*` · `grid*` · `sticky`/`fixed`/`z-*`
· `leading-*` · `tracking-*` · `text-center`/`italic`/`underline`/`truncate`/`uppercase` ·
`min-h-*`/`max-h-*` · any unknown utility.

### Variants must fail loud
`hover:` `focus:` `active:` `group-*` `peer-*` `md:` `lg:` `dark:` `first:` `[&>*]:` — there
is no cascade/event/media layer, and emitting just the base value ("renders but never
changes on hover") is the trust-trap. Per **token**: `p-2` compiles, `hover:p-4` fails, in
the same `className`. The error names the React-side fix (state+`onActivate` for hover,
a resize hook for responsive, theme context for `dark:`).

## The honest migration ceiling
For a typical Tailwind app, **~15–35% of components migrate clean** — and only specific
kinds: presentational layout (`div`/`span`/`p`/`h*` + `button` + text fields) styled with
the flex/padding/gap/size/color/radius/solid-bg subset. **What does not come:** anything
with icons or images (near-universal blocker), margins/grid/responsive, shadows/borders/
gradients (cosmetic but pervasive — the result *looks* broken even when it "works"),
hover/focus feedback, animations, portals/modals, and any third-party component that
measures the DOM (Radix/Headless/MUI/Floating UI, charts, virtualized lists — a `ref` to a
`<view>` is a scene node, not an `HTMLElement`). The layout **skeleton** ports; the chrome,
interactivity, and iconography are rewritten against kussetsu's own vocabulary — which is
where glass and own-the-pixels live. Think **per-leaf-component**, not per-app.
