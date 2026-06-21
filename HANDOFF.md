# Kussetsu — session handoff

> Written 2026-06-21 to hand this project to a fresh Claude session. Read this first,
> then `README.md` for the technical loop. The repo dir is still `~/projects/gpu-ui-poc`
> but the project **is Kussetsu** (`package.json` name = `kussetsu`).

---

## What this is (in one breath)

Author UI in **plain React**; a custom renderer paints **every pixel on the GPU**
(WebGPU/WGSL); the DOM exists only as an **invisible accessibility + input layer**
over the canvas. It's "react-three-fiber, but for 2D app UI." It already runs: a
glass chat app, a kitchen-sink demo, and a 10k-node stress demo, all at 60fps.

Run it: dev server is `npm run dev` → **http://localhost:5280**
- `/`        → the glass chat app (default)
- `/?demo`   → kitchen-sink (page-scroll, glass-over-glass, draggable nodes, select/edit)
- `/?stress` → 10,000-node graph (~3ms/frame, 180 labelled + screen-reader-accessible)

---

## THE PRODUCT MODEL — read this before proposing anything

This took a whole strategic conversation to crystallize. Do not re-derive it wrong.

- **Real React, OWN vocabulary.** You use the full React programming model (hooks,
  state, context, components). But the *leaf elements* are **`<view>` / `<text>`**
  with a **`style` object** + custom props (`glass`, `role`, `onActivate`,
  `selectable`, `editable`, `draggable`, …) — **not** `<div>`/`<span>` + className/CSS.
  Exactly like R3F authors with `<mesh>`/`<group>`, not `<div>`.
- **We are NOT reimplementing the browser.** Accepting arbitrary HTML/CSS as input
  and faithfully reproducing the cascade + every property is the graveyard
  (react-canvas 2015). Every *survivor* of this idea — **Flutter, React Native,
  Zed GPUI** — owns the renderer AND defines its own clean vocabulary. That's the
  move that makes it shippable.
- **"Beyond CSS" needs an owned vocabulary, not CSS.** CSS has no syntax for
  refractive glass / dispersion / per-element shaders. So a CSS *input* language
  would cap us at CSS's ceiling — the opposite of the goal. Our `glass={{...}}` prop
  already expresses what CSS never will. The clean vocabulary is the *vehicle* for
  the vision, not a retreat from it.
- **What JS libraries work:** anything that's pure logic (`lodash`, `zod`,
  `date-fns`) or render-agnostic state (`zustand`, `jotai`, TanStack Query). What
  does NOT: anything that emits or measures the DOM (shadcn/Radix/MUI, Floating UI,
  react-aria) — a `ref` to a `<view>` is a scene node, not an `HTMLElement`. (That's
  why we hand-built selection/editing/scrolling/a11y ourselves.)

## THE EXCITING NEW THREAD — a migration on-ramp (`kussetsu/compat`)

The user's idea, and it's a good one *scoped correctly*: a **build-time Vite plugin**
that tag-aliases `div→view`, `span/p/h*→text`, `button→view+role`, `input→editable`,
and maps inline-styles / a Tailwind-subset → our `Style`. So people **migrate** an
existing React app instead of starting from scratch, then reach for custom props
(`glass`, etc.) where they want to go beyond. It **coexists** with the owned
vocabulary in the same tree.

The crucial insight (do not lose this):
- **The limiter is the renderer's PAINT SURFACE, not the parser.** We draw
  rounded-rects + glyphs + glass. So `display:flex`, padding, sizing,
  `position:absolute`, solid background, `border-radius`, color, font-size/weight,
  `overflow` map **today**. But `box-shadow`, gradients, `<img>`/background-image,
  real borders, `transform`, transitions/animation, `filter`, `clip-path`,
  `display:grid`, `position:sticky` have **no GPU target yet** — each is a real
  renderer feature to build. **The on-ramp is a renderer-feature roadmap wearing a
  parser's hat.**
- **Two style sources:** inline-styles + Tailwind utilities are *local* (no cascade)
  → easy to read. Authored `.css` with selectors/`:hover`/media needs a cascade
  engine → that part stays genuinely hard. (Modern Tailwind/CSS-in-JS apps are the
  easy kind.)
- **Discipline:** make unsupported stuff **fail LOUD** at build time
  (`kussetsu: box-shadow has no GPU target yet`), never silently — "mostly works"
  is the trust-trap that kills these. Position it as "a head start for the supported
  subset," NOT "your app just works."
- **Strategy:** build new paint features because the *vision/design* wants them, and
  let migration coverage widen as a free side effect — do NOT let "CSS parity" steer
  the renderer away from the moat (glass / 10k-node scale / shaders).

Not started yet — captured as a scoped roadmap item.

---

## Architecture / where things are

`src/core/` = the publishable renderer · `src/examples/` = demos (not shipped)

- `core/index.ts` — public API: `createGpuRoot` + authoring types + `glassTuning`.
- `core/runtime.ts` — **`createGpuRoot(canvas, {camera, pageScroll}): Promise<GpuRoot>`**.
  Owns painter + React reconciler + rAF loop + a11y overlay + ALL pointer/wheel/
  select/edit input. Creates its own overlay + edit-`<input>` over the canvas.
  Returns `{ render, frame, requestRender, destroy }`.
- `core/hostConfig.ts` — react-reconciler@0.29.2 HostConfig + `createRoot`.
- `core/scene.ts` — node model + `Style`/`NodeProps`/`GlassSpec` + the `<view>`/`<text>`
  JSX declaration.
- `core/webgpu.ts` — `Painter`: instanced rounded-rect SDF, glyph atlas, refractive
  glass (refraction/blur/dispersion/specular/rim/brighten/tint, ping-pong for
  glass-over-glass, a 3rd "foreground" pass so glass-node children render crisp ON
  the glass).
- `core/collect.ts` — walks the laid-out tree → flat draw/semantics lists (camera,
  scroll, clip, selection, foreground, glass).
- `core/a11y.ts` — `SemanticsOverlay`: one invisible focusable DOM proxy per
  interactive/semantic node (screen readers, keyboard, find-in-page, pointer/key drag).
- `core/text.ts` — wrap (Intl.Segmenter) + per-char x (prefix measureText) + hit-test
  + selection geometry. `core/layout.ts` (measureText) · `core/yogaLayout.ts` (Yoga).
- `core/glassTuning.ts` — live glass param store + `GLASS_DEFAULTS` (the override the
  dev panel drives; `collectGlass` reads it).
- `examples/` — `main.tsx` (routing/dev wiring), `ChatApp.tsx`, `App.tsx` (kitchen
  sink), `stress.ts` (10k, drives the painter directly), `devPanel.ts` (the glass
  slider panel — a dev tool, not core).

## Verification gotchas (you WILL hit these)

- **Backgrounded tabs throttle rAF** → FPS reads 0, live interaction doesn't render.
  Use `window.__frame()` (force one synchronous render) and `window.__bench()`
  (stress route, synchronous timing). Interactive bits (click-to-select/edit) need
  `editables`/`selectables` populated by a `renderFrame` first → call `__frame()`
  THEN click. Live wheel/drag/rAF needs a **focused** tab (bring Chrome to front).
- `window.__glass` = the live glass params (e.g. `__glass.params.dispersion = 0.05`).
- Driving the dev panel via screenshot-clicks is finicky (screenshot px ≠ CSS px);
  find the element + `.click()` via JS instead.

---

## Open threads / next steps

1. **Build + publish config** — vite lib-mode build for the package; then `npm publish`.
   DELIBERATELY deferred: gate publishing on a demand signal, per the validation
   verdict (the moat is speed + a11y + glass; glass is the demo hook).
2. **`kussetsu/compat` migration on-ramp** — scoped above. Future, shallow, loud.
3. **A "obviously impossible in CSS" demo** — live refraction over scrolling content
   / a shader-material panel / 10k animated nodes — to make "beyond the browser"
   *visible* instead of a claim. (Strong candidate for the demand-validation artifact.)
4. **Clear out the OLD Kussetsu — by REPLACE, not delete.** The old DOM glass library
   (repo `StephenSHorton/kussetsu`, npm `@kussetsu/core,/react,/svelte @0.1.0`) didn't
   pass the bar. The new renderer **keeps the name, repo, and `@kussetsu` scope** —
   we swap the guts, we do NOT destroy the project. The old local repo
   (`~/projects/kussetsu`) has **UNPUSHED commits** (branch `feat/full-shadcn-catalog`)
   — don't delete it blind. `npm deprecate @kussetsu/*@<=0.1.0` needs the user's npm
   login (`mrhorton15`); hand over the commands, don't run them. (See `[[project_kussetsu]]`.)
5. **Bidi / complex-script text, MSDF** — deferred-forever-ish.

## Discipline notes (from the user, this session)

- Commit/push only when asked; PR is the review checkpoint. Outward-facing /
  irreversible actions (npm, GitHub force-push, deletes) → confirm first.
- Do NOT push business/outward actions onto the user as their to-do.
- The user is sharp and ambitious — match the energy, but give real engineering
  counsel, not hype. The "own renderer + familiar-shaped owned vocabulary" framing
  is the honest north star.

Git: clean at `9e84a54`. ~18 commits, local-only (no GitHub remote on the new repo yet).
