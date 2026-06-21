// Live-tunable glass parameters, driven by the on-screen slider panel (main.tsx).
// When `enabled`, these override EVERY glass panel's per-node spec so you can dial
// the whole look at once — the equivalent of the Kussetsu controls, but for the
// GPU shader. tintColor is 0..1 rgba.
import type { RGBA } from "./scene";

export interface GlassParams {
  refraction: number; // rim bend, fraction of panel size
  blur: number; // backdrop blur radius, CSS px (CSS blur()-style Gaussian)
  tint: number; // mix toward tintColor, 0..1
  rim: number; // rim band width, CSS px
  brighten: number; // overall lightening (1 = none)
  specular: number; // highlight/glint intensity (0 = none)
  tintColor: RGBA;
}

export const glassTuning: { enabled: boolean; params: GlassParams } = {
  enabled: false,
  params: { refraction: 0.1, blur: 2.5, tint: 0.05, rim: 24, brighten: 1.03, specular: 0.5, tintColor: [0.82, 0.87, 1, 1] },
};
