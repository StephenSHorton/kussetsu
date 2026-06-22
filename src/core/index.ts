// Kussetsu — public API.
//
// Author UI in plain React with the `<View>` / `<Text>` components, then mount it on a
// GPU root: every pixel is painted on the GPU (WebGPU), and the DOM exists only as an
// invisible accessibility + input layer over the canvas.
//
//   import { createGpuRoot, View, Text } from "kussetsu";
//   const root = await createGpuRoot(canvas, { camera: false });
//   root.render(<View><Text>Hello, light.</Text></View>);

export { createGpuRoot, type GpuRoot, type GpuControls, type GpuRootOptions } from "./runtime";

// Declarative mount: drop `<GpuCanvas>` into a React app and it owns the canvas,
// positioned wrapper, async createGpuRoot, StrictMode-safe teardown, and a WebGPU
// fallback. `createGpuRoot` stays the lower-level escape hatch.
export { GpuCanvas, type GpuCanvasProps } from "./GpuCanvas";

// The typed authoring API. `<View>` (a box) and `<Text>` (a string) are the GPU host
// elements wrapped so they type-check cleanly (the lowercase `<view>`/`<text>` intrinsics
// collide with React's SVG typings — see ./components).
export { View, Text, type ViewProps, type TextProps } from "./components";

// Authoring types (the node props + style).
export type { Style, Size, NodeProps, GlassSpec, MaterialSpec, PostProcess, Role, RGBA, Camera, ActivateEvent } from "./scene";
export type { ParticleSpec } from "./particles";

// Color helper: turn a hex / rgb() / named color into a Style-ready RGBA tuple
// (0..1, straight alpha) — `background: rgba("#5C5CFF")`. Throws on an unparseable color.
export { rgba } from "./color";

// Live glass tuning (advanced): mutate glassTuning.params + flip .enabled to override
// every glass panel at once; GLASS_DEFAULTS is the reset baseline.
export { glassTuning, GLASS_DEFAULTS, type GlassParams } from "./glassTuning";

// Spring-physics animation primitive (interruptible).
export { useSpring, type SpringConfig } from "./useSpring";

// R3F-style hooks for components inside a Kussetsu tree: per-frame work (useFrame), the live
// canvas size (useViewport), and the imperative root / camera (useGpuRoot).
export { useFrame, useViewport, useGpuRoot } from "./hooks";
