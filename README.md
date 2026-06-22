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

`react` **18** (`>=18.2`, not yet 19) is a peer dependency. You need a
**WebGPU-capable browser** (Chrome 113+, Edge 113+, Safari 18+, recent Firefox).

## Quick start

You write ordinary React. The only new vocabulary is two components —
`<View>` (a box) and `<Text>` (a string) — plus a GPU root to mount onto.

First, the page. The `<canvas>` needs a **non-zero CSS size** inside a
**positioned parent** — Kussetsu sizes the framebuffer from the canvas's CSS box and
lays the invisible accessibility/input overlay directly over it. Don't set the canvas
`width`/`height` HTML attributes; Kussetsu owns the framebuffer size + devicePixelRatio.

```html
<div id="stage">
  <canvas id="app"></canvas>
</div>

<style>
  #stage { position: relative; width: 100vw; height: 100vh; }
  #app   { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
```

Then the React:

```tsx
import { createGpuRoot, View, Text } from "kussetsu";

function App() {
  return (
    <View glass={{ refraction: 0.1, dispersion: 0.07 }}
      style={{ padding: 28, radius: 22, gap: 10 }}>
      <Text style={{ fontWeight: 800 }}>Hello, light.</Text>
    </View>
  );
}

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
  try {
    const root = await createGpuRoot(canvas);
    root.render(<App />);
  } catch (err) {
    // No WebGPU (Firefox without the flag, old Safari, headless CI) => createGpuRoot
    // REJECTS. There's no automatic fallback — render your own HTML instead.
    canvas.insertAdjacentHTML("afterend", "<p>This app needs a WebGPU-capable browser.</p>");
    console.error(err);
  }
}
boot();
```

That's the whole API surface to get pixels on screen: `createGpuRoot(canvas, opts?)`
returns a `GpuRoot` with `render()`, `frame()`, `requestRender()`, and `destroy()`.
`<View>` / `<Text>` are fully typed — `style`, `glass`, `onActivate`, and friends all
autocomplete and type-check.

> The mount is wrapped in `boot()` rather than a bare top-level `await` so it compiles
> on every toolchain (CRA/Jest/older targets don't allow top-level `await`). In a React
> app, run the same `createGpuRoot` → `render` → `destroy` cycle from a `useEffect`.

### Options

`createGpuRoot(canvas, opts)` takes a few flags:

- `camera` (default `true`) — pan by dragging empty space, zoom on the wheel.
  Pass `camera: false` for a fixed page.
- `pageScroll` (default `false`) — the wheel **or a one-finger drag** scrolls the whole
  page vertically (with inertia), so it works on touch as well as desktop.
- `textSelectable` (default `false`) — all text is drag-selectable + copyable.
- `background` — a full-screen WGSL background shader (`fn material(uv, px) -> vec4f`)
  rendered into the backdrop, so glass refracts it.

Any node with `overflow: "scroll"` is a scroll region: it's wheel- **and** drag/touch-scrollable
with inertia. The canvas sets `touch-action: none` so Kussetsu owns the gesture on touch devices.

Also exported: `rgba("#5C5CFF", alpha?)` (turn a hex / `rgb()` / named color into a
Style-ready `RGBA` tuple — colors are `[r, g, b, a]` 0..1, so this saves the by-hand
math), `useSpring` (interruptible spring-physics animation), and the live `glassTuning`
object (`glassTuning.params` + `glassTuning.enabled` to override every glass panel at
once, with `GLASS_DEFAULTS` as the reset baseline).

## How it works

```
React (<View>/<Text>)                    authored as ordinary components
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

Kussetsu is **early** — `0.1.x`, published on npm (`npm i kussetsu`). It is a real
renderer with a real published-library shape, not a finished framework. Known caveats:

- **WebGPU-only.** No software/WebGL fallback. On an unsupported browser
  `createGpuRoot` **rejects** (it does *not* silently no-op) — `await` it in a
  `try/catch` and render your own HTML fallback (see [Quick start](#quick-start)).
- **ESM-only.** No CommonJS build — use a modern ESM bundler (Vite / Next / etc.).
- **React 18 only.** The reconciler is 18-era; the peer range is `^18.2.0` (no 19 yet).
- **Use the `<View>` / `<Text>` components, not lowercase intrinsics.** `@types/react`
  already claims `view` and `text` for SVG in `JSX.IntrinsicElements`, and a JSX
  augmentation can only *merge* with that (intersecting Kussetsu's `style: Style` with
  SVG's `CSSProperties`), so lowercase `<view>` / `<text>` don't type-check. The exported
  `<View>` / `<Text>` components sidestep the collision and are fully typed — prefer them.
  (The lowercase host elements still work at runtime as an untyped escape hatch.) The
  build also emits declarations with `skipLibCheck` because the react-reconciler typings
  aren't fully validated — keep `skipLibCheck: true` (the Vite / Next / CRA default).
- **Text is browser-shaped.** LTR only — bidi / complex-script (RTL, Arabic, Indic)
  caret + selection is out of scope, and the glyph atlas softens past its base size
  (no MSDF yet, so it isn't crisp at *arbitrary* zoom).
- A thousand CSS edge cases are intentionally unsupported; `kussetsu/compat` refuses
  them loudly rather than approximating.

## License

[MIT](./LICENSE) © Stephen Horton
