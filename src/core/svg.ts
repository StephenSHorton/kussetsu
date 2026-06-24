import type { RGBA } from "./scene";
import { parseColor } from "./color.ts";

// SVG path → quadratic-Bézier segments, the CPU preprocessor for the analytic vector-fill renderer.
//
// The GPU coverage shader (Slug-style analytic winding — Lengyel, "GPU-Centered Font Rendering
// Directly from Glyph Outlines", JCGT 2017; algorithm public-domain as of 2026-03-17; currently UNBANDED,
// see flattenVectorDoc's quad cap) only ever handles
// ONE primitive: a quadratic Bézier. So everything here normalizes to quadratics —
//   • a straight line → a quad whose control point is the segment midpoint (exactly the line),
//   • a cubic → 1+ quads via adaptive subdivision (recurse until within tolerance),
//   • an elliptical arc → ≤90° cubic pieces → quads.
// Each subpath is implicitly CLOSED (a fill needs closed contours for correct winding).
//
// This module is pure (string/number in, geometry out) so it unit-tests without a GPU or DOM.

/** A quadratic Bézier: p0 → (control) → p1. (p0 is redundant with the previous quad's p1 but kept
 *  explicit for simplicity; the GPU upload dedupes shared endpoints.) */
export interface Quad {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
}

/** One contour as a flat list of quadratics. `closed` = ended with Z (a loop, no caps when stroked);
 *  open subpaths are NOT auto-closed here — fills close them via closeForFill, strokes add line caps. */
export interface SubPath {
  quads: Quad[];
  closed: boolean;
}

/** Quads for FILLING a subpath: open contours get an implicit closing segment (SVG fills them closed),
 *  closed ones are used as-is. (Strokes use sp.quads directly + caps — they must NOT be auto-closed.) */
export function closeForFill(sp: SubPath): Quad[] {
  if (sp.closed || sp.quads.length === 0) return sp.quads;
  const f = sp.quads[0];
  const l = sp.quads[sp.quads.length - 1];
  if (f.x0 === l.x1 && f.y0 === l.y1) return sp.quads;
  return [...sp.quads, lineQuad(l.x1, l.y1, f.x0, f.y0)];
}

// Cubic→quadratic flatness tolerance, in path user-units. Quads render ANALYTICALLY (crisp at any
// zoom); only the cubic→quad approximation is lossy, so a tight tolerance keeps it imperceptible even
// when the camera magnifies. Scaled small relative to typical 0..1000 viewBox coordinates.
const CUBIC_TOL = 0.1;
const MAX_SUBDIV = 16; // recursion cap so a pathological cubic can't explode the segment count

const lineQuad = (x0: number, y0: number, x1: number, y1: number): Quad => ({ x0, y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x1, y1 });

// Approximate a cubic [p0,c1,c2,p3] by quadratics, appending to `out`. The best single quad has
// control (3(c1+c2) − (p0+p3))/4; the error is governed by the third difference |p0 − 3c1 + 3c2 − p3|.
// If that's above tolerance, subdivide the cubic at t=0.5 (de Casteljau) and recurse — recursion
// naturally spends more segments near inflections / high curvature.
function cubicToQuads(
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
  out: Quad[], depth = 0,
): void {
  // third-difference magnitude (curvature deviation from a quadratic)
  const dx = x0 - 3 * x1 + 3 * x2 - x3;
  const dy = y0 - 3 * y1 + 3 * y2 - y3;
  if (depth >= MAX_SUBDIV || dx * dx + dy * dy <= 16 * CUBIC_TOL * CUBIC_TOL) {
    out.push({ x0, y0, cx: (3 * (x1 + x2) - (x0 + x3)) / 4, cy: (3 * (y1 + y2) - (y0 + y3)) / 4, x1: x3, y1: y3 });
    return;
  }
  // de Casteljau split at t = 0.5
  const x01 = (x0 + x1) / 2, y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2, y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2, y23 = (y2 + y3) / 2;
  const xa = (x01 + x12) / 2, ya = (y01 + y12) / 2;
  const xb = (x12 + x23) / 2, yb = (y12 + y23) / 2;
  const xm = (xa + xb) / 2, ym = (ya + yb) / 2;
  cubicToQuads(x0, y0, x01, y01, xa, ya, xm, ym, out, depth + 1);
  cubicToQuads(xm, ym, xb, yb, x23, y23, x3, y3, out, depth + 1);
}

// Elliptical arc (SVG 'A') → quads, via endpoint→center parameterization (SVG spec Implementation
// Notes B.2.4), then ≤90° sweeps each emitted as a cubic (the (4/3)·tan(θ/4) handle rule) → cubicToQuads.
function arcToQuads(
  x0: number, y0: number, rx: number, ry: number, phiDeg: number, largeArc: boolean, sweep: boolean, x: number, y: number,
  out: Quad[],
): void {
  if (rx === 0 || ry === 0 || (x0 === x && y0 === y)) {
    out.push(lineQuad(x0, y0, x, y)); // degenerate → straight line
    return;
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi), sinP = Math.sin(phi);
  // step 1: compute (x1', y1') — midpoint in the rotated frame
  const dx2 = (x0 - x) / 2, dy2 = (y0 - y) / 2;
  const x1p = cosP * dx2 + sinP * dy2;
  const y1p = -sinP * dx2 + cosP * dy2;
  // correct out-of-range radii (spec B.2.5)
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  // step 2: center (cx', cy') in the rotated frame
  const rx2 = rx * rx, ry2 = ry * ry, x1p2 = x1p * x1p, y1p2 = y1p * y1p;
  let num = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
  num = num < 0 ? 0 : num; // clamp FP negatives
  let co = Math.sqrt(num / (rx2 * y1p2 + ry2 * x1p2));
  if (largeArc === sweep) co = -co;
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  // step 3: center in user space
  const cx = cosP * cxp - sinP * cyp + (x0 + x) / 2;
  const cy = sinP * cxp + cosP * cyp + (y0 + y) / 2;
  // step 4: start angle + sweep angle
  const ang = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  // emit ≤90° cubic segments
  const n = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / n;
  const handle = (4 / 3) * Math.tan(delta / 4);
  let t1 = theta1;
  let px = x0, py = y0;
  for (let i = 0; i < n; i++) {
    const t2 = t1 + delta;
    const cosT1 = Math.cos(t1), sinT1 = Math.sin(t1), cosT2 = Math.cos(t2), sinT2 = Math.sin(t2);
    // endpoint of this sub-arc in user space
    const ex = cosP * rx * cosT2 - sinP * ry * sinT2 + cx;
    const ey = sinP * rx * cosT2 + cosP * ry * sinT2 + cy;
    // control points from the tangents
    const d1x = cosP * rx * -sinT1 - sinP * ry * cosT1;
    const d1y = sinP * rx * -sinT1 + cosP * ry * cosT1;
    const d2x = cosP * rx * -sinT2 - sinP * ry * cosT2;
    const d2y = sinP * rx * -sinT2 + cosP * ry * cosT2;
    cubicToQuads(px, py, px + handle * d1x, py + handle * d1y, ex - handle * d2x, ey - handle * d2y, ex, ey, out);
    px = ex;
    py = ey;
    t1 = t2;
  }
}

// ── shape → path `d` (reuse the tested parsePath for all geometry) ─────────────
const n6 = (v: number) => (Number.isFinite(v) ? v : 0);
/** `<rect>` (optionally rounded) → a path `d`. */
export function rectPathD(x: number, y: number, w: number, h: number, rx = 0, ry = 0): string {
  rx = Math.min(Math.max(0, rx || ry), w / 2);
  ry = Math.min(Math.max(0, ry || rx), h / 2);
  if (rx <= 0 || ry <= 0) return `M${n6(x)} ${n6(y)}H${n6(x + w)}V${n6(y + h)}H${n6(x)}Z`;
  return (
    `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
    `V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
    `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
    `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
  );
}
/** `<ellipse>` / `<circle>` (rx==ry) → a path `d` (two half-arcs). */
export function ellipsePathD(cx: number, cy: number, rx: number, ry: number): string {
  if (!(rx > 0) || !(ry > 0)) return ""; // also bails on NaN (NaN>0 is false)
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}
/** `<polygon>`/`<polyline>` points → a path `d`. `close` adds Z (polygon = true; polyline = false, so a
 *  STROKED polyline gets caps and no spurious closing edge — fills still close it via closeForFill). */
export function polyPathD(points: string, close: boolean): string {
  const n = (points.match(NUM_RE) ?? []).map(Number);
  if (n.length < 4) return "";
  let d = `M${n[0]} ${n[1]}`;
  for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]} ${n[i + 1]}`;
  return close ? d + "Z" : d;
}

// ── 2D affine transform (SVG `transform` attr) ─────────────────────────────────
/** [a, b, c, d, e, f] — x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const xform = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const xformQuad = (m: Matrix, q: Quad): Quad => {
  const [x0, y0] = xform(m, q.x0, q.y0);
  const [cx, cy] = xform(m, q.cx, q.cy);
  const [x1, y1] = xform(m, q.x1, q.y1);
  return { x0, y0, cx, cy, x1, y1 };
};
/** Parse an SVG `transform` attribute (translate/scale/rotate/skewX/skewY/matrix, composed L→R). */
export function parseTransform(s: string): Matrix {
  let m: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(s))) {
    const fn = t[1];
    const a = (t[2].match(NUM_RE) ?? []).map(Number);
    let n: Matrix = IDENTITY;
    if (fn === "matrix" && a.length >= 6) n = [a[0], a[1], a[2], a[3], a[4], a[5]];
    else if (fn === "translate") n = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (fn === "scale") { const sx = a.length > 0 ? a[0] : 1; n = [sx, 0, 0, a.length > 1 ? a[1] : sx, 0, 0]; } // empty scale() = identity, not collapse
    else if (fn === "rotate") {
      const r = ((a[0] || 0) * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
      const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
      n = a.length >= 3 ? mul(mul([1, 0, 0, 1, a[1], a[2]], rot), [1, 0, 0, 1, -a[1], -a[2]]) : rot;
    } else if (fn === "skewX") n = [1, 0, Math.tan(((a[0] || 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === "skewY") n = [1, Math.tan(((a[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

/** A fillable path extracted from an SVG document: quads in viewBox space + a resolved fill. */
export interface VectorPath {
  quads: Quad[];
  fill: RGBA;
  evenOdd: boolean;
}
export interface VectorDoc {
  viewBox: [number, number, number, number]; // x, y, w, h
  paths: VectorPath[];
}

const NUM_RE = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;

// Arc args need a dedicated tokenizer: the large-arc + sweep flags are SINGLE chars that optimizers
// (SVGO) pack with no separator — `A5 5 0 11 10 0` means flags 1,1, but NUM_RE would read "11" as one
// number and warp/drop the arc. Read sequentially: 3 numbers, 2 single-char flags, 2 numbers, repeat.
function parseArcArgs(s: string): number[] {
  const numRe = /[\s,]*(-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/y;
  const flagRe = /[\s,]*([01])/y;
  let i = 0;
  const rd = (re: RegExp): number | null => {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m || m.index !== i) return null;
    i = re.lastIndex;
    return parseFloat(m[1]);
  };
  const out: number[] = [];
  for (;;) {
    const rx = rd(numRe);
    if (rx == null) break;
    const ry = rd(numRe), rot = rd(numRe), large = rd(flagRe), sweep = rd(flagRe), x = rd(numRe), y = rd(numRe);
    if (ry == null || rot == null || large == null || sweep == null || x == null || y == null) break;
    out.push(rx, ry, rot, large, sweep, x, y);
  }
  return out;
}

// finite-or-default coercion (handles "10px" → 10; rejects NaN from "" / "50%" → falls back).
const fin = (v: string | null, def = 0): number => {
  const f = parseFloat(v ?? "");
  return Number.isFinite(f) ? f : def;
};
// opacity: 0..1, supports "50%", clamps, defaults to 1 on garbage.
const opacity01 = (v: string | null): number => {
  if (v == null) return 1;
  const t = v.trim();
  const f = t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t);
  return Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 1;
};

/** Parse an SVG path `d` string into closed sub-paths of quadratics. Handles all commands
 *  (M/L/H/V/C/S/Q/T/A/Z, absolute + relative), implicit repeated commands, and the S/T smooth
 *  reflections. Subpaths carry a `closed` flag (Z) but are NOT auto-closed. Malformed tails are ignored. */
export function parsePath(d: string): SubPath[] {
  const subs: SubPath[] = [];
  let quads: Quad[] = [];
  let cx = 0, cy = 0; // current point
  let sx = 0, sy = 0; // subpath start
  let prevCtrlX = 0, prevCtrlY = 0; // last cubic control (for S), or last quad control (for T)
  let prevCmd = "";

  const flush = () => {
    if (quads.length) subs.push({ quads, closed: false }); // open — NOT auto-closed (fill closes; stroke caps)
    quads = [];
  };

  // split into [command, ...args] groups
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const nums = (m[2].match(NUM_RE) ?? []).map(Number);
    let i = 0;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0; // relative origin (recomputed per vertex below)

    if (cmd === "M" || cmd === "m") {
      while (i + 1 < nums.length || i === 0) {
        if (i + 1 >= nums.length) break;
        const nx = (rel ? cx : 0) + nums[i++];
        const ny = (rel ? cy : 0) + nums[i++];
        if (i === 2) {
          // first pair = moveto: start a new subpath
          flush();
          cx = sx = nx;
          cy = sy = ny;
        } else {
          // subsequent pairs = implicit lineto
          quads.push(lineQuad(cx, cy, nx, ny));
          cx = nx;
          cy = ny;
        }
      }
    } else if (cmd === "L" || cmd === "l") {
      while (i + 1 < nums.length) {
        const nx = (rel ? cx : 0) + nums[i++];
        const ny = (rel ? cy : 0) + nums[i++];
        quads.push(lineQuad(cx, cy, nx, ny));
        cx = nx;
        cy = ny;
      }
    } else if (cmd === "H" || cmd === "h") {
      while (i < nums.length) {
        const nx = (rel ? cx : 0) + nums[i++];
        quads.push(lineQuad(cx, cy, nx, cy));
        cx = nx;
      }
    } else if (cmd === "V" || cmd === "v") {
      while (i < nums.length) {
        const ny = (rel ? cy : 0) + nums[i++];
        quads.push(lineQuad(cx, cy, cx, ny));
        cy = ny;
      }
    } else if (cmd === "C" || cmd === "c") {
      while (i + 5 < nums.length) {
        const c1x = (rel ? cx : 0) + nums[i++], c1y = (rel ? cy : 0) + nums[i++];
        const c2x = (rel ? cx : 0) + nums[i++], c2y = (rel ? cy : 0) + nums[i++];
        const ex = (rel ? cx : 0) + nums[i++], ey = (rel ? cy : 0) + nums[i++];
        cubicToQuads(cx, cy, c1x, c1y, c2x, c2y, ex, ey, quads);
        prevCtrlX = c2x;
        prevCtrlY = c2y;
        cx = ex;
        cy = ey;
      }
    } else if (cmd === "S" || cmd === "s") {
      while (i + 3 < nums.length) {
        const c1x = prevCmd === "C" || prevCmd === "S" ? 2 * cx - prevCtrlX : cx;
        const c1y = prevCmd === "C" || prevCmd === "S" ? 2 * cy - prevCtrlY : cy;
        const c2x = (rel ? cx : 0) + nums[i++], c2y = (rel ? cy : 0) + nums[i++];
        const ex = (rel ? cx : 0) + nums[i++], ey = (rel ? cy : 0) + nums[i++];
        cubicToQuads(cx, cy, c1x, c1y, c2x, c2y, ex, ey, quads);
        prevCtrlX = c2x;
        prevCtrlY = c2y;
        cx = ex;
        cy = ey;
      }
    } else if (cmd === "Q" || cmd === "q") {
      while (i + 3 < nums.length) {
        const qx = (rel ? cx : 0) + nums[i++], qy = (rel ? cy : 0) + nums[i++];
        const ex = (rel ? cx : 0) + nums[i++], ey = (rel ? cy : 0) + nums[i++];
        quads.push({ x0: cx, y0: cy, cx: qx, cy: qy, x1: ex, y1: ey });
        prevCtrlX = qx;
        prevCtrlY = qy;
        cx = ex;
        cy = ey;
      }
    } else if (cmd === "T" || cmd === "t") {
      while (i + 1 < nums.length) {
        const qx = prevCmd === "Q" || prevCmd === "T" ? 2 * cx - prevCtrlX : cx;
        const qy = prevCmd === "Q" || prevCmd === "T" ? 2 * cy - prevCtrlY : cy;
        const ex = (rel ? cx : 0) + nums[i++], ey = (rel ? cy : 0) + nums[i++];
        quads.push({ x0: cx, y0: cy, cx: qx, cy: qy, x1: ex, y1: ey });
        prevCtrlX = qx;
        prevCtrlY = qy;
        cx = ex;
        cy = ey;
      }
    } else if (cmd === "A" || cmd === "a") {
      const an = parseArcArgs(m[2]); // arc-aware tokenizer (handles packed flags like "11")
      for (let j = 0; j + 6 < an.length; j += 7) {
        const rxA = an[j], ryA = an[j + 1], rot = an[j + 2];
        const large = an[j + 3] !== 0, swp = an[j + 4] !== 0;
        const ex = (rel ? cx : 0) + an[j + 5], ey = (rel ? cy : 0) + an[j + 6];
        arcToQuads(cx, cy, rxA, ryA, rot, large, swp, ex, ey, quads);
        cx = ex;
        cy = ey;
      }
    } else if (cmd === "Z" || cmd === "z") {
      if (cx !== sx || cy !== sy) quads.push(lineQuad(cx, cy, sx, sy)); // close the loop geometrically
      if (quads.length) subs.push({ quads, closed: true });
      quads = [];
      cx = sx;
      cy = sy;
    }
    void ox;
    void oy;
    prevCmd = cmd.toUpperCase();
  }
  flush();
  return subs;
}

// ── full SVG document → fillable vector paths (browser; uses DOMParser) ─────────
const SHForm: Record<string, true> = { svg: true, g: true, path: true, rect: true, circle: true, ellipse: true, polygon: true, polyline: true };

// ── stroke → fill ───────────────────────────────────────────────────────────────
// Convert a stroked centerline into FILL subpaths, so the analytic fill shader draws it (no new shader).
// Method: a UNION of convex pieces — a rect per segment, a join per vertex, a cap per open end — each
// made the SAME winding (ccw) so the nonzero (|winding|) fill unions them flat (overlaps don't
// double-darken even at stroke-opacity < 1). Curves are flattened to a polyline first.
type Pt = [number, number];
const STROKE_TOL = 0.2; // quad→polyline flatness (user units)
const lineLoop = (pts: Pt[]): SubPath => {
  const quads: Quad[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    quads.push(lineQuad(a[0], a[1], b[0], b[1]));
  }
  return { quads, closed: true };
};
// unit circle as 8 quad-Bézier arcs (45° each; control at the tangent intersection) — built once, then
// scaled+translated per disc (avoids re-parsing an ellipse `d` string for every round join/cap).
const UNIT_DISC: Quad[] = (() => {
  const q: Quad[] = [];
  const k = 1 / Math.cos(Math.PI / 8); // tangent-intersection distance for a 45° arc
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI, b = ((i + 1) / 8) * 2 * Math.PI, m = (a + b) / 2;
    q.push({ x0: Math.cos(a), y0: Math.sin(a), cx: Math.cos(m) * k, cy: Math.sin(m) * k, x1: Math.cos(b), y1: Math.sin(b) });
  }
  return q;
})();
const discSub = (cx: number, cy: number, r: number): SubPath => ({
  quads: UNIT_DISC.map((u) => ({ x0: cx + u.x0 * r, y0: cy + u.y0 * r, cx: cx + u.cx * r, cy: cy + u.cy * r, x1: cx + u.x1 * r, y1: cy + u.y1 * r })),
  closed: true,
});
const signedArea = (q: Quad[]): number => {
  let a = 0;
  for (const s of q) a += s.x0 * s.y1 - s.x1 * s.y0;
  return a / 2;
};
const reverseQuads = (q: Quad[]): Quad[] => q.map((s) => ({ x0: s.x1, y0: s.y1, cx: s.cx, cy: s.cy, x1: s.x0, y1: s.y0 })).reverse();
const ccw = (sp: SubPath): SubPath => (signedArea(sp.quads) < 0 ? { quads: reverseQuads(sp.quads), closed: sp.closed } : sp);

function quadsToPolyline(quads: Quad[], tol: number): Pt[] {
  const pts: Pt[] = [];
  const flat = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, depth: number) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; // control's bulge from the chord midpoint ≈ flatness
    if (depth >= 12 || (cx - mx) * (cx - mx) + (cy - my) * (cy - my) <= tol * tol) {
      pts.push([x1, y1]);
      return;
    }
    const x01 = (x0 + cx) / 2, y01 = (y0 + cy) / 2, x12 = (cx + x1) / 2, y12 = (cy + y1) / 2, xm = (x01 + x12) / 2, ym = (y01 + y12) / 2;
    flat(x0, y0, x01, y01, xm, ym, depth + 1);
    flat(xm, ym, x12, y12, x1, y1, depth + 1);
  };
  if (quads.length) pts.push([quads[0].x0, quads[0].y0]);
  for (const q of quads) flat(q.x0, q.y0, q.cx, q.cy, q.x1, q.y1, 0);
  return pts;
}

const norm = (dx: number, dy: number): Pt => {
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};
// rectangle of half-width hw centered on segment a→b
const rectPiece = (a: Pt, b: Pt, hw: number): SubPath => {
  const [dx, dy] = norm(b[0] - a[0], b[1] - a[1]);
  const nx = -dy * hw, ny = dx * hw; // left normal × hw
  return lineLoop([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
};

export type StrokeCap = "butt" | "round" | "square";
export type StrokeJoin = "miter" | "round" | "bevel";
const cap3 = (c: string): StrokeCap => (c === "round" || c === "square" ? c : "butt");
const join3 = (j: string): StrokeJoin => (j === "round" || j === "bevel" ? j : "miter");

/** Stroke a centerline subpath into fill subpaths (outline pieces). Caller concatenates all pieces'
 *  quads into ONE VectorPath so the nonzero(|winding|) fill unions them (no double-darken / AA seams). */
export function strokeToFill(sp: SubPath, width: number, cap: StrokeCap, join: StrokeJoin, miterLimit: number, tol = STROKE_TOL): SubPath[] {
  const hw = width / 2;
  if (!(hw > 0)) return [];
  let pts = quadsToPolyline(sp.quads, tol).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6);
  const closed = sp.closed;
  if (closed && pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
  const n = pts.length;
  if (n < 2) return n === 1 && cap !== "butt" ? [ccw(discSub(pts[0][0], pts[0][1], hw))] : [];
  const out: SubPath[] = [];
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) out.push(rectPiece(pts[i], pts[(i + 1) % n], hw));
  // joins at interior vertices (closed: every vertex)
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const v = pts[i], p = pts[(i - 1 + n) % n], q = pts[(i + 1) % n];
    const d0 = norm(v[0] - p[0], v[1] - p[1]), d1 = norm(q[0] - v[0], q[1] - v[1]);
    const cross = d0[0] * d1[1] - d0[1] * d1[0];
    const dot = d0[0] * d1[0] + d0[1] * d1[1];
    if (Math.abs(cross) < 0.02) {
      if (dot > 0) continue; // (near-)straight — the rects already meet, no gap
      out.push(discSub(v[0], v[1], hw)); // 180° hairpin (cross≈0 but reversed) → round it
      continue;
    }
    if (join === "round") {
      out.push(discSub(v[0], v[1], hw));
      continue;
    }
    const s = cross > 0 ? -1 : 1; // outer side of the turn
    const cA: Pt = [v[0] + s * -d0[1] * hw, v[1] + s * d0[0] * hw];
    const cB: Pt = [v[0] + s * -d1[1] * hw, v[1] + s * d1[0] * hw];
    if (join === "miter") {
      // intersect line(cA, dir d0) with line(cB, dir d1)
      const den = d0[0] * d1[1] - d0[1] * d1[0];
      const t = ((cB[0] - cA[0]) * d1[1] - (cB[1] - cA[1]) * d1[0]) / den;
      const mp: Pt = [cA[0] + d0[0] * t, cA[1] + d0[1] * t];
      if (Math.hypot(mp[0] - v[0], mp[1] - v[1]) <= miterLimit * hw) {
        out.push(lineLoop([v, cA, mp, cB]));
        continue;
      }
    }
    out.push(lineLoop([v, cA, cB])); // bevel (and miter past the limit)
  }
  // caps (open ends)
  if (!closed) {
    for (const [end, nb] of [[pts[0], pts[1]], [pts[n - 1], pts[n - 2]]] as [Pt, Pt][]) {
      if (cap === "round") out.push(discSub(end[0], end[1], hw));
      else if (cap === "square") {
        const [dx, dy] = norm(end[0] - nb[0], end[1] - nb[1]);
        out.push(rectPiece(end, [end[0] + dx * hw, end[1] + dy * hw], hw));
      }
    }
  }
  return out.map(ccw);
}

interface Inherited {
  fill: string; // "none" | a color | "" (unset → black)
  fillOpacity: number;
  opacity: number;
  evenOdd: boolean;
  stroke: string; // "" (none) | a color
  strokeWidth: number;
  strokeOpacity: number;
  cap: StrokeCap;
  join: StrokeJoin;
  miterLimit: number;
  m: Matrix;
}

/** Parse a full SVG document string into fillable paths (quads in viewBox space + resolved fill).
 *  Browser-only (DOMParser). v1 scope: `<path>`/`<rect>`/`<circle>`/`<ellipse>`/`<polygon>`/`<polyline>`
 *  under `<g>` groups, with `transform`, `fill` / `fill-rule` / `fill-opacity` / `opacity`, and
 *  `stroke` / `stroke-width` / `stroke-opacity` / `stroke-linecap` / `stroke-linejoin` /
 *  `stroke-miterlimit` (all attr or inline style, inherited; strokes → fill via strokeToFill), and the
 *  root `viewBox`. NOT yet: gradients/patterns (url(#…) skipped), stroke-dasharray, `<use>`, `<text>`,
 *  `<image>`, CSS `<style>`, clip/mask/filters. */
export function parseSvgDocument(text: string): VectorDoc {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") return { viewBox: [0, 0, 1, 1], paths: [] };

  // coordinate space: viewBox wins; else width/height; else a unit box.
  let viewBox: [number, number, number, number] = [0, 0, 1, 1];
  const vb = (root.getAttribute("viewBox") ?? "").match(NUM_RE)?.map(Number);
  if (vb && vb.length >= 4 && vb[2] > 0 && vb[3] > 0) viewBox = [vb[0], vb[1], vb[2], vb[3]]; // positive dims only (else NaN geometry)
  else {
    const w = parseFloat(root.getAttribute("width") ?? "");
    const h = parseFloat(root.getAttribute("height") ?? "");
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) viewBox = [0, 0, w, h];
  }
  const strokeTol = Math.max(viewBox[2], viewBox[3]) * 0.0005; // curve→polyline flatness, scaled to the coordinate space

  const paths: VectorPath[] = [];
  const styleProp = (el: Element, name: string): string | null => {
    const s = el.getAttribute("style");
    if (s) {
      const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(s);
      if (m) return m[1].trim();
    }
    return el.getAttribute(name);
  };

  const dToSubpaths = (el: Element): SubPath[] => {
    const tag = el.tagName.toLowerCase();
    const a = (name: string) => fin(el.getAttribute(name)); // finite-or-0 (no NaN from "" / "50%")
    let d: string | null = null;
    if (tag === "path") d = el.getAttribute("d");
    else if (tag === "rect") d = rectPathD(a("x"), a("y"), a("width"), a("height"), a("rx"), a("ry"));
    else if (tag === "circle") {
      const r = a("r");
      d = ellipsePathD(a("cx"), a("cy"), r, r);
    } else if (tag === "ellipse") d = ellipsePathD(a("cx"), a("cy"), a("rx"), a("ry"));
    else if (tag === "polygon" || tag === "polyline") d = polyPathD(el.getAttribute("points") ?? "", tag === "polygon");
    return d ? parsePath(d) : [];
  };
  // resolve a paint color string → premultiply-free RGBA with the given alpha, or null (none/url/unparseable)
  const paint = (raw: string, alpha: number): RGBA | null => {
    const c = raw === "" ? null : raw.trim();
    if (!c || c.toLowerCase() === "none" || c.startsWith("url(")) return null;
    const col = parseColor(/^currentcolor$/i.test(c) ? "black" : c); // currentColor → black (no inherited color yet)
    if (!col) return null;
    const a = col[3] * alpha;
    return a > 0 ? [col[0], col[1], col[2], a] : null;
  };

  const walk = (el: Element, inh: Inherited) => {
    const tf = el.getAttribute("transform");
    const fr = styleProp(el, "fill-rule");
    const sp = (name: string, fallback: number) => { const v = styleProp(el, name); return v != null && !v.trim().endsWith("%") ? fin(v, fallback) : fallback; }; // % stroke-width unsupported → inherit
    const cur: Inherited = {
      m: tf ? mul(inh.m, parseTransform(tf)) : inh.m,
      fill: styleProp(el, "fill") ?? inh.fill,
      fillOpacity: (() => { const v = styleProp(el, "fill-opacity"); return v != null ? opacity01(v) : inh.fillOpacity; })(),
      opacity: (() => { const v = styleProp(el, "opacity"); return v != null ? inh.opacity * opacity01(v) : inh.opacity; })(),
      evenOdd: fr ? fr === "evenodd" : inh.evenOdd,
      stroke: styleProp(el, "stroke") ?? inh.stroke,
      strokeWidth: sp("stroke-width", inh.strokeWidth),
      strokeOpacity: (() => { const v = styleProp(el, "stroke-opacity"); return v != null ? opacity01(v) : inh.strokeOpacity; })(),
      cap: (styleProp(el, "stroke-linecap") as StrokeCap) || inh.cap,
      join: (styleProp(el, "stroke-linejoin") as StrokeJoin) || inh.join,
      miterLimit: sp("stroke-miterlimit", inh.miterLimit),
    };
    const tag = el.tagName.toLowerCase();
    if (tag !== "svg" && tag !== "g") {
      const subs = dToSubpaths(el);
      // FILL
      const fillCol = paint(cur.fill === "" ? "black" : cur.fill, cur.fillOpacity * cur.opacity); // SVG default fill is black
      if (fillCol) {
        const quads = subs.flatMap(closeForFill).map((q) => xformQuad(cur.m, q));
        if (quads.length) paths.push({ quads, fill: fillCol, evenOdd: cur.evenOdd });
      }
      // STROKE → fill. ALL pieces (across subpaths) merge into ONE VectorPath so the nonzero(|winding|)
      // fill unions them in a single coverage pass — no double-darken at stroke-opacity<1, no AA seams,
      // one draw. (strokeToFill ccw-normalizes pieces so same-winding union holds.)
      const strokeCol = paint(cur.stroke, cur.strokeOpacity * cur.opacity);
      if (strokeCol && cur.strokeWidth > 0) {
        const quads: Quad[] = [];
        for (const sub of subs)
          for (const piece of strokeToFill(sub, cur.strokeWidth, cap3(cur.cap), join3(cur.join), cur.miterLimit > 0 ? cur.miterLimit : 4, strokeTol))
            for (const q of piece.quads) quads.push(xformQuad(cur.m, q));
        if (quads.length) paths.push({ quads, fill: strokeCol, evenOdd: false });
      }
    }
    for (const c of Array.from(el.children)) if (SHForm[c.tagName.toLowerCase()]) walk(c, cur);
  };
  walk(root, { fill: "", fillOpacity: 1, opacity: 1, evenOdd: false, stroke: "", strokeWidth: 1, strokeOpacity: 1, cap: "butt", join: "miter", miterLimit: 4, m: IDENTITY });
  return { viewBox, paths };
}

// ── flatten a parsed doc into GPU-ready arrays (pure → unit-testable) ───────────
/** One path's GPU metadata: where its quads live in the shared curve array, its fill, and its
 *  bounding box in viewBox space (from the control hull — a conservative bound for the cover quad). */
export interface VectorPathMeta {
  curveStart: number; // first quad index (each quad = 3 vec2f in `curves`)
  curveCount: number;
  fill: RGBA;
  evenOdd: boolean;
  lbox: [number, number, number, number]; // x, y, w, h in viewBox space
}
export interface VectorMesh {
  curves: Float32Array; // flat: per quad → p0.xy, control.xy, p1.xy (6 floats)
  paths: VectorPathMeta[];
  viewBox: [number, number, number, number];
}

// The fill shader is UNBANDED — every fragment in a path's bbox loops ALL its quads (cost ∝ area ×
// quadCount). A pathological path (dense map outline, font-as-path) could stall the GPU, so cap per-path
// quads and skip+warn beyond it (degrade to "not drawn" rather than hang). Normal icons are well under.
// (Scanline banding to lift this ceiling is the planned Phase-1.5 optimization.)
const MAX_PATH_QUADS = 6000;

/** VectorDoc → flat curve buffer + per-path metadata, ready to upload. Pure. */
export function flattenVectorDoc(doc: VectorDoc): VectorMesh {
  const pts: number[] = [];
  const paths: VectorPathMeta[] = [];
  for (const p of doc.paths) {
    if (!p.quads.length) continue;
    if (p.quads.length > MAX_PATH_QUADS) {
      if (typeof console !== "undefined") console.warn(`[kussetsu] SVG path skipped: ${p.quads.length} quads exceeds the ${MAX_PATH_QUADS} cap (unbanded fill would stall the GPU)`);
      continue;
    }
    const curveStart = pts.length / 6;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const q of p.quads) {
      pts.push(q.x0, q.y0, q.cx, q.cy, q.x1, q.y1);
      minx = Math.min(minx, q.x0, q.cx, q.x1);
      miny = Math.min(miny, q.y0, q.cy, q.y1);
      maxx = Math.max(maxx, q.x0, q.cx, q.x1);
      maxy = Math.max(maxy, q.y0, q.cy, q.y1);
    }
    paths.push({ curveStart, curveCount: p.quads.length, fill: p.fill, evenOdd: p.evenOdd, lbox: [minx, miny, maxx - minx, maxy - miny] });
  }
  return { curves: new Float32Array(pts), paths, viewBox: doc.viewBox };
}
