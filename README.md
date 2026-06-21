# gpu-ui-poc — proof of the loop

A brutal little proof that you can author UI in **plain React** while a custom
renderer paints **every pixel on the GPU** (WebGPU/WGSL) and the DOM survives only
as an **invisible, weightless layer for accessibility + input**.

No DOM is used for visuals. The card, text, button, and focus ring you see are all
WGSL output on a single `<canvas>`.

## The loop

```
React (<view>/<text>)
   │  authored as ordinary components
   ▼
react-reconciler (custom HostConfig, mutation mode)   src/hostConfig.ts
   │  builds a plain-JS scene tree (no DOM)            src/scene.ts
   ▼
layout (hand-rolled flexbox; swap in Yoga/Taffy)      src/layout.ts
   │  annotates x/y/w/h
   ├─────────────► WebGPU painter (TWO passes)          src/webgpu.ts
   │                 1) non-glass content → offscreen BACKDROP texture
   │                    • instanced rounded-rect SDF pipeline (1 draw call)
   │                    • text: 2D-canvas → texture → quad
   │                 2) blit backdrop → canvas, then GLASS panels that
   │                    SAMPLE the backdrop with refraction/frost/rim
   │                    → glass refracts anything behind it, anywhere
   │                 • GPU-painted focus ring
   └─────────────► invisible semantics overlay         src/a11y.ts
                     • one transparent <button>/<h1>/<p> proxy per node
                     • correct roles/aria/tabindex, pooled + diffed
                     • forwards pointer/keyboard → onActivate
                     • focusin → FocusBridge → GPU paints the ring
```

Round-trip: **click the invisible proxy → `onActivate` → React `setState` →
reconciler commit → `resetAfterCommit` marks dirty → rAF re-layouts → GPU repaints.**

## What this proves
- React drives a non-DOM GPU renderer (the react-three-fiber trick, for 2D UI).
- **Refractive glass that works *anywhere*.** Because we own the framebuffer, a
  glass panel samples the real backdrop behind it and refracts it — over any
  content, multiple elements at once, with no "capture a region" hack. This is
  the exact effect the browser compositor forbade (the problem that started this).
- **Canvas-native interaction:** drag the glass, pan the graph (drag empty space),
  zoom around the cursor (wheel) — a {tx,ty,scale} camera applied in the collectors,
  with all pointer + keyboard input (including drag) routed through the invisible
  overlay. The wedge gesture (60fps zoom/pan of a node graph) the DOM is bad at.
- Accessibility is **not** sacrificed: a screen reader reads a real `<h1>`,
  two `<p>`s, and a labeled `<button>`; keyboard focus works; the focus ring is
  GPU-painted (the bit Zed's GPUI deferred and Flutter Web shipped).
- The whole thing is ~600 lines and runs in current Chrome.

## Closing the gaps (the spike → framework work)
- **Layout — DONE.** The hand-rolled flexbox is replaced by **Yoga** (Facebook's
  production flexbox, WASM) via `src/yogaLayout.ts`: rebuild a Yoga mirror of the
  scene tree each pass, measure-funcs on text leaves, free recursively. The
  `?react` demo shows real flex-wrap (which the toy couldn't do). `src/layout.ts`
  remains only for `measureText`.
- **Scrolling + clipping — DONE.** `overflow: "scroll" | "hidden"` clips children
  to the container via a **per-instance clip rect in the shaders** (discard outside,
  keeping the single instanced draw); the collectors apply a scroll offset and
  intersect nested clips; the wheel routes to a scroll region under the cursor
  (else zoom). The `?react` demo has a fixed-height list that clips + scrolls.

## What it deliberately does NOT (yet) solve
Text shaping/IME/i18n, scrolling + clipping, glass-over-glass stacking, text
selection, hit-testing for non-semantic regions, and a thousand edge cases.
Still a feasibility spike, not a framework.

## Stress demo (the validation artifact)
The default route is a **10,000-node graph**: every node is a GPU rect (ONE
instanced draw, camera applied in-shader), and labels + DOM accessibility proxies
are **virtualized** to only the on-screen, legible nodes.

Measured (rAF-independent benchmark, `window.__bench()`): **~3 ms/frame at 10k nodes**
with 180 on-screen nodes labelled + screen-reader accessible — ~5× under the 60fps
budget — while the DOM holds **181 elements, not 10,000.** Cmd+F finds any node;
every visible node is focusable; the glass lens is draggable. This is the wedge:
"React Flow, but fast at 10k nodes *and* still accessible" (DOM builders wall at
50–200 nodes).

## Run
```
npm install
npm run dev          # http://localhost:5280  (10k-node stress demo)
# http://localhost:5280/?react   — the React-reconciler / glass demo
```
Requires a WebGPU-capable browser (Chrome 113+, Safari 18+, Firefox recent).
