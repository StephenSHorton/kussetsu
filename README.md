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
- Accessibility is **not** sacrificed: a screen reader reads a real `<h1>`,
  two `<p>`s, and a labeled `<button>`; keyboard focus works; the focus ring is
  GPU-painted (the bit Zed's GPUI deferred and Flutter Web shipped).
- The whole thing is ~600 lines and runs in current Chrome.

## What it deliberately does NOT (yet) solve
Text shaping/IME/i18n, scrolling + clipping, a real layout engine (Yoga/Taffy),
text selection, hit-testing for non-semantic regions, and a thousand edge cases.
This is a feasibility spike, not a framework.

## Run
```
npm install
npm run dev   # http://localhost:5280
```
Requires a WebGPU-capable browser (Chrome 113+, Safari 18+, Firefox recent).
