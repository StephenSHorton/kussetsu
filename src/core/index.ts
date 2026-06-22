// Kussetsu — public API.
//
// Author UI in plain React with the `<view>` / `<text>` host elements, then mount
// it on a GPU root: every pixel is painted on the GPU (WebGPU), and the DOM exists
// only as an invisible accessibility + input layer over the canvas.
//
//   import { createGpuRoot } from "kussetsu";
//   const root = await createGpuRoot(canvas, { camera: false });
//   root.render(<App />);
//
// Importing this module also brings in the global JSX typings for `<view>`/`<text>`.

export { createGpuRoot, type GpuRoot, type GpuRootOptions } from "./runtime";

// Authoring types (the <view>/<text> props + style). The global JSX declaration
// for the host elements lives in ./scene and is pulled in by these re-exports.
export type { Style, NodeProps, GlassSpec, MaterialSpec, Role, RGBA, Camera } from "./scene";
export type { ParticleSpec } from "./particles";

// Color helper: turn a hex / rgb() / named color into a Style-ready RGBA tuple
// (0..1, straight alpha) — `background: rgba("#5C5CFF")`. Throws on an unparseable color.
export { rgba } from "./color";

// Live glass tuning (advanced): mutate glassTuning.params + flip .enabled to override
// every glass panel at once; GLASS_DEFAULTS is the reset baseline.
export { glassTuning, GLASS_DEFAULTS, type GlassParams } from "./glassTuning";

// Spring-physics animation primitive (interruptible).
export { useSpring, type SpringConfig } from "./useSpring";
