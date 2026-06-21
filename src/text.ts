// Text model for selection + wrapping (LTR). Glyph SHAPES are still browser-drawn
// (fillText); this adds the geometry the whole-string texture can't give: line
// wrapping (Intl.Segmenter, Baseline) + per-character x positions (prefix
// measureText, which is correctly kerned because each prefix is browser-shaped).
// Selection is two integer offsets into the logical string; everything visual is
// derived. Bidi / complex-script carets are deliberately out of scope (LTR only).
import type { Style } from "./scene";

export interface VisualLine {
  text: string;
  startOffset: number; // offset of line[0] in the full logical string
  endOffset: number; // exclusive (not counting a trailing hard break)
  y: number; // top, relative to the text node
  height: number;
  xs: number[]; // x of each char boundary; length = text.length + 1
}

export interface WrapResult {
  lines: VisualLine[];
  width: number;
  height: number;
}

export interface LocalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function fontStr(s: Style): string {
  return `${s.fontWeight ?? 400} ${s.fontSize ?? 16}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
}

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, s: Style): number {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  ctx!.font = fontStr(s);
  return ctx!.measureText(text).width;
}

const wordSeg = new Intl.Segmenter(undefined, { granularity: "word" });

function buildLine(text: string, startOffset: number, y: number, height: number, s: Style): VisualLine {
  const xs = [0];
  // Prefix-measure each boundary (kerned). O(n^2) per line — fine for UI text; the
  // whole WrapResult is cached on the node.
  for (let i = 1; i <= text.length; i++) xs.push(measure(text.slice(0, i), s));
  return { text, startOffset, endOffset: startOffset + text.length, y, height, xs };
}

/** Greedy word-wrap at maxWidth, splitting on explicit newlines. Offsets are
 *  global into `text`. (Long single words overflow rather than break — rare in UI.) */
export function wrapText(text: string, maxWidth: number, s: Style): WrapResult {
  const lineHeight = Math.round((s.fontSize ?? 16) * 1.45);
  const lines: VisualLine[] = [];
  let offset = 0;
  for (const paragraph of text.split("\n")) {
    let cur = "";
    let curStart = offset;
    let p = offset;
    for (const seg of wordSeg.segment(paragraph)) {
      const w = seg.segment;
      if (cur && measure(cur + w, s) > maxWidth) {
        lines.push(buildLine(cur, curStart, lines.length * lineHeight, lineHeight, s));
        cur = "";
        curStart = p;
      }
      cur += w;
      p += w.length;
    }
    lines.push(buildLine(cur, curStart, lines.length * lineHeight, lineHeight, s));
    offset = p + 1; // skip the '\n'
  }
  const width = lines.reduce((mx, l) => Math.max(mx, l.xs[l.xs.length - 1] ?? 0), 0);
  return { lines, width: Math.ceil(width), height: lines.length * lineHeight };
}

/** Pointer (local px) -> caret offset. Pick line by y, binary-search xs. */
export function hitTest(wrap: WrapResult, localX: number, localY: number): number {
  let line = wrap.lines[wrap.lines.length - 1];
  for (const L of wrap.lines) {
    if (localY < L.y + L.height) {
      line = L;
      break;
    }
  }
  if (!line) return 0;
  const xs = line.xs;
  if (localX <= xs[0]) return line.startOffset;
  if (localX >= xs[xs.length - 1]) return line.endOffset;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= localX) lo = mid;
    else hi = mid;
  }
  const idx = localX - xs[lo] <= xs[hi] - localX ? lo : hi;
  return line.startOffset + idx;
}

/** Highlight bands for [start,end), in local px. */
export function selectionRects(wrap: WrapResult, start: number, end: number): LocalRect[] {
  if (start === end) return [];
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  const out: LocalRect[] = [];
  for (const L of wrap.lines) {
    const a = Math.max(s, L.startOffset);
    const b = Math.min(e, L.endOffset);
    if (a >= b) continue;
    const x0 = L.xs[a - L.startOffset];
    const x1 = L.xs[b - L.startOffset];
    out.push({ x: x0, y: L.y, w: x1 - x0, h: L.height });
  }
  return out;
}

export function caretRect(wrap: WrapResult, offset: number): LocalRect {
  let line = wrap.lines[0];
  for (const L of wrap.lines) {
    if (offset >= L.startOffset && offset <= L.endOffset) {
      line = L;
      break;
    }
  }
  if (!line) return { x: 0, y: 0, w: 2, h: 16 };
  const i = Math.max(0, Math.min(line.text.length, offset - line.startOffset));
  return { x: line.xs[i], y: line.y, w: 2, h: line.height };
}
