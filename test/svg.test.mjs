// Unit tests for the SVG path → quadratic preprocessor (src/core/svg.ts). Pure geometry, no GPU/DOM.
import { parsePath } from "../src/core/svg.ts";

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
// every subpath must be a closed, contiguous chain of quads
const isClosedChain = (sp) => {
  const q = sp.quads;
  if (!q.length) return false;
  for (let i = 1; i < q.length; i++) if (!approx(q[i].x0, q[i - 1].x1) || !approx(q[i].y0, q[i - 1].y1)) return false;
  return approx(q[q.length - 1].x1, q[0].x0) && approx(q[q.length - 1].y1, q[0].y0);
};

// ── rectangle via H/V + Z ──────────────────────────────────────────────────────
{
  const s = parsePath("M0 0 H10 V10 H0 Z");
  ok("rect → 1 subpath", s.length === 1, `got ${s.length}`);
  ok("rect → 4 quads", s[0].quads.length === 4, `got ${s[0].quads.length}`);
  ok("rect closed + contiguous", isClosedChain(s[0]));
  ok("rect corner 1 (10,0)", approx(s[0].quads[0].x1, 10) && approx(s[0].quads[0].y1, 0));
  ok("rect corner 2 (10,10)", approx(s[0].quads[1].x1, 10) && approx(s[0].quads[1].y1, 10));
  ok("line quad control = midpoint", approx(s[0].quads[0].cx, 5) && approx(s[0].quads[0].cy, 0));
}
// ── open subpath is implicitly closed for fill ─────────────────────────────────
{
  const s = parsePath("M0 0 L10 0");
  ok("open line → 1 subpath", s.length === 1);
  ok("open line implicitly closed (2 quads)", s[0].quads.length === 2, `got ${s[0].quads.length}`);
  ok("open line closes to start", isClosedChain(s[0]));
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
  ok("cubic → 1 subpath, closed", s.length === 1 && isClosedChain(s[0]));
  ok("cubic subdivided into multiple quads", s[0].quads.length >= 2, `got ${s[0].quads.length}`);
  ok("cubic starts at (0,0)", approx(s[0].quads[0].x0, 0) && approx(s[0].quads[0].y0, 0));
  ok("cubic reaches end (10,0) before close", s[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 0)));
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
  ok("S parses to a closed subpath", s.length === 1 && isClosedChain(s[0]));
  ok("S reaches (10,0)", s[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 0)));
}
// ── elliptical arc A → quads ───────────────────────────────────────────────────
{
  const s = parsePath("M0 0 A5 5 0 0 1 10 0");
  ok("arc → 1 closed subpath", s.length === 1 && isClosedChain(s[0]));
  ok("arc starts at (0,0)", approx(s[0].quads[0].x0, 0) && approx(s[0].quads[0].y0, 0));
  ok("arc reaches (10,0)", s[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 0)));
  // a 180° semicircle of r=5 from (0,0) to (10,0), sweep=1 → bulges to y≈+5 (below in SVG y-down)
  ok("arc bulges ~5 in y", s[0].quads.some((q) => Math.abs(q.y1) > 3));
}
// ── packed arc flags (SVGO compacts "1 1" → "11") parse identically to spaced ───
{
  const packed = parsePath("M0 0 A5 5 0 11 10 0"); // large=1, sweep=1, packed
  const spaced = parsePath("M0 0 A5 5 0 1 1 10 0");
  ok("packed arc flags → valid closed arc", packed.length === 1 && isClosedChain(packed[0]));
  ok("packed arc reaches (10,0)", packed[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 0)));
  ok("packed == spaced (same quad count)", packed[0].quads.length === spaced[0].quads.length, `${packed[0].quads.length} vs ${spaced[0].quads.length}`);
}
{
  const packed = parsePath("M0 0 A5 5 0 00 10 0"); // large=0, sweep=0, packed
  ok("packed 00 flags → valid closed arc", packed.length === 1 && isClosedChain(packed[0]));
  ok("packed 00 arc reaches (10,0)", packed[0].quads.some((q) => approx(q.x1, 10) && approx(q.y1, 0)));
}
// ── degenerate arc (zero radius) → line ────────────────────────────────────────
{
  const s = parsePath("M0 0 A0 0 0 0 1 10 0");
  ok("zero-radius arc → straight line, closed", s.length === 1 && isClosedChain(s[0]));
}
// ── implicit repeated lineto ───────────────────────────────────────────────────
{
  const s = parsePath("M0 0 L1 0 2 0 3 0");
  ok("implicit repeated L → 3 line quads + close", s[0].quads.length === 4, `got ${s[0].quads.length}`);
}
// ── empty / garbage is safe ────────────────────────────────────────────────────
{
  ok("empty path → no subpaths", parsePath("").length === 0);
  ok("lone moveto → no closed subpath", parsePath("M5 5").length === 0);
}

console.log(`${fail === 0 ? "✓" : "✗"} svg — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
