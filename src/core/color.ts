// Color for Kussetsu's Style. An `RGBA` is `[r, g, b, a]`, each 0..1, STRAIGHT alpha
// (see scene.ts). `rgba()` is the public, ergonomic helper — hand it the color a
// designer gives you (hex / `rgb()` / a named color) and get a Style-ready tuple,
// no dividing-by-255 by hand. `parseColor` is the nullable primitive, shared with
// kussetsu/compat so the CSS→RGBA mapping lives in exactly one place.
import type { RGBA } from "./scene";

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], transparent: [0, 0, 0],
  red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  gray: [128, 128, 128], grey: [128, 128, 128], slate: [100, 116, 139],
};

/** A color string → RGBA (0..1 straight alpha), or null if not statically resolvable. */
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
  // var(--x), currentColor, hsl(), color-mix() … — no static resolution.
  return null;
}

/**
 * Convert a CSS color string to a Kussetsu `RGBA` tuple (0..1, straight alpha).
 *
 * ```ts
 * background: rgba("#5C5CFF")        // → [0.361, 0.361, 1, 1]
 * color:      rgba("#fff", 0.6)      // hex + alpha override
 * tintColor:  rgba("rgb(130 130 255)")
 * ```
 *
 * Accepts `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`, `rgb()` / `rgba()`, and a small
 * set of named colors. **Throws** on anything it can't parse — a fat-fingered hex is a
 * loud error, not a silently wrong color. `alpha` (0..1), when given, overrides the
 * parsed alpha.
 */
export function rgba(color: string, alpha?: number): RGBA {
  const c = parseColor(color);
  if (!c) {
    throw new Error(
      `kussetsu: rgba() can't parse ${JSON.stringify(color)} — use #rgb / #rrggbb(aa), rgb()/rgba(), or a named color`,
    );
  }
  return alpha === undefined ? c : [c[0], c[1], c[2], alpha];
}
