// Unit tests for the real (Yoga/WASM) layout engine — src/core/yogaLayout.ts's
// layoutWithYoga — and the measureText helper in src/core/layout.ts.
//
// yoga-layout's default import is ready synchronously in Node (the module top-level-awaits
// the WASM), so we can drive a real layout pass here. We build scene trees with el(...),
// give children EXPLICIT px sizes so the expected rects are exact, and assert x/y/w/h that
// we compute by hand from vw/vh + the flexbox rules. helpers.mjs installs a deterministic
// fake canvas on import (every glyph advances fontSize*0.5 px), so measureText is exact too.
// Run: node test/layout.test.mjs  (Node ≥23 strips TS types + resolves the .ts imports).
import { makeHarness, approx, el } from "./helpers.mjs";
import { layoutWithYoga } from "../src/core/yogaLayout.ts";
import { measureText } from "../src/core/layout.ts";

const { ok, done } = makeHarness();

// A leaf <view> with a fixed box — predictable intrinsic size, no text measurement.
const box = (w, h, extra = {}) => el("view", { style: { width: w, height: h, ...extra } });
// Assert a node's computed rect equals (x,y,w,h).
const rect = (name, n, x, y, w, h) =>
  ok(name, approx(n.x, x) && approx(n.y, y) && approx(n.w, w) && approx(n.h, h), `got x=${n.x} y=${n.y} w=${n.w} h=${n.h} — want x=${x} y=${y} w=${w} h=${h}`);

const VW = 1000;
const VH = 800;

// ── Column (default direction): children stack vertically, left-aligned ──────────────
{
  const a = box(100, 40);
  const b = box(150, 60);
  const root = el("view", {}, a, b);
  layoutWithYoga(root, VW, VH);
  rect("column root fills viewport", root, 0, 0, VW, VH);
  rect("column child A at top-left", a, 0, 0, 100, 40);
  rect("column child B stacks below A", b, 0, 40, 150, 60);
}

// ── Row direction: children stack horizontally, top-aligned ──────────────────────────
{
  const a = box(100, 40);
  const b = box(150, 60);
  const root = el("view", { style: { direction: "row" } }, a, b);
  layoutWithYoga(root, VW, VH);
  rect("row child A at top-left", a, 0, 0, 100, 40);
  rect("row child B sits right of A", b, 100, 0, 150, 60);
}

// ── padding: root padding offsets the children's inner origin ─────────────────────────
{
  const a = box(100, 40);
  const b = box(100, 40);
  const root = el("view", { style: { padding: 20 } }, a, b);
  layoutWithYoga(root, VW, VH);
  rect("padded child A starts at (pad,pad)", a, 20, 20, 100, 40);
  rect("padded child B stacks below A inside pad", b, 20, 60, 100, 40);
}

// ── gap: adds space between children on the main axis (column) ─────────────────────────
{
  const a = box(100, 40);
  const b = box(100, 40);
  const root = el("view", { style: { gap: 16 } }, a, b);
  layoutWithYoga(root, VW, VH);
  rect("gap child A at top", a, 0, 0, 100, 40);
  rect("gap child B pushed down by gap", b, 0, 56, 100, 40); // 40 (A.h) + 16 (gap)
}

// gap on a row goes on the x axis
{
  const a = box(100, 40);
  const b = box(100, 40);
  const root = el("view", { style: { direction: "row", gap: 25 } }, a, b);
  layoutWithYoga(root, VW, VH);
  rect("row gap child B pushed right by gap", b, 125, 0, 100, 40); // 100 + 25
}

// ── fixed width/height on a CHILD (root is always sized to the viewport by layoutWithYoga,
//    which calls setWidth(vw)/setHeight(vh) after applyStyle — so a fixed child is the place
//    to assert explicit px sizing flows through Yoga). ───────────────────────────────────
{
  const a = box(300, 200);
  const root = el("view", {}, a);
  layoutWithYoga(root, VW, VH);
  rect("root sized to viewport", root, 0, 0, VW, VH);
  rect("fixed-size child keeps its px box", a, 0, 0, 300, 200);
}

// ── width:"stretch" — child fills the cross axis (column ⇒ full inner width) ───────────
{
  const a = el("view", { style: { width: "stretch", height: 40 } });
  const root = el("view", { style: { padding: 10 } }, a);
  layoutWithYoga(root, VW, VH);
  // inner width = VW - 2*pad = 1000 - 20 = 980
  rect("stretch child fills cross axis (inner width)", a, 10, 10, 980, 40);
}

// ── percentage width/height: "50%" of the parent's box ────────────────────────────────
{
  const a = el("view", { style: { width: "50%", height: "50%" } });
  const root = el("view", {}, a);
  layoutWithYoga(root, VW, VH);
  rect("percentage child is 50% of parent", a, 0, 0, VW / 2, VH / 2);
}

// ── justify "center" (column ⇒ vertical centering of the stack) ────────────────────────
{
  const a = box(100, 40);
  const b = box(100, 60);
  const root = el("view", { style: { justify: "center" } }, a, b);
  layoutWithYoga(root, VW, VH);
  // stack height = 40 + 60 = 100; free = 800 - 100 = 700; start = 350
  rect("justify center: A centered vertically", a, 0, 350, 100, 40);
  rect("justify center: B below A", b, 0, 390, 100, 60); // 350 + 40
}

// ── justify "end" (column ⇒ stack pushed to the bottom) ───────────────────────────────
{
  const a = box(100, 40);
  const b = box(100, 60);
  const root = el("view", { style: { justify: "end" } }, a, b);
  layoutWithYoga(root, VW, VH);
  // free = 800 - 100 = 700; A starts at 700
  rect("justify end: A pushed to bottom", a, 0, 700, 100, 40);
  rect("justify end: B at very bottom", b, 0, 740, 100, 60);
}

// ── justify "space-between" on a row ───────────────────────────────────────────────────
{
  const a = box(100, 40);
  const b = box(100, 40);
  const root = el("view", { style: { direction: "row", justify: "space-between" } }, a, b);
  layoutWithYoga(root, VW, VH);
  // two children, ends pinned: A at 0, B at vw - 100 = 900
  rect("space-between: A at start", a, 0, 0, 100, 40);
  rect("space-between: B at far end", b, 900, 0, 100, 40);
}

// ── align "center" (column ⇒ children centered on the cross/x axis) ───────────────────
{
  const a = box(100, 40);
  const root = el("view", { style: { align: "center" } }, a);
  layoutWithYoga(root, VW, VH);
  // cross free = 1000 - 100 = 900; offset = 450
  rect("align center: child centered horizontally", a, 450, 0, 100, 40);
}

// ── align "end" (column ⇒ children pushed to the right edge) ──────────────────────────
{
  const a = box(100, 40);
  const root = el("view", { style: { align: "end" } }, a);
  layoutWithYoga(root, VW, VH);
  rect("align end: child at right edge", a, 900, 0, 100, 40); // 1000 - 100
}

// align "center" on a row ⇒ children centered on the cross/y axis
{
  const a = box(100, 40);
  const root = el("view", { style: { direction: "row", align: "center" } }, a);
  layoutWithYoga(root, VW, VH);
  // cross free = 800 - 40 = 760; offset = 380
  rect("row align center: child centered vertically", a, 0, 380, 100, 40);
}

// ── CRITICAL: hidden-node exclusion ───────────────────────────────────────────────────
// A child with .hidden = true must take NO layout space. Its visible siblings flow as if
// it were absent AND get correct rects. This verifies build() and writeBack() filter
// hidden nodes IDENTICALLY — if their by-index child mapping drifted, visibleB's rect would
// be read from the wrong Yoga child and the assertion would fail.
{
  const visA = box(100, 40);
  const hid = box(999, 999); // would dominate the row if it counted
  const visB = box(120, 40);
  const root = el("view", { style: { direction: "row" } }, visA, hid, visB);
  hid.hidden = true; // set AFTER building (as the Suspense/Activity hooks do)
  layoutWithYoga(root, VW, VH);
  rect("hidden: visible A at start", visA, 0, 0, 100, 40);
  // visB sits immediately after A — the hidden middle child contributed ZERO width.
  rect("hidden: visible B right after A (hidden took no space)", visB, 100, 0, 120, 40);
  // and the hidden node was not laid out into A/B's slots (its rect is untouched 0s or stale)
  ok("hidden node never occupies A's or B's slot", !(approx(hid.x, 0) && approx(hid.w, 100)) && hid.x !== 100, `hidden rect x=${hid.x} w=${hid.w}`);
}

// hidden-node exclusion with gap: the gap is NOT applied for the absent child either.
{
  const visA = box(100, 40);
  const hid = box(100, 40);
  const visB = box(100, 40);
  const root = el("view", { style: { direction: "row", gap: 30 } }, visA, hid, visB);
  hid.hidden = true;
  layoutWithYoga(root, VW, VH);
  // only ONE gap between the two visible children: B at 100 + 30 = 130, not 260.
  rect("hidden+gap: B placed with a single gap after A", visB, 130, 0, 100, 40);
}

// hidden FIRST child: visible siblings still anchor at the origin.
{
  const hid = box(100, 40);
  const visA = box(100, 40);
  const visB = box(100, 40);
  const root = el("view", {}, hid, visA, visB);
  hid.hidden = true;
  layoutWithYoga(root, VW, VH);
  rect("hidden-first: A anchors at origin", visA, 0, 0, 100, 40);
  rect("hidden-first: B stacks below A", visB, 0, 40, 100, 40);
}

// ── measureText(text, style) from layout.ts — uses the deterministic fake canvas ──────
// measureWidth("abcd",{fontSize:16}) === 4*16*0.5 === 32, so w = ceil(32)+2 = 34.
// h = ceil(fontSize * 1.32).
{
  const m4 = measureText("abcd", { fontSize: 16 });
  ok("measureText width = ceil(advance)+2", m4.w === 34, `got w=${m4.w}`);
  ok("measureText height = ceil(fontSize*1.32)", m4.h === Math.ceil(16 * 1.32), `got h=${m4.h} want ${Math.ceil(16 * 1.32)}`);

  // width grows with text length (8px per glyph at size 16)
  const m1 = measureText("a", { fontSize: 16 });
  const m8 = measureText("abcdefgh", { fontSize: 16 });
  ok("measureText width grows with length", m1.w < m4.w && m4.w < m8.w, `w1=${m1.w} w4=${m4.w} w8=${m8.w}`);
  ok("measureText width is linear in length", m8.w - 2 === 2 * (m4.w - 2), `w4=${m4.w} w8=${m8.w}`); // strip the +2 box pad

  // height scales with fontSize, independent of text length
  const big = measureText("abcd", { fontSize: 32 });
  ok("measureText height scales with fontSize", big.h === Math.ceil(32 * 1.32) && big.h > m4.h, `got h=${big.h}`);
  ok("measureText height ignores text length", measureText("x", { fontSize: 16 }).h === m4.h, "height should not depend on length");
}

process.exit(done("layout (yoga + measureText)"));
