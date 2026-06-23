// Shared helpers for the pure-layer unit tests (color / text geometry / layout / collect).
//
// These modules are GPU-free but `text.ts`'s charAdvance measures glyphs via a 2D canvas
// (document.createElement). In headless Node there's no DOM, so importing THIS module installs
// a DETERMINISTIC fake canvas: every glyph advances `size * UNIT` px (UNIT = 0.5), so a char at
// fontSize 16 is 8px wide and prefix widths are exact multiples — wrap/caret/hit math becomes
// predictable. Import this BEFORE any text measurement runs (charAdvance reads document lazily).
export const UNIT = 0.5; // px per (font-size px) per glyph, in the fake canvas

let installed = false;
export function installFakeCanvas() {
  if (installed) return;
  installed = true;
  const ctx = {
    font: "16px sans-serif",
    measureText(s) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
      const size = m ? parseFloat(m[1]) : 16;
      // count code points (matches `for (const ch of text)` in measureWidth)
      return { width: [...s].length * size * UNIT };
    },
  };
  globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
}
installFakeCanvas(); // side-effect on import — the common case

// ── tiny assertion harness (same shape as the other test files) ─────────────────────
export function makeHarness() {
  let pass = 0,
    fail = 0;
  const ok = (name, cond, detail) => {
    if (cond) pass++;
    else {
      fail++;
      console.log(`  ✗ ${name}${detail != null ? `\n      ${detail}` : ""}`);
    }
  };
  const done = (label) => {
    console.log(`${fail === 0 ? "✓" : "✗"} ${label} — ${pass} passed, ${fail} failed`);
    return fail;
  };
  return { ok, done };
}

// float-tolerant compares
export const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
export const approxArr = (a, b, eps = 1e-6) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => approx(x, b[i], eps));

// ── scene-tree builders (plain host nodes, as the reconciler would produce) ──────────
import { newElement, newText } from "../src/core/scene.ts";

/** el("view"|"text", props?, ...children) — children may be nested els or raw strings. */
export function el(type, props, ...kids) {
  const n = newElement(type, props ?? {});
  for (const k of kids) {
    const child = typeof k === "string" ? newText(k) : k;
    child.parent = n;
    n.children.push(child);
  }
  return n;
}
export const txt = (s) => newText(s);

/** A fake host container (no real canvas needed for layout/collect). */
export const container = (children = []) => ({ kind: "container", canvas: {}, children, dirty: false });

/** Manually stamp computed layout (x,y,w,h) on a node — to isolate collect's camera/scroll
 *  math from the layout engine. */
export function placed(node, x, y, w, h) {
  node.x = x;
  node.y = y;
  node.w = w;
  node.h = h;
  return node;
}
