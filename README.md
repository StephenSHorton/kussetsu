# Kussetsu

**R3F for 2D UI.** Author your interface in **plain React**, and a custom renderer
paints **every pixel on the GPU** (WebGPU / WGSL). The DOM survives only as an
**invisible, weightless layer for accessibility and input** — nothing you see is a
DOM node. The cards, the text, the refractive glass, the focus ring are all WGSL
output on a single `<canvas>`.

Because Kussetsu owns the framebuffer, it can do things CSS has no syntax for —
live refractive glass over *any* content, GPU material shaders, spring physics —
while a screen reader still reads a real `<h1>` / `<p>` / `<button>` and keyboard
focus just works.

**Live demo:** https://stephenshorton.github.io/kussetsu/

> Kussetsu began as a DOM-based "glass as paint" component library. That approach hit
> a hard wall — the browser compositor won't refract live pixels behind arbitrary /
> portaled DOM. **Kussetsu is now the GPU renderer:** we own the framebuffer, so the
> glass-anywhere problem (and a lot more) simply dissolves.

## Install

```
npm i kussetsu
```

`react` (>=18.2) is a peer dependency. You need a **WebGPU-capable browser**
(Chrome 113+, Edge 113+, Safari 18+, recent Firefox).

## Quick start

You write ordinary React. The only new vocabulary is two host elements —
`<view>` (a box) and `<text>` (a string) — plus a GPU root to mount onto.

```tsx
import { createGpuRoot } from "kussetsu";

function App() {
  return (
    <view glass={{ refraction: 0.1, dispersion: 0.07 }}
      style={{ padding: 28, radius: 22, gap: 10 }}>
      <text style={{ fontWeight: 800 }}>Hello, light.</text>
    </view>
  );
}

const canvas = document.querySelector("canvas")!; // must sit in a positioned parent
const root = await createGpuRoot(canvas);
root.render(<App />);
```

That's the whole API surface to get pixels on screen: `createGpuRoot(canvas, opts?)`
returns a `GpuRoot` with `render()`, `frame()`, `requestRender()`, and `destroy()`.
Importing `kussetsu` also pulls in the global JSX typings for `<view>` / `<text>`.

The `<canvas>` must live inside a **positioned parent** — Kussetsu lays the
invisible accessibility/input overlay directly over the canvas.

### Options

`createGpuRoot(canvas, opts)` takes a few flags:

- `camera` (default `true`) — pan by dragging empty space, zoom on the wheel.
  Pass `camera: false` for a fixed page.
- `pageScroll` (default `false`) — the wheel scrolls the whole page vertically.
- `textSelectable` (default `false`) — all text is drag-selectable + copyable.
- `background` — a full-screen WGSL background shader (`fn material(uv, px) -> vec4f`)
  rendered into the backdrop, so glass refracts it.

Also exported: `useSpring` (interruptible spring-physics animation), and the live
`glassTuning` object (`glassTuning.params` + `glassTuning.enabled` to override every
glass panel at once, with `GLASS_DEFAULTS` as the reset baseline).

## How it works

```
React (<view>/<text>)                    authored as ordinary components
   │
   ▼
react-reconciler (custom HostConfig)     src/core/hostConfig.ts
   │  builds a plain-JS scene tree        src/core/scene.ts
   ▼
layout — Yoga (Facebook's flexbox, WASM) src/core/yogaLayout.ts
   │  annotates x/y/w/h                    (src/core/layout.ts: measureText)
   ├──────► WebGPU painter (two passes)    src/core/webgpu.ts
   │          1) non-glass content → offscreen BACKDROP texture
   │             • instanced rounded-rect SDF pipeline (1 draw call)
   │             • text via a packed glyph atlas (instanced per-glyph quads)
   │          2) blit backdrop → canvas, then GLASS panels that SAMPLE the
   │             backdrop with refraction / dispersion / frost / rim
   │             (ping-pong, so glass-over-glass composites correctly)
   │          • GPU-painted focus ring; material + particle/post passes
   └──────► invisible semantics overlay    src/core/a11y.ts
              • one transparent <button>/<h1>/<p> proxy per node
              • correct roles / aria / tabindex, pooled + diffed
              • forwards pointer + keyboard → onActivate, drives the focus ring
```

Round-trip: **click the invisible proxy → `onActivate` → React `setState` →
reconciler commit → marks dirty → rAF re-layouts → GPU repaints.**

The published library is self-contained under `src/core/`. `src/examples/` is the
demo / dev site, and `src/compat/` is the build-time migration on-ramp (below).

## kussetsu/compat — migrating an existing app

`src/compat/` is a **build-time** on-ramp: it tag-aliases an existing React app's
HTML (`div`→`view`, `p`/`h*`/`span`→`text`, `button`→`view`+role, text input→editable),
maps inline `style` and a bounded Tailwind subset onto Kussetsu's `Style`, and — for
everything it can't paint (icons/images, shadows/borders, gradients, grid, hover/
responsive variants, transforms, portals) — **fails loud at build time with a
file:line**, not a blank box you ship. It's a head start for the supported subset,
not "your app just works." See `src/compat/COVERAGE.md` and `src/compat/DESIGN.md`.
(It runs in-repo today; it isn't published as a `kussetsu/compat` subpath yet.)

## Develop

```
npm install
npm run dev          # http://localhost:5280  (default = the marketing site)
```

Pick a demo by query param:

| Route        | What                                                   |
|--------------|--------------------------------------------------------|
| `/`          | Marketing site + the capability demos + a live glass-tuning panel |
| `?kitchen`   | Kitchen-sink demo                                      |
| `?stress`    | 10,000-node graph (~3 ms/frame, ~180 nodes labelled + screen-reader accessible; DOM holds ~181 elements, not 10k) |
| `?compat`    | The HTML/Tailwind migration on-ramp                    |
| `?menu`      | The ⌘K glass command palette over a live feed          |
| `?fx`        | Material-shader gallery                                |
| `?spring`    | Spring-physics morph demo                              |
| `?showcase`  | The old tabbed showcase (incl. the glass chat app)     |

## Build

```
npm run build        # the GitHub Pages site (base /kussetsu/)  → dist-site/
npm run build:lib    # the publishable package (ESM + .d.ts)    → dist/
node test/compat.test.mjs   # deterministic compat-mapper tests
```

`prepublishOnly` runs `build:lib`, so `npm publish` always ships the freshly-built
library.

## Status — honest

Kussetsu is **early** (`0.1.x`, not yet published to npm at the time of writing).
It is a real renderer with a real published-library shape, not a finished framework.
Known caveats:

- **WebGPU-only.** No software/WebGL fallback — unsupported browsers see nothing.
- **Type-checking is loose.** The build emits declarations with `skipLibCheck`
  (the react-reconciler typings aren't fully validated), and `<view>`/`<text>`
  deliberately shadow SVG's intrinsic elements — so consumers should keep
  `skipLibCheck: true` (the default in Vite / Next / CRA).
- **Text is browser-shaped.** LTR only — bidi / complex-script (RTL, Arabic, Indic)
  caret + selection is out of scope, and the glyph atlas softens past its base size
  (no MSDF yet, so it isn't crisp at *arbitrary* zoom).
- A thousand CSS edge cases are intentionally unsupported; `kussetsu/compat` refuses
  them loudly rather than approximating.

## License

Being finalized — a `LICENSE` file will land before the first npm publish.
