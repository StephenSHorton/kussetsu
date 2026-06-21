// kussetsu/compat — pure value parsers (no Babel, no DOM).
//
// Turns CSS value strings into the primitives Kussetsu's Style speaks: px numbers
// and RGBA tuples ([r,g,b,a] each 0..1, STRAIGHT alpha — see core/scene.ts). These
// are shared by the build-time Babel transform AND the opt-in runtime resolver, so
// the mapping is defined in exactly one place.

import type { RGBA } from "../core/scene";

/** A length → px number, or null if it has no static px value (%, vw, calc, auto…). */
export function parseLength(v: string | number): number | null {
  if (typeof v === "number") return v;
  const s = v.trim();
  if (s === "0") return 0;
  let m = s.match(/^(-?\d*\.?\d+)px$/);
  if (m) return parseFloat(m[1]);
  m = s.match(/^(-?\d*\.?\d+)rem$/);
  if (m) return parseFloat(m[1]) * 16; // 1rem = 16px (Tailwind/default root)
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s); // unitless number
  return null; // %, vw/vh, em, calc(), auto, min-content … — caller decides
}

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], transparent: [0, 0, 0],
  red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  gray: [128, 128, 128], grey: [128, 128, 128], slate: [100, 116, 139],
};

/** A color → RGBA (0..1 straight alpha), or null if not statically resolvable. */
export function parseColor(v: string): RGBA | null {
  const s = v.trim().toLowerCase();
  if (s === "transparent") return [0, 0, 0, 0];
  if (s in NAMED) {
    const [r, g, b] = NAMED[s];
    return [r / 255, g / 255, b / 255, 1];
  }
  // #rgb / #rgba / #rrggbb / #rrggbbaa
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    const exp = (a: string) => parseInt(a.length === 1 ? a + a : a, 16) / 255;
    if (h.length === 3) return [exp(h[0]), exp(h[1]), exp(h[2]), 1];
    if (h.length === 4) return [exp(h[0]), exp(h[1]), exp(h[2]), exp(h[3])];
    if (h.length === 6) return [exp(h.slice(0, 2)), exp(h.slice(2, 4)), exp(h.slice(4, 6)), 1];
    if (h.length === 8) return [exp(h.slice(0, 2)), exp(h.slice(2, 4)), exp(h.slice(4, 6)), exp(h.slice(6, 8))];
    return null;
  }
  // rgb()/rgba()
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,\/\s]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (p: string) => (p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p) / 255);
    const a = parts[3] != null ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    const [r, g, b] = [ch(parts[0]), ch(parts[1]), ch(parts[2])];
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return [r, g, b, a];
  }
  // var(--x), currentColor, hsl(), color-mix() … — no static resolution (fail loud upstream)
  return null;
}
