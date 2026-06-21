// Real layout: drives Facebook's Yoga (production flexbox, WASM) from our scene
// tree — replacing the hand-rolled flexbox. Rebuild a Yoga mirror each pass, read
// computed rects back (accumulating parent offsets, since Yoga is parent-relative),
// and freeRecursive() — nodes are NOT garbage-collected in v3.
//
// Verified against yoga-layout@3.2.1: default import is ready synchronously
// (the module top-level-awaits the WASM); enums are named exports.
import Yoga, { Align, Direction, Edge, FlexDirection, Gutter, Justify, MeasureMode, PositionType, Wrap } from "yoga-layout";
import type { Node as YogaNode } from "yoga-layout";
import { type ElementNode, type Style, textOf } from "./scene";
import { measureText } from "./layout";

// Yoga calls the measure func 2-4x per text node per pass — memoize it (this, not
// Yoga's C++ core, is the 60fps cliff).
const measureCache = new Map<string, { w: number; h: number }>();
function measure(text: string, s: Style): { w: number; h: number } {
  const key = `${s.fontSize ?? 16}|${s.fontWeight ?? 400}|${text}`;
  let m = measureCache.get(key);
  if (!m) {
    m = measureText(text, s);
    measureCache.set(key, m);
  }
  return m;
}

const FLEX_DIR = { row: FlexDirection.Row, column: FlexDirection.Column } as const;
const JUSTIFY = { start: Justify.FlexStart, center: Justify.Center, end: Justify.FlexEnd } as const;
const ALIGN = { start: Align.FlexStart, center: Align.Center, end: Align.FlexEnd } as const;

function applyStyle(yn: YogaNode, s: Style = {}): void {
  // Defaults match the old hand-rolled engine: column, main/cross start (NOT
  // Yoga's default Stretch) — children fill cross-axis only via width:"stretch".
  yn.setFlexDirection(FLEX_DIR[s.direction ?? "column"]);
  yn.setJustifyContent(JUSTIFY[s.justify ?? "start"]);
  yn.setAlignItems(ALIGN[s.align ?? "start"]);
  if (s.wrap) yn.setFlexWrap(Wrap.Wrap);
  if (s.padding) yn.setPadding(Edge.All, s.padding);
  if (s.gap) yn.setGap(Gutter.All, s.gap);

  if (typeof s.width === "number") yn.setWidth(s.width);
  else if (s.width === "stretch") yn.setAlignSelf(Align.Stretch);
  if (typeof s.height === "number") yn.setHeight(s.height);
  if (typeof s.grow === "number") yn.setFlexGrow(s.grow);
  if (typeof s.shrink === "number") yn.setFlexShrink(s.shrink);
  if (typeof s.minWidth === "number") yn.setMinWidth(s.minWidth);

  if (s.absolute) {
    yn.setPositionType(PositionType.Absolute);
    yn.setPosition(Edge.Left, s.absolute.x);
    yn.setPosition(Edge.Top, s.absolute.y);
  }
}

function build(scene: ElementNode): YogaNode {
  const yn = Yoga.Node.create();
  applyStyle(yn, scene.props.style);

  if (scene.type === "text") {
    // A measured leaf — Yoga forbids children on a node with a measure func, so
    // we fold the text-node children into one measured string.
    const str = textOf(scene);
    const st = scene.props.style ?? {};
    yn.setMeasureFunc((availW, widthMode) => {
      const m = measure(str, st);
      let w = m.w;
      if (widthMode === MeasureMode.Exactly) w = availW;
      else if (widthMode === MeasureMode.AtMost) w = Math.min(m.w, availW);
      // --- WRAPPING SLOT --- real line-breaking (Parley) returns a multi-line
      // block here when widthMode is AtMost/Exactly; single-line for now.
      return { width: w, height: m.h };
    });
    return yn;
  }

  let i = 0;
  for (const c of scene.children) {
    if (c.kind === "element") yn.insertChild(build(c), i++);
  }
  return yn;
}

// getComputedLeft/Top are relative to the parent (padding already folded in), so
// absolute coords accumulate: absChild = absParent + childComputed.
function writeBack(scene: ElementNode, yn: YogaNode, absL: number, absT: number): void {
  const x = absL + yn.getComputedLeft();
  const y = absT + yn.getComputedTop();
  scene.x = x;
  scene.y = y;
  scene.w = yn.getComputedWidth();
  scene.h = yn.getComputedHeight();
  if (scene.type === "text") return;
  let i = 0;
  for (const c of scene.children) {
    if (c.kind === "element") writeBack(c, yn.getChild(i++), x, y);
  }
}

/** Lay out `root` to fill (vw, vh) using Yoga, writing x/y/w/h onto every node. */
export function layoutWithYoga(root: ElementNode, vw: number, vh: number): void {
  const yRoot = build(root);
  yRoot.setWidth(vw);
  yRoot.setHeight(vh);
  yRoot.calculateLayout(vw, vh, Direction.LTR);
  writeBack(root, yRoot, 0, 0);
  yRoot.freeRecursive(); // WASM nodes are NOT GC'd — must free every pass
}
