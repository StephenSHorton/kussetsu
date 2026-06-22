// Shared responsive helpers for the example/marketing pages. The renderer has no CSS
// media queries — layout is computed from the live viewport width (vw), so each section
// branches on isMobile(vw) and scales its fixed sizes with clampN()/fluid().
export const MOBILE_BP = 760; // below this, multi-column sections stack to one column
export const isMobile = (vw: number) => vw < MOBILE_BP;

/** Clamp v into [lo, hi]. */
export const clampN = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A size that scales with the viewport between a floor and a ceiling: clamp(lo, vw*k, hi). */
export const fluid = (vw: number, k: number, lo: number, hi: number) => Math.round(clampN(lo, vw * k, hi));
