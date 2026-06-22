// kussetsu/compat — pure value parsers (no Babel, no DOM).
//
// Turns CSS value strings into the primitives Kussetsu's Style speaks: px numbers
// and RGBA tuples ([r,g,b,a] each 0..1, STRAIGHT alpha — see core/scene.ts). These
// are shared by the build-time Babel transform AND the opt-in runtime resolver, so
// the mapping is defined in exactly one place. `parseColor`'s canonical impl now
// lives in core (so the published `rgba()` helper and this mapper share one source);
// re-exported here so compat's existing importers keep their single import site.

export { parseColor } from "../core/color.ts";

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
