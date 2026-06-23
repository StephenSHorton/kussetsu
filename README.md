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

`react` **19** (`>=19.2`) is a peer dependency. You need a
**WebGPU-capable browser** (Chrome 113+, Edge 113+, Safari 18+, recent Firefox).

## Quick start

You write ordinary React. The only new vocabulary is two components — `<View>` (a box)
and `<Text>` (a string) — mounted with `<GpuCanvas>`.

```tsx
import { GpuCanvas, View, Text } from "kussetsu";

export default function App() {
  return (
    <GpuCanvas
      style={{ width: "100vw", height: "100vh" }}
      fallback={<p>This app needs a WebGPU-capable browser.</p>}
    >
      <View glass={{ refraction: 0.1, dispersion: 0.07 }}
        style={{ padding: 28, radius: 22, gap: 10 }}>
        <Text style={{ fontWeight: 800 }}>Hello, light.</Text>
      </View>
    </GpuCanvas>
  );
}
```

`<GpuCanvas>` creates its own correctly-sized, positioned `<canvas>`, spins up the GPU
root, paints your `<View>`/`<Text>` tree into it, re-renders on updates, and tears it all
down on unmount (StrictMode-safe). On a browser without WebGPU it renders `fallback`
instead. `<View>` / `<Text>` are fully typed — `style`, `glass`, `onActivate`, and friends
all autocomplete and type-check.

> **React / Next.** `<GpuCanvas>` is a client component. In the Next.js App Router, put
> `"use client"` at the top of the file that renders it (as with any interactive
> component). It sizes itself to its wrapper — give the wrapper a size via `style` /
> `className`, or let it fill a sized parent (`width`/`height` default to `100%`).

### Mounting it yourself (vanilla / non-React)

`createGpuRoot` is the lower-level escape hatch `<GpuCanvas>` is built on — use it for a
non-React entry point or full control. You supply the `<canvas>`: it needs a **non-zero
CSS size** inside a **positioned parent** (Kussetsu sizes the framebuffer from the canvas's
CSS box and lays the invisible a11y/input overlay over it; don't set the canvas
`width`/`height` attributes — Kussetsu owns the framebuffer size + devicePixelRatio).

```html
<div id="stage">
  <canvas id="app"></canvas>
</div>

<style>
  #stage { position: relative; width: 100vw; height: 100vh; }
  #app   { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
```

```tsx
import { createGpuRoot, View, Text } from "kussetsu";

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
  try {
    const root = await createGpuRoot(canvas); // { render, frame, requestRender, getCamera, setCamera, hitTest, … }
    root.render(<View style={{ padding: 28 }}><Text>Hello, light.</Text></View>);
  } catch (err) {
    // No WebGPU (Firefox without the flag, old Safari, headless CI) => createGpuRoot
    // REJECTS. There's no automatic fallback — render your own HTML instead.
    canvas.insertAdjacentHTML("afterend", "<p>This app needs a WebGPU-capable browser.</p>");
    console.error(err);
  }
}
boot(); // wrapped (not bare top-level await) so it compiles on every toolchain
```

### Options

`createGpuRoot(canvas, opts)` (and the matching `<GpuCanvas>` props) take a few flags:

- `camera` (default `true`) — pan by dragging empty space, zoom on the wheel.
  Pass `camera: false` for a fixed page.
- `pageScroll` (default `false`) — the wheel **or a one-finger drag** scrolls the whole
  page vertically (with inertia), so it works on touch as well as desktop.
- `textSelectable` (default `false`) — all text is drag-selectable + copyable.
- `background` — a full-screen WGSL background shader (`fn material(uv, px) -> vec4f`)
  rendered into the backdrop, so glass refracts it.
- `onDeviceLost(info)` — the WebGPU device was lost (GPU crash/reset, sleep/wake, TDR).
  Kussetsu stops the render loop so it never paints a dead device; there's **no
  auto-recovery**, so prompt a reload. (`<GpuCanvas>` also shows its `fallback`.)
- `onError(error)` — an uncaptured GPU error (validation / out-of-memory). Advisory.
- `debug` (default `false`) — show a small corner perf overlay (fps · frame-ms · draw counts).
  A single opaque canvas hides DevTools' element/perf panels; this puts a readout back.

Resizing is automatic: Kussetsu watches the canvas with a `ResizeObserver` (so a canvas
in a resizable panel / collapsing sidebar repaints at the new size), plus the window
`resize` event for viewport / DPR / zoom changes.

Any node with `overflow: "scroll"` is a scroll region: it's wheel- **and** drag/touch-scrollable
with inertia. The canvas sets `touch-action: none` so Kussetsu owns the gesture on touch devices.

### Interactivity & imperative control

Nodes take `onActivate(e)` (click / Enter / Space — `e` carries the `button` + `metaKey` /
`shiftKey` / … modifiers), `onPointerEnter` / `onPointerLeave` (hover), `onDrag`, and
`editable` + `value` + `onChange` for text fields. A node with any of these is interactive
(its box captures pointer events). For layout, `padding` and `margin` both have per-side
variants (`paddingX`/`paddingY`/`paddingTop`/`…`/`paddingLeft`, and `marginX`/`marginY`/
`marginTop`/`…`/`marginLeft` — `margin` is space *outside* the box, flowing siblings apart)
and `gap` has `rowGap` / `columnGap`. Sizes (`width` / `height` / `minWidth` / `maxWidth` /
`minHeight` / `maxHeight` / `basis`) take **px** (`200`) or a **percentage of the parent**
(`"50%"`); `width` also takes `"stretch"` to fill the parent's *cross* axis (not `width:100%`
— for a proportional main-axis size use `grow` / `basis`). For a box edge, `border` (px width)
+ `borderColor` (RGBA) draw a hairline/outline that follows the `radius` / `cornerSmoothing`
corners and works with or without a `background`. `boxShadow` (`{ x?, y?, blur?, spread?, color? }`)
paints a soft drop shadow behind the box — one analytic gaussian-blurred rounded rect on the GPU,
no blur pass (CSS `box-shadow`, outer only).

The `GpuRoot` exposes imperative escapes too: `getCamera()` / `setCamera({ tx?, ty?, scale? })`
/ `resetCamera()` to drive pan-zoom, `hitTest(x, y)` (the node id at a canvas point),
`resize()`, and `getCanvas()`.

Also exported: `rgba("#5C5CFF", alpha?)` (turn a hex / `rgb()` / named color into a
Style-ready `RGBA` tuple — colors are `[r, g, b, a]` 0..1, so this saves the by-hand math).

**Dialing every glass panel at once:** `root.setGlassOverride(params | null)` (also
`useGpuRoot().setGlassOverride`) overrides every glass panel in **that root** with one shared
param set (partial — merged over `GLASS_DEFAULTS`); `null` clears it. There's also a *process-wide*
`glassTuning` global (`glassTuning.enabled` + `.params`) used by the dev slider panel — it overrides
**every** mounted root and mutates outside React, so prefer the root-scoped `setGlassOverride`.

### Hooks

Inside a Kussetsu tree (rendered via `createGpuRoot` / `<GpuCanvas>`):

- **`useFrame((dt) => …)`** — run a callback every animation frame (`dt` = seconds since the
  last frame). The loop runs continuously while any `useFrame` is mounted, so it drives
  animation. Prefer imperative updates inside it (e.g. `useGpuRoot().setCamera(...)`).
- **`useViewport()`** → `{ width, height }` in CSS px; re-renders the component on resize.
- **`useGpuRoot()`** → the imperative `GpuRoot` (`getCamera` / `setCamera` / `hitTest` / …).
- **`useSpring(target, config?)`** — interruptible spring-physics animation of a number, or a
  vector / `RGBA` color (each component springs independently, shared config) — change the target
  mid-flight and it carries momentum, which CSS transitions can't: `useSpring(rgba("#5C5CFF"))`.

```tsx
import { useFrame, useGpuRoot, View } from "kussetsu";

function Spinner() {
  const root = useGpuRoot();
  useFrame((dt) => root.setCamera({ scale: 1 + 0.1 * Math.sin(performance.now() / 500) }));
  return <View glass={{ refraction: 0.1 }} style={{ width: 120, height: 120, radius: 18 }} />;
}
```

### GPU effects: glass, shaders, particles

These are the "things CSS has no syntax for" props — pass them to any `<View>`:

- **`glass`** — paint the node as refractive glass that samples the live backdrop
  (`refraction` / `blur` / `tint` / `dispersion` / …). Overlap two and the top refracts
  the bottom.
- **`material`** — fill the node with a **custom WGSL fragment shader**. Your string must
  define `fn material(uv: vec2f, px: vec2f) -> vec4f`; in scope you get `u` (`u.res.w` =
  time, `u.res.xy` = viewport, `u.ptr` = pointer, `u.c0..u.c3` = your `uniforms`) and the
  helpers `noise2` / `fbm` / `hsv2rgb` / `sampleBackdrop`. `uniforms` is up to 16 floats
  packed into `u.c0..u.c3` (so index 5 is `u.c1.y`); pass `() => number[]` for live values.
  A compile error logs to the console with the line mapped back to **your** source.

  ```tsx
  <View material={{
    shader: `fn material(uv: vec2f, px: vec2f) -> vec4f {
      let t = u.res.w;                      // seconds
      return vec4f(hsv2rgb(vec3f(fbm(uv*4.0 + t*0.1), 0.6, 1.0)), 1.0);
    }`,
    animated: true,                          // request a continuous repaint loop
  }} style={{ width: 240, height: 160, radius: 16 }} />
  ```

- **`particles`** — emit an instanced, pointer-reactive particle field over the box
  (`count` / `color` / `gravity` / `speed` / …; see `ParticleSpec`).
- **`postProcess: "bloom"`** — apply a full-screen post effect masked to the node's box.

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

**How to use it today:** it's an **in-repo recipe**, not yet a published import — clone the repo
and run the `?compat` demo, or vendor `src/compat/` into your app and wire the Vite plugin in
your `vite.config.ts` (it runs an `enforce: 'pre'` pass, so place it **before** `react()`):

```ts
import { kussetsuCompatVite } from "./compat"; // vendored from src/compat/
plugins: [kussetsuCompatVite(), react()];
```

Shipping it as an installable `kussetsu/compat` subpath (a Node plugin entry + a separate
browser runtime resolver, with `@babel/core` as a peer dep) is tracked as a future enhancement.

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
- **React 19 only.** The custom reconciler is built on `react-reconciler@0.33` (React 19.2),
  so the peer range is `^19.2.0`. React 18 is no longer supported (the 0.29-era HostConfig it
  required is incompatible with the React-19 contract). Pin to `kussetsu@0.2.x` if you need React 18.
- **Suspense / `<Activity>` is supported.** A `<Suspense>` boundary flipping to its fallback
  hides the suspended subtree across the whole pipeline — it paints nothing, takes no layout
  space (the fallback flows normally), and receives no input — then fully reappears on resolve.
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
