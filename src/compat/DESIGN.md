# kussetsu/compat — design & rationale

A **build-time migration on-ramp**: point the build at an existing React app and it
tag-aliases the HTML (`div→view`, `p`/`h*`/`span→text`, `button→view+role`, text
`input→editable`) and maps inline `style` + a bounded Tailwind subset onto kussetsu's
`Style` — refusing, at build time with a `file:line`, everything it can't paint. It
**coexists** with hand-authored `<view>`/`<text>` + custom props (`glass`, …) in the same
tree, so you migrate the layout skeleton and then reach for the owned vocabulary where the
payoff is. See `COVERAGE.md` for the map; this doc is the *why*.

## The one non-negotiable: fail loud
"Mostly works" is the trap that killed react-canvas. So every unsupported input is a
**build error you read**, not a blank box you ship. `box-shadow`, `m-4`, `<img>`, `hover:`,
a dynamic `style={expr}` — each throws a code-framed `kussetsu/compat: … — file:L:C`. The
product *is* the error: it converts an unknowable "mostly works" into a finite punch list
of exactly which components ported and which you must rewrite. Position it as **"a head
start for the supported subset,"** never "your app just works."

## Architecture — and a toolchain correction
The original plan was to ride `@vitejs/plugin-react`'s Babel pass for free. **That doesn't
apply here:** this repo is vite 8 (rolldown) + `@vitejs/plugin-react` 6, which lower JSX
with **OXC, not Babel** — Babel is only an opt-in peer (React Compiler). So compat runs its
**own** small Babel pass as a standalone `enforce:'pre'` Vite plugin (`vite.ts`), ahead of
the React transform. It brings its own `@babel/core` (a devDependency), which makes the
on-ramp independent of how the host lowers JSX. Trade-off: a parse+generate of migrated
files (we skip files with no lowercase-HTML JSX). The transform itself is a `@babel/core`
JSX visitor (`babel.ts`); all the CSS/Tailwind/tag knowledge lives in **pure,
framework-agnostic modules** (`parse.ts`/`style.ts`/`tailwind.ts`/`tags.ts`) so an OXC or
SWC front-end could reuse them unchanged.

```
your .tsx (div/className/style)
  └─ kussetsu/compat (enforce:'pre', own @babel/core pass)   src/compat/vite.ts → babel.ts
       • rename HTML tag → <view>/<text>                      tags.ts
       • className (Tailwind subset) → CSS decls → Style      tailwind.ts → style.ts
       • inline style object → Style                          style.ts (+ parse.ts)
       • validate events, auto-wrap bare text, shim onChange
       • REFUSE the unpaintable (buildCodeFrameError)
  └─ @vitejs/plugin-react (OXC): jsx-runtime lowering + TS strip
  └─ the existing kussetsu reconciler → WebGPU
```

## Decisions worth keeping
- **`className` ships no Tailwind engine.** Each utility is translated to the CSS it
  stands for and routed through the *same* `mapCssDeclarations`, so `shadow-lg` fails with
  the identical message an inline `box-shadow` would. The subset is scoped to the paint
  ceiling — that scoping is the roadmap, not a gap to paper over. Arbitrary values
  (`w-[37px]`, `bg-[#hex]`) are self-describing and supported; unknown palette colors fail
  loud with the `bg-[#hex]` escape.
- **Dynamic values fail loud by default.** `style={expr}`, `className={cn(...)}`, `{...spread}`
  can't be statically validated, and a dynamic class could hide a `box-shadow` we can't
  paint. Default is a build error. An **opt-in runtime resolver** (`runtime.ts`:
  `__kStyle`/`__kClass`) is the documented escape hatch — it reuses the same tables and
  **still throws** on an unsupported property, just at render time. (Wiring the transform
  to emit `__kStyle(expr)` automatically is the next increment; the resolver works today.)
- **Two subtle correctness rules** that came out of adversarially verifying the map against
  the renderer source (without them, things break *silently*):
  - `display:flex` must emit `direction:'row'` — CSS flex defaults row, kussetsu defaults
    column, so a bare `display:flex` would otherwise flip the main axis.
  - A `<view>` never paints raw strings, so `<div>Label</div>` / `<button>Clicked {n}</button>`
    have their textual children auto-lifted into one `<text>` (carrying the text styling).
- **`onChange` is shimmed.** kussetsu's editable calls `onChange(stringValue)`; migrated
  HTML handlers expect an event. The transform wraps the handler so `e.target.value` works.
- **Coexistence is free.** Only the fixed HTML allowlist is touched; `<view>`/`<text>` and
  capitalized components pass through untouched.

## Verification (this is tested, not asserted)
- `test/compat.test.mjs` — 32 cases: 9 transform-correctness + 23 fail-loud-with-location
  (img, box-shadow, margin, dynamic style/className, hover/responsive variants, onMouseEnter,
  onClick-on-div, inline rich text, select/textarea, uncontrolled input, spread, grid,
  asymmetric padding, overflow-x, z-index, a-href, unknown utility). Run: `node test/compat.test.mjs`.
- `npx vite build` is green (the standalone plugin loads through the real rolldown/OXC
  pipeline and doesn't disturb the existing `<view>`/`<text>` examples).
- Fail-loud confirmed end-to-end through Vite (a stray `<img>` aborts the build with the
  message + a caret on the offending line).
- The `?compat` route (`src/examples/compat.tsx`) is a plain HTML/Tailwind card —
  `div`/`h2`/`p`/`input`/`button` — rendered on the GPU beside a hand-authored glass panel.

## Known sharp edges / next increments
- Brings `@babel/core` (devDep). An OXC-native front-end reusing the pure mappers would
  drop it and the double-parse — worth doing if compat graduates from prototype.
- Mixed inline content with bare `{expr}` text in a `<view>` (rare) isn't lifted — only
  pure-textual children are. Inline rich text (`<strong>` inside `<p>`) is refused, not
  flattened (it needs inline style runs).
- `ref` passes through to the scene node; a `ref` expecting an `HTMLElement` API
  (`getBoundingClientRect`, `.focus()`) will misbehave — the honest fix is a throwing Proxy
  ref, listed as a hard limit in `COVERAGE.md`.
- The Tailwind palette is a curated slice; reading `tailwind.config` for custom
  colors/spacing is a clean future add (variants stay out of scope by design).
