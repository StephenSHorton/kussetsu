// Unit tests for the SVG path → quadratic preprocessor (src/core/svg.ts). Pure geometry, no GPU/DOM.
import { parsePath, closeForFill, strokeToFill, flattenVectorDoc } from "../src/core/svg.ts";

let pass = 0;
let fail = 0;
const approx = (a, b, e = 1e-4) => Math.abs(a - b) <= e;
const ok = (name, cond, detail) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
// quads form a contiguous chain (each starts where the previous ended)
const isContiguous = (q) => {
  if (!q.length) return false;
  for (let i = 1; i < q.length; i++) if (!approx(q[i].x0, q[i - 1].x1) || !approx(q[i].y0, q[i - 1].y1)) return false;
  return true;
};
// a contiguous chain whose end returns to its start (a closed loop)
const isClosedChain = (sp) => isContiguous(sp.quads) && approx(sp.quads.at(-1).x1, sp.quads[0].x0) && approx(sp.quads.at(-1).y1, sp.quads[0].y0);
// an OPEN subpath: contiguous, flagged open, and closeForFill turns it into a closed loop
const isOpenButFillable = (sp) => sp.closed === false && isContiguous(sp.quads) && isClosedChain({ quads: closeForFill(sp) });

// ── rectangle via H/V + Z ──────────────────────────────────────────────────────
{
  const s = parsePath("M0 0 H10 V10 H0 Z");
  ok("rect → 1 subpath", s.length === 1, `got ${s.length}`);
  ok("rect → 4 quads", s[0].quads.length === 4, `got ${s[0].quads.length}`);
  ok("rect closed:true + closed chain", s[0].closed === true && isClosedChain(s[0]));
  ok("rect corner 1 (10,0)", approx(s[0].quads[0].x1, 10) && approx(s[0].quads[0].y1, 0));
  ok("rect corner 2 (10,10)", approx(s[0].quads[1].x1, 10) && approx(s[0].quads[1].y1, 10));
  ok("line quad control = midpoint", approx(s[0].quads[0].cx, 5) && approx(s[0].quads[0].cy, 0));
}
// ── open subpath: NOT auto-closed (1 quad), but closeForFill closes it ──────────
{
  const s = parsePath("M0 0 L10 0");
  ok("open line → 1 subpath", s.length === 1);
  ok("open line → 1 quad, closed:false", s[0].quads.length === 1 && s[0].closed === false, `got ${s[0].quads.length} quads closed=${s[0].closed}`);
  ok("open line is fillable via closeForFill", isOpenButFillable(s[0]));
}
// ── relative commands ──────────────────────────────────────────────────────────
{
  const s = parsePath("m0 0 l10 0 l0 10 z");
  ok("relative → 1 closed subpath", s.length === 1 && isClosedChain(s[0]));
  ok("relative resolves to (10,10) then close", s[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 10)));
  ok("relative has 3 quads", s[0].quads.length === 3, `got ${s[0].quads.length}`);
}
// ── multiple subpaths (a hole) ─────────────────────────────────────────────────
{
  const s = parsePath("M0 0 H10 V10 H0 Z M2 2 H8 V8 H2 Z");
  ok("two subpaths (outline + hole)", s.length === 2, `got ${s.length}`);
  ok("both subpaths closed", s.every(isClosedChain));
}
// ── cubic C → quads ────────────────────────────────────────────────────────────
{
  const s = parsePath("M0 0 C0 10 10 10 10 0");
  ok("cubic → 1 subpath, open + contiguous", s.length === 1 && s[0].closed === false && isContiguous(s[0].quads));
  ok("cubic subdivided into multiple quads", s[0].quads.length >= 2, `got ${s[0].quads.length}`);
  ok("cubic starts at (0,0)", approx(s[0].quads[0].x0, 0) && approx(s[0].quads[0].y0, 0));
  ok("cubic reaches end (10,0)", approx(s[0].quads.at(-1).x1, 10) && approx(s[0].quads.at(-1).y1, 0));
}
// ── quadratic Q (kept exactly) ─────────────────────────────────────────────────
{
  const s = parsePath("M0 0 Q5 10 10 0");
  ok("Q → control kept exactly (5,10)", approx(s[0].quads[0].cx, 5) && approx(s[0].quads[0].cy, 10));
  ok("Q reaches (10,0)", approx(s[0].quads[0].x1, 10) && approx(s[0].quads[0].y1, 0));
}
// ── smooth T reflects the previous quad control ────────────────────────────────
{
  const s = parsePath("M0 0 Q5 10 10 0 T20 0");
  // after Q (ctrl 5,10, end 10,0), T reflects → ctrl = 2*10-5, 2*0-10 = (15,-10)
  ok("T reflects prev quad control to (15,-10)", s[0].quads.some((q) => approx(q.cx, 15) && approx(q.cy, -10)));
}
// ── smooth S reflects the previous cubic control ───────────────────────────────
{
  const s = parsePath("M0 0 C0 5 5 5 5 0 S10 -5 10 0");
  ok("S parses to an open contiguous subpath", s.length === 1 && s[0].closed === false && isContiguous(s[0].quads));
  ok("S reaches (10,0)", s[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 0)));
}
// ── elliptical arc A → quads ───────────────────────────────────────────────────
{
  const s = parsePath("M0 0 A5 5 0 0 1 10 0");
  ok("arc → 1 open contiguous subpath", s.length === 1 && s[0].closed === false && isContiguous(s[0].quads));
  ok("arc starts at (0,0)", approx(s[0].quads[0].x0, 0) && approx(s[0].quads[0].y0, 0));
  ok("arc reaches (10,0)", s[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 0)));
  // a 180° semicircle of r=5 from (0,0) to (10,0), sweep=1 → bulges to y≈+5 (below in SVG y-down)
  ok("arc bulges ~5 in y", s[0].quads.some((q) => Math.abs(q.y1) > 3));
}
// ── packed arc flags (SVGO compacts "1 1" → "11") parse identically to spaced ───
{
  const packed = parsePath("M0 0 A5 5 0 11 10 0"); // large=1, sweep=1, packed
  const spaced = parsePath("M0 0 A5 5 0 1 1 10 0");
  ok("packed arc flags → valid open arc", packed.length === 1 && isContiguous(packed[0].quads));
  ok("packed arc reaches (10,0)", packed[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 0)));
  ok("packed == spaced (same quad count)", packed[0].quads.length === spaced[0].quads.length, `${packed[0].quads.length} vs ${spaced[0].quads.length}`);
}
{
  const packed = parsePath("M0 0 A5 5 0 00 10 0"); // large=0, sweep=0, packed
  ok("packed 00 flags → valid open arc", packed.length === 1 && isContiguous(packed[0].quads));
  ok("packed 00 arc reaches (10,0)", packed[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 0)));
}
// ── degenerate arc (zero radius) → line ────────────────────────────────────────
{
  const s = parsePath("M0 0 A0 0 0 0 1 10 0");
  ok("zero-radius arc → straight line, open + contiguous", s.length === 1 && isContiguous(s[0].quads));
}
// ── implicit repeated lineto (open, not auto-closed) ────────────────────────────
{
  const s = parsePath("M0 0 L1 0 2 0 3 0");
  ok("implicit repeated L → 3 line quads, open", s[0].quads.length === 3 && s[0].closed === false, `got ${s[0].quads.length} closed=${s[0].closed}`);
}
// ── closed flag: Z sets it, no-Z leaves it false ───────────────────────────────
{
  ok("Z → closed:true", parsePath("M0 0 L10 0 Z")[0].closed === true);
  ok("no Z → closed:false", parsePath("M0 0 L10 0")[0].closed === false);
  ok("Z mid-path: closed loop + new open subpath", (() => {
    const s = parsePath("M0 0 L10 0 Z M20 20 L30 20");
    return s.length === 2 && s[0].closed === true && s[1].closed === false;
  })());
}
// ── empty / garbage is safe ────────────────────────────────────────────────────
{
  ok("empty path → no subpaths", parsePath("").length === 0);
  ok("lone moveto → no closed subpath", parsePath("M5 5").length === 0);
}

// ── strokeToFill (Phase 3) ──────────────────────────────────────────────────────
const bboxOf = (subs) => {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const s of subs) for (const q of s.quads) for (const [x, y] of [[q.x0, q.y0], [q.cx, q.cy], [q.x1, q.y1]]) {
    mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y);
  }
  return [mnx, mny, mxx, mxy];
};
{
  // horizontal line, width 2, butt cap → ONE rect spanning x[0,10] y[-1,1]
  const sub = parsePath("M0 0 L10 0")[0];
  const p = strokeToFill(sub, 2, "butt", "miter", 4);
  ok("butt line → 1 rect piece", p.length === 1, `got ${p.length}`);
  const b = bboxOf(p);
  ok("rect bbox x[0,10] y[-1,1]", approx(b[0], 0) && approx(b[1], -1) && approx(b[2], 10) && approx(b[3], 1), `got ${b}`);
}
{
  // round cap → rect + 2 discs, bbox extends ±hw past the ends (x[-1,11])
  const p = strokeToFill(parsePath("M0 0 L10 0")[0], 2, "round", "miter", 4);
  ok("round-cap line → 3 pieces (rect + 2 discs)", p.length === 3, `got ${p.length}`);
  const b = bboxOf(p);
  ok("round cap extends bbox to x[-1,11]", approx(b[0], -1) && approx(b[2], 11), `got ${b}`);
}
{
  // square cap also extends ±hw past the ends
  const b = bboxOf(strokeToFill(parsePath("M0 0 L10 0")[0], 2, "square", "miter", 4));
  ok("square cap extends bbox to x[-1,11]", approx(b[0], -1) && approx(b[2], 11), `got ${b}`);
}
{
  // a corner: 2 segments, 1 interior vertex → 2 rects + 1 round-join disc (butt caps add nothing)
  const p = strokeToFill(parsePath("M0 0 L10 0 L10 10")[0], 2, "butt", "round", 4);
  ok("corner (butt cap, round join) → 3 pieces", p.length === 3, `got ${p.length}`);
}
{
  // closed square stroke: 4 segments + 4 joins, NO caps
  const p = strokeToFill(parsePath("M0 0 H10 V10 H0 Z")[0], 2, "butt", "round", 4);
  ok("closed square stroke → 8 pieces (4 rects + 4 joins, no caps)", p.length === 8, `got ${p.length}`);
}
{
  ok("zero width → no pieces", strokeToFill(parsePath("M0 0 L10 0")[0], 0, "round", "round", 4).length === 0);
  ok("stroke pieces are closed loops", strokeToFill(parsePath("M0 0 L10 0")[0], 2, "butt", "miter", 4).every((s) => s.closed === true));
}

// ── flattenVectorDoc gradients (Phase 2) ────────────────────────────────────────
const sq = closeForFill(parsePath("M0 0 H10 V10 H0 Z")[0]); // a 10×10 box → lbox [0,0,10,10]
{
  // linear, objectBoundingBox: coords 0..1 map to the path's box
  const doc = { viewBox: [0, 0, 100, 100], paths: [{ quads: sq, fill: [0, 0, 0, 0], evenOdd: false, gradient: { type: 1, bbox: true, coords: [0, 0, 1, 0], stops: [{ offset: 0, color: [1, 0, 0, 1] }, { offset: 1, color: [0, 0, 1, 1] }] } }] };
  const m = flattenVectorDoc(doc);
  const p = m.paths[0];
  ok("linear gradType=1", p.gradType === 1);
  ok("linear stopStart/count = 0/2", p.stopStart === 0 && p.stopCount === 2, `${p.stopStart}/${p.stopCount}`);
  ok("linear bbox gradGeom → [0,0,10,0]", approx(p.gradGeom[0], 0) && approx(p.gradGeom[1], 0) && approx(p.gradGeom[2], 10) && approx(p.gradGeom[3], 0), `got ${p.gradGeom}`);
  ok("stops flat = [0,1,0,0,1, 1,0,0,1,1]", [0, 1, 0, 0, 1, 1, 0, 0, 1, 1].every((v, i) => approx(m.stops[i], v)), `got ${[...m.stops]}`);
}
{
  // radial, objectBoundingBox: center maps to box; r normalized by the box diagonal/√2
  const doc = { viewBox: [0, 0, 100, 100], paths: [{ quads: sq, fill: [0, 0, 0, 0], evenOdd: false, gradient: { type: 2, bbox: true, coords: [0.5, 0.5, 0.5, 0], stops: [{ offset: 0, color: [1, 1, 1, 1] }, { offset: 1, color: [0, 0, 0, 1] }] } }] };
  const p = flattenVectorDoc(doc).paths[0];
  ok("radial gradType=2", p.gradType === 2);
  ok("radial bbox (square) center (5,5), rx=ry=5", approx(p.gradGeom[0], 5) && approx(p.gradGeom[1], 5) && approx(p.gradGeom[2], 5) && approx(p.gradGeom[3], 5), `got ${p.gradGeom}`);
}
{
  // radial on a NON-square box → ellipse: rx = r*lw, ry = r*lh (hugs the box, not a circle)
  const rect = closeForFill(parsePath("M0 0 H20 V10 H0 Z")[0]); // 20×10
  const doc = { viewBox: [0, 0, 100, 100], paths: [{ quads: rect, fill: [0, 0, 0, 0], evenOdd: false, gradient: { type: 2, bbox: true, coords: [0.5, 0.5, 0.5, 0], stops: [{ offset: 0, color: [1, 1, 1, 1] }, { offset: 1, color: [0, 0, 0, 1] }] } }] };
  const p = flattenVectorDoc(doc).paths[0];
  ok("radial bbox (20×10) → ellipse rx=10 ry=5", approx(p.gradGeom[2], 10) && approx(p.gradGeom[3], 5), `got rx=${p.gradGeom[2]} ry=${p.gradGeom[3]}`);
}
{
  // userSpaceOnUse: coords used as-is (already CTM-baked at resolve)
  const doc = { viewBox: [0, 0, 100, 100], paths: [{ quads: sq, fill: [0, 0, 0, 0], evenOdd: false, gradient: { type: 1, bbox: false, coords: [2, 3, 8, 3], stops: [{ offset: 0, color: [1, 0, 0, 1] }, { offset: 1, color: [0, 1, 0, 1] }] } }] };
  const p = flattenVectorDoc(doc).paths[0];
  ok("userSpace gradGeom used verbatim [2,3,8,3]", approx(p.gradGeom[0], 2) && approx(p.gradGeom[1], 3) && approx(p.gradGeom[2], 8) && approx(p.gradGeom[3], 3), `got ${p.gradGeom}`);
}
{
  // no gradient → gradType 0, no stops emitted
  const doc = { viewBox: [0, 0, 100, 100], paths: [{ quads: sq, fill: [1, 0, 0, 1], evenOdd: false }] };
  const m = flattenVectorDoc(doc);
  ok("solid fill → gradType 0, 0 stops", m.paths[0].gradType === 0 && m.stops.length === 0);
}

// ── scanline banding (Phase 1.5) ────────────────────────────────────────────────
{
  const rect = closeForFill(parsePath("M0 0 H10 V100 H0 Z")[0]); // tall 10×100 → 4 quads
  const m = flattenVectorDoc({ viewBox: [0, 0, 100, 100], paths: [{ quads: rect, fill: [1, 0, 0, 1], evenOdd: false }] });
  const p = m.paths[0];
  ok("banding: bandN ≥ 1", p.bandN >= 1);
  ok("banding: headers = 2 axes × bandN bands (2 u32 each)", m.bandHeaders.length === 2 * 2 * p.bandN, `got ${m.bandHeaders.length}`);
  ok("banding: bandVBase = bandHBase + bandN", p.bandVBase === p.bandHBase + p.bandN);
  // EVERY quad must be reachable from the H bands (banding must not drop a quad → no fill holes)
  const inH = new Set();
  for (let b = p.bandHBase; b < p.bandHBase + p.bandN; b++) {
    const off = m.bandHeaders[b * 2], cnt = m.bandHeaders[b * 2 + 1];
    for (let j = 0; j < cnt; j++) inH.add(m.bandQuads[off + j]);
  }
  ok("banding: all 4 quads covered by H bands", [0, 1, 2, 3].every((q) => inH.has(q)), `got ${[...inH]}`);
  // a full-height edge quad (spanning y 0..100) must appear in BOTH the first and last H band
  const bf = p.bandHBase, bl = p.bandHBase + p.bandN - 1;
  const inFirst = new Set(), inLast = new Set();
  for (let j = 0; j < m.bandHeaders[bf * 2 + 1]; j++) inFirst.add(m.bandQuads[m.bandHeaders[bf * 2] + j]);
  for (let j = 0; j < m.bandHeaders[bl * 2 + 1]; j++) inLast.add(m.bandQuads[m.bandHeaders[bl * 2] + j]);
  ok("banding: a full-height quad spans first..last band", [...inFirst].some((q) => inLast.has(q)));
}
{
  // tiny path → still valid (bandN small, all quads present)
  const m = flattenVectorDoc({ viewBox: [0, 0, 10, 10], paths: [{ quads: closeForFill(parsePath("M0 0 L10 0")[0]), fill: [0, 0, 0, 1], evenOdd: false }] });
  ok("banding: tiny path bandN≥1 + quads present", m.paths[0].bandN >= 1 && m.bandQuads.length > 0);
}
{
  // no-hole property: the shader picks a fragment's band in f32; for any coord inside a quad's axis range,
  // that quad MUST be in the chosen band (else a fill hole). The ±1 widening guarantees it despite f32/f64.
  const f32 = Math.fround;
  const shaderBand = (c, lo, size, n) => {
    if (!(size > 0)) return 0;
    const raw = f32(f32(f32(c) - f32(lo)) / f32(size)) * n; // ≈ the WGSL f32 ops
    return Math.min(n - 1, Math.floor(Math.max(0, Math.min(n - 1, raw))));
  };
  const bandSet = (m, base, k) => { const s = new Set(); const o = m.bandHeaders[(base + k) * 2], c = m.bandHeaders[(base + k) * 2 + 1]; for (let j = 0; j < c; j++) s.add(m.bandQuads[o + j]); return s; };
  // boundary-prone coordinates (fractional origin/size, many bands)
  const m = flattenVectorDoc({ viewBox: [0, 0, 100, 100], paths: [{ quads: closeForFill(parsePath("M0.37 0.7 C20 90 80 5 99.13 73.91 L99.13 99 L0.37 99 Z")[0]), fill: [1, 0, 0, 1], evenOdd: false }] });
  const p = m.paths[0];
  let holes = 0;
  for (let qi = p.curveStart; qi < p.curveStart + p.curveCount; qi++) {
    const b = qi * 6; // quad qi = [x0,y0, cx,cy, x1,y1] in mesh.curves
    const ylo = Math.min(m.curves[b + 1], m.curves[b + 3], m.curves[b + 5]), yhi = Math.max(m.curves[b + 1], m.curves[b + 3], m.curves[b + 5]);
    const xlo = Math.min(m.curves[b], m.curves[b + 2], m.curves[b + 4]), xhi = Math.max(m.curves[b], m.curves[b + 2], m.curves[b + 4]);
    for (let t = 0; t <= 24; t++) {
      const cy = ylo + ((yhi - ylo) * t) / 24, cx = xlo + ((xhi - xlo) * t) / 24;
      if (!bandSet(m, p.bandHBase, shaderBand(cy, p.lbox[1], p.lbox[3], p.bandN)).has(qi)) holes++;
      if (!bandSet(m, p.bandVBase, shaderBand(cx, p.lbox[0], p.lbox[2], p.bandN)).has(qi)) holes++;
    }
  }
  ok("banding: f32-shader band always contains the crossed quad (no holes)", holes === 0, `${holes} hole-samples`);
}

console.log(`${fail === 0 ? "✓" : "✗"} svg — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
