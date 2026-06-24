// Live-tunable glass parameters (the dev slider panel uses this). When `enabled`, these override
// every glass panel's per-node spec so you can dial the whole look at once.
//
// NOTE: this is a PROCESS-WIDE mutable global — it overrides EVERY mounted root, mutates outside
// React's data flow (toggling it from a component won't auto-repaint), and persists across tests.
// Prefer the root-scoped `root.setGlassOverride(params)` (also `useGpuRoot().setGlassOverride`),
// which is scoped to one root and repaints. The global stays as a quick dev/global convenience.
// tintColor is 0..1 rgba.
import type { RGBA } from "./scene";

export interface GlassParams {
  refraction: number; // rim bend, fraction of panel size
  blur: number; // backdrop blur radius, CSS px (CSS blur()-style Gaussian)
  tint: number; // mix toward tintColor, 0..1
  rim: number; // rim band width, CSS px
  brighten: number; // overall lightening (1 = none)
  specular: number; // highlight/glint intensity (0 = none)
  dispersion: number; // chromatic rim split (0 = none) — the colorful edge
  tintColor: RGBA;
}

// refraction 0.09 matches the documented per-node GlassSpec default (scene.ts) and the
// collectGlass fallback, so enabling the global / a default override doesn't shift the look.
export const GLASS_DEFAULTS: GlassParams = { refraction: 0.09, blur: 0, tint: 0, rim: 16, brighten: 1.03, specular: 0.02, dispersion: 0.025, tintColor: [0.82, 0.87, 1, 1] };

export const glassTuning: { enabled: boolean; params: GlassParams } = {
  enabled: false,
  params: { ...GLASS_DEFAULTS, tintColor: [...GLASS_DEFAULTS.tintColor] as RGBA },
};
