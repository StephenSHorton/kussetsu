// Deterministic, headless tests for kussetsu/core/text.ts — LTR text geometry.
//
// helpers.mjs (imported FIRST) installs a fake 2D canvas: every glyph advances
// `fontSize * UNIT` px, UNIT = 0.5. So at fontSize 16 each char is 8px and prefix
// widths are exact multiples of 8 — wrap/caret/hit/selection math is fully predictable.
// Run: `node test/text.test.mjs`  (Node ≥23 strips TS types + resolves the .ts import).
import { makeHarness, approx, approxArr, UNIT } from "./helpers.mjs";
import { measureWidth, wrapText, hitTest, selectionRects, caretRect } from "../src/core/text.ts";

const { ok, done } = makeHarness();

// lineHeight the impl uses: round(fontSize * 1.45). At 16 → 23.
const LH = (size = 16) => Math.round(size * 1.45);

// ── sanity: the fake canvas constants we rely on ───────────────────────────────────
ok("UNIT is 0.5", UNIT === 0.5, `UNIT=${UNIT}`);

// ── measureWidth ───────────────────────────────────────────────────────────────────
ok("measureWidth sums per-glyph advances (abcd@16 === 32)", measureWidth("abcd", { fontSize: 16 }) === 32, `got ${measureWidth("abcd", { fontSize: 16 })}`);
ok("measureWidth empty string === 0", measureWidth("", { fontSize: 16 }) === 0);
ok("measureWidth single glyph @16 === 8", measureWidth("a", { fontSize: 16 }) === 8);

// fontSize scaling: glyph advance is fontSize * 0.5
ok("measureWidth scales with fontSize (abcd@32 === 64)", measureWidth("abcd", { fontSize: 32 }) === 64, `got ${measureWidth("abcd", { fontSize: 32 })}`);
ok("measureWidth abc@24 === 36", measureWidth("abc", { fontSize: 24 }) === 36, `got ${measureWidth("abc", { fontSize: 24 })}`);
// default fontSize is 16 when omitted
ok("measureWidth default fontSize === 16 (ab === 16)", measureWidth("ab", {}) === 16, `got ${measureWidth("ab", {})}`);

// letterSpacing: added AFTER each glyph (tracking) — including after the last
ok("measureWidth letterSpacing added after each glyph (ab ls3@16 === 22)", measureWidth("ab", { fontSize: 16, letterSpacing: 3 }) === 22, `got ${measureWidth("ab", { fontSize: 16, letterSpacing: 3 })}`);
ok("measureWidth letterSpacing applies to single glyph (a ls5@16 === 13)", measureWidth("a", { fontSize: 16, letterSpacing: 5 }) === 13, `got ${measureWidth("a", { fontSize: 16, letterSpacing: 5 })}`);
// 4 glyphs @16 (32) + 4*2 tracking (8) = 40
ok("measureWidth abcd ls2@16 === 40", measureWidth("abcd", { fontSize: 16, letterSpacing: 2 }) === 40, `got ${measureWidth("abcd", { fontSize: 16, letterSpacing: 2 })}`);

// ── wrapText: single line, no wrap, no newline ──────────────────────────────────────
{
  const w = wrapText("abcd", 1000, { fontSize: 16 });
  ok("wrap single line: 1 line", w.lines.length === 1, `got ${w.lines.length}`);
  const L = w.lines[0];
  ok("wrap single line: text", L.text === "abcd");
  ok("wrap single line: startOffset 0", L.startOffset === 0);
  ok("wrap single line: endOffset === text.length", L.endOffset === 4, `got ${L.endOffset}`);
  ok("wrap single line: y === 0", L.y === 0);
  ok("wrap single line: height === lineHeight(23)", L.height === LH(), `got ${L.height}`);
  // xs has length text.length + 1, xs[i] === i*8
  ok("wrap single line: xs length === text.length+1", L.xs.length === 5, `got ${L.xs.length}`);
  ok("wrap single line: xs[i] === i*8", approxArr(L.xs, [0, 8, 16, 24, 32]), `got ${JSON.stringify(L.xs)}`);
  // WrapResult width/height
  ok("wrap single line: width === max line width (32)", w.width === 32, `got ${w.width}`);
  ok("wrap single line: height === lines*lineHeight (23)", w.height === LH(), `got ${w.height}`);
}

// ── wrapText: multi-paragraph "a\nb" (explicit newline) ─────────────────────────────
{
  const w = wrapText("a\nb", 1000, { fontSize: 16 });
  ok("wrap a\\nb: 2 lines", w.lines.length === 2, `got ${w.lines.length}`);
  const [l0, l1] = w.lines;
  ok("wrap a\\nb: line0 text 'a'", l0.text === "a");
  ok("wrap a\\nb: line0 startOffset 0", l0.startOffset === 0);
  ok("wrap a\\nb: line0 endOffset 1", l0.endOffset === 1, `got ${l0.endOffset}`);
  ok("wrap a\\nb: line0 y 0", l0.y === 0);
  // the '\n' at index 1 is skipped → line1 starts at offset 2 (offset = p+1)
  ok("wrap a\\nb: line1 text 'b'", l1.text === "b");
  ok("wrap a\\nb: line1 startOffset 2 (newline skipped)", l1.startOffset === 2, `got ${l1.startOffset}`);
  ok("wrap a\\nb: line1 endOffset 3", l1.endOffset === 3, `got ${l1.endOffset}`);
  ok("wrap a\\nb: line1 y === lineIndex*lineHeight (23)", l1.y === 1 * LH(), `got ${l1.y}`);
  ok("wrap a\\nb: line1 xs", approxArr(l1.xs, [0, 8]), `got ${JSON.stringify(l1.xs)}`);
  ok("wrap a\\nb: result height 2*23", w.height === 2 * LH(), `got ${w.height}`);
}

// ── wrapText: a long line that wraps (greedy word-wrap at maxWidth) ──────────────────
// "aa bb cc" → each char 8px. Adding "cc" makes measure("aa bb cc")=64 > 50, so it
// breaks before "cc". The trailing space stays on line 0 (segmenter keeps spaces).
{
  const w = wrapText("aa bb cc", 50, { fontSize: 16 });
  ok("wrap long: 2 lines", w.lines.length === 2, `got ${w.lines.length}`);
  const [l0, l1] = w.lines;
  ok("wrap long: line0 text 'aa bb '", l0.text === "aa bb ", `got ${JSON.stringify(l0.text)}`);
  ok("wrap long: line0 startOffset 0", l0.startOffset === 0);
  ok("wrap long: line0 endOffset 6", l0.endOffset === 6, `got ${l0.endOffset}`);
  ok("wrap long: line0 y 0", l0.y === 0);
  ok("wrap long: line0 xs (0..48 step 8)", approxArr(l0.xs, [0, 8, 16, 24, 32, 40, 48]), `got ${JSON.stringify(l0.xs)}`);
  ok("wrap long: line0 xs length === text.length+1", l0.xs.length === l0.text.length + 1);
  // No '\n' between lines here, so line1 starts exactly where line0 ended (no +1 skip).
  ok("wrap long: line1 text 'cc'", l1.text === "cc", `got ${JSON.stringify(l1.text)}`);
  ok("wrap long: line1 startOffset 6 (contiguous, no newline)", l1.startOffset === 6, `got ${l1.startOffset}`);
  ok("wrap long: line1 endOffset 8", l1.endOffset === 8, `got ${l1.endOffset}`);
  ok("wrap long: line1 y === 23", l1.y === LH(), `got ${l1.y}`);
  ok("wrap long: line1 xs", approxArr(l1.xs, [0, 8, 16]), `got ${JSON.stringify(l1.xs)}`);
  // width = max final xs across lines = line0 final = 48; height 2*23
  ok("wrap long: result width 48", w.width === 48, `got ${w.width}`);
  ok("wrap long: result height 46", w.height === 2 * LH(), `got ${w.height}`);
}

// ── synthetic WrapResult builder — gives us xs arrays we fully control ───────────────
// One line of 4 chars @16: xs = [0,8,16,24,32], y=0, height=23.
function lineOf(text, startOffset, y, height, xs) {
  return { text, startOffset, endOffset: startOffset + text.length, y, height, xs };
}
function synthWrap(lines) {
  const width = Math.ceil(lines.reduce((mx, l) => Math.max(mx, l.xs[l.xs.length - 1] ?? 0), 0));
  return { lines, width, height: lines.reduce((s, l) => s + l.height, 0) };
}

// ── hitTest ─────────────────────────────────────────────────────────────────────────
{
  // single line "abcd": xs [0,8,16,24,32], y 0, height 23, startOffset 0, endOffset 4
  const w = wrapText("abcd", 1000, { fontSize: 16 });
  const L = w.lines[0];
  const midY = L.y + 1;
  // x before line start → startOffset
  ok("hitTest x<=xs[0] → startOffset", hitTest(w, -5, midY) === L.startOffset, `got ${hitTest(w, -5, midY)}`);
  ok("hitTest x===0 → startOffset", hitTest(w, 0, midY) === L.startOffset);
  // x past end → endOffset
  ok("hitTest x>=last → endOffset", hitTest(w, 999, midY) === L.endOffset, `got ${hitTest(w, 999, midY)}`);
  ok("hitTest x===lastXs → endOffset", hitTest(w, 32, midY) === L.endOffset);
  // mid-x rounds to NEAREST boundary. Impl tie-break: dist to lo <= dist to hi → lo.
  // Between xs[0]=0 and xs[1]=8: at x=3 → nearer 0 → idx 0.
  ok("hitTest x=3 (nearer 0) → 0", hitTest(w, 3, midY) === 0, `got ${hitTest(w, 3, midY)}`);
  // at x=5 → nearer 8 → idx 1
  ok("hitTest x=5 (nearer 8) → 1", hitTest(w, 5, midY) === 1, `got ${hitTest(w, 5, midY)}`);
  // TIE at x=4: equidistant; impl uses `<=` so picks lo → idx 0
  ok("hitTest tie x=4 → lo (0)", hitTest(w, 4, midY) === 0, `got ${hitTest(w, 4, midY)}`);
  // tie at x=12 (between 8 and 16) → lo → idx 1
  ok("hitTest tie x=12 → lo (1)", hitTest(w, 12, midY) === 1, `got ${hitTest(w, 12, midY)}`);
  // x=20 (between 16 and 24) is the exact midpoint → TIE → lo (idx 2)
  ok("hitTest tie x=20 → lo (2)", hitTest(w, 20, midY) === 2, `got ${hitTest(w, 20, midY)}`);
  // x=21 (between 16 and 24), nearer 24 → idx 3
  ok("hitTest x=21 → 3", hitTest(w, 21, midY) === 3, `got ${hitTest(w, 21, midY)}`);
}

// hitTest multi-line: line-by-y selection, and offset is line.startOffset + idx
{
  // synthetic two lines: line0 "ab" startOffset 0 xs[0,8,16] y0 h23, line1 "cd" startOffset 5 xs[0,8,16] y23 h23
  const wrap = synthWrap([
    lineOf("ab", 0, 0, 23, [0, 8, 16]),
    lineOf("cd", 5, 23, 23, [0, 8, 16]),
  ]);
  // y inside line0 band (< 0+23) → line0
  ok("hitTest multiline: y=10 picks line0 → its offsets", hitTest(wrap, 4, 10) === 0, `got ${hitTest(wrap, 4, 10)}`);
  ok("hitTest multiline: y=10 end → endOffset 2", hitTest(wrap, 99, 10) === 2, `got ${hitTest(wrap, 99, 10)}`);
  // y inside line1 band (>=23, <46) → line1; idx + startOffset 5
  ok("hitTest multiline: y=30 start → line1.startOffset 5", hitTest(wrap, -1, 30) === 5, `got ${hitTest(wrap, -1, 30)}`);
  ok("hitTest multiline: y=30 mid → 5 + nearest idx", hitTest(wrap, 5, 30) === 6, `got ${hitTest(wrap, 5, 30)}`);
  ok("hitTest multiline: y=30 end → endOffset 7", hitTest(wrap, 99, 30) === 7, `got ${hitTest(wrap, 99, 30)}`);
  // y below all lines → falls through to last line (loop default)
  ok("hitTest multiline: y huge → last line endOffset", hitTest(wrap, 99, 999) === 7, `got ${hitTest(wrap, 99, 999)}`);
}

// ── selectionRects ──────────────────────────────────────────────────────────────────
{
  const w = wrapText("abcd", 1000, { fontSize: 16 }); // one line xs [0,8,16,24,32]
  // empty when start === end
  ok("selectionRects empty when start===end", selectionRects(w, 2, 2).length === 0);
  // band within a line: [1,3) → x from xs[1]=8 to xs[3]=24, w=16
  const r = selectionRects(w, 1, 3);
  ok("selectionRects single band: 1 rect", r.length === 1, `got ${r.length}`);
  ok("selectionRects single band: x===xs[1]=8", r[0].x === 8, `got ${r[0].x}`);
  ok("selectionRects single band: w===16", r[0].w === 16, `got ${r[0].w}`);
  ok("selectionRects single band: y===line.y(0)", r[0].y === 0);
  ok("selectionRects single band: h===lineHeight(23)", r[0].h === LH(), `got ${r[0].h}`);
  // reversed start/end normalized (start>end)
  const rRev = selectionRects(w, 3, 1);
  ok("selectionRects normalizes reversed range", rRev.length === 1 && rRev[0].x === 8 && rRev[0].w === 16, JSON.stringify(rRev));
  // full-line selection [0,4) → x 0, w 32
  const rFull = selectionRects(w, 0, 4);
  ok("selectionRects full line: x0 w32", rFull[0].x === 0 && rFull[0].w === 32, JSON.stringify(rFull[0]));
}

// selectionRects spanning multiple lines → one rect per line, clamped to each line's range
{
  // line0 "abc" startOffset 0 xs[0,8,16,24] y0 h23; line1 "de" startOffset 3 xs[0,8,16] y23 h23
  const wrap = synthWrap([
    lineOf("abc", 0, 0, 23, [0, 8, 16, 24]),
    lineOf("de", 3, 23, 23, [0, 8, 16]),
  ]);
  // select [1,4): line0 covers [1,3) → x xs[1]=8..xs[3]=24 (w16); line1 covers [3,4) → x xs[0]=0..xs[1]=8 (w8)
  const r = selectionRects(wrap, 1, 4);
  ok("selectionRects multiline: 2 rects", r.length === 2, `got ${r.length}`);
  ok("selectionRects multiline: line0 rect x8 w16 y0", r[0].x === 8 && r[0].w === 16 && r[0].y === 0, JSON.stringify(r[0]));
  ok("selectionRects multiline: line1 rect x0 w8 y23", r[1].x === 0 && r[1].w === 8 && r[1].y === 23, JSON.stringify(r[1]));
  // a line fully outside the range contributes no rect
  const r2 = selectionRects(wrap, 0, 2); // only line0
  ok("selectionRects multiline: range only in line0 → 1 rect", r2.length === 1 && r2[0].x === 0 && r2[0].w === 16, JSON.stringify(r2));
}

// ── caretRect ────────────────────────────────────────────────────────────────────────
{
  const w = wrapText("abcd", 1000, { fontSize: 16 }); // xs [0,8,16,24,32]
  const c0 = caretRect(w, 0);
  ok("caretRect offset 0: x===xs[0]=0", c0.x === 0);
  ok("caretRect offset 0: y===line.y(0)", c0.y === 0);
  ok("caretRect offset 0: w===2", c0.w === 2);
  ok("caretRect offset 0: h===lineHeight(23)", c0.h === LH(), `got ${c0.h}`);
  const c2 = caretRect(w, 2);
  ok("caretRect offset 2: x===xs[2]=16", c2.x === 16, `got ${c2.x}`);
  const c4 = caretRect(w, 4); // end of line
  ok("caretRect offset 4 (end): x===xs[4]=32", c4.x === 32, `got ${c4.x}`);
  ok("caretRect offset 4: w===2 h===23", c4.w === 2 && c4.h === LH());
}

// caretRect at line boundaries across multiple lines
{
  // line0 "ab" startOffset 0 xs[0,8,16] y0 h23; line1 "cd" startOffset 2 xs[0,8,16] y23 h23
  const wrap = synthWrap([
    lineOf("ab", 0, 0, 23, [0, 8, 16]),
    lineOf("cd", 2, 23, 23, [0, 8, 16]),
  ]);
  // offset 2 is in both line0 (endOffset 2) and line1 (startOffset 2). The loop picks the
  // FIRST line where startOffset<=offset<=endOffset → line0. x===xs[2]=16 on line0, y0.
  const cBoundary = caretRect(wrap, 2);
  ok("caretRect boundary offset 2 → first matching line (line0)", cBoundary.x === 16 && cBoundary.y === 0, JSON.stringify(cBoundary));
  // offset 3 is only in line1: i = 3-2 = 1 → xs[1]=8, y23
  const c3 = caretRect(wrap, 3);
  ok("caretRect offset 3 → line1 x===xs[1]=8 y23", c3.x === 8 && c3.y === 23, JSON.stringify(c3));
  // offset 4 = line1 endOffset → x===xs[2]=16, y23
  const c4 = caretRect(wrap, 4);
  ok("caretRect offset 4 → line1 end x===xs[2]=16 y23", c4.x === 16 && c4.y === 23, JSON.stringify(c4));
  // offset clamped: offset beyond end uses last matching line + clamp to text.length
  // offset 0 → line0 start, x0 y0
  const c0 = caretRect(wrap, 0);
  ok("caretRect offset 0 → line0 x0 y0", c0.x === 0 && c0.y === 0, JSON.stringify(c0));
}

process.exit(done("text.ts geometry"));
