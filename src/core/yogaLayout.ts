// Real layout: drives Facebook's Yoga (production flexbox, WASM) from our scene
// tree — replacing the hand-rolled flexbox. Rebuild a Yoga mirror each pass, read
// computed rects back (accumulating parent offsets, since Yoga is parent-relative),
// and freeRecursive() — nodes are NOT garbage-collected in v3.
//
// Verified against yoga-layout@3.2.1: default import is ready synchronously
// (the module top-level-awaits the WASM); enums are named exports.
import Yoga, { Align, Direction, Edge, FlexDirection, Gutter, Justify, MeasureMode, PositionType, Wrap } from "yoga-layout";
import type { Node as YogaNode } from "yoga-layout";
import { type ElementNode, type Size, type Style, textOf } from "./scene.ts";
import { measureText } from "./layout.ts";
import { wrapText } from "./text.ts";

// When true, every text node keeps full wrap geometry so page-wide text selection works.
let selectableAll = false;

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
const JUSTIFY = {
  start: Justify.FlexStart,
  center: Justify.Center,
  end: Justify.FlexEnd,
  "space-between": Justify.SpaceBetween,
  "space-around": Justify.SpaceAround,
  "space-evenly": Justify.SpaceEvenly,
} as const;
const ALIGN = { start: Align.FlexStart, center: Align.Center, end: Align.FlexEnd } as const;

// Apply a Size (a px number or a "NN%" string) to a Yoga dimension via its px / percent setters.
function setSize(v: Size | undefined, px: (n: number) => void, pct: (n: number) => void): void {
  if (typeof v === "number") px(v);
  else if (typeof v === "string") pct(parseFloat(v));
}

function applyStyle(yn: YogaNode, s: Style = {}): void {
  // Defaults match the old hand-rolled engine: column, main/cross start (NOT
  // Yoga's default Stretch) — children fill cross-axis only via width:"stretch".
  yn.setFlexDirection(FLEX_DIR[s.direction ?? "column"]);
  yn.setJustifyContent(JUSTIFY[s.justify ?? "start"]);
  yn.setAlignItems(ALIGN[s.align ?? "start"]);
  if (s.wrap) yn.setFlexWrap(Wrap.Wrap);
  // Padding: All < Horizontal/Vertical < per-side — Yoga resolves edge specificity, so
  // setting several lets the more specific one win (e.g. padding + paddingTop).
  if (s.padding != null) yn.setPadding(Edge.All, s.padding);
  if (s.paddingX != null) yn.setPadding(Edge.Horizontal, s.paddingX);
  if (s.paddingY != null) yn.setPadding(Edge.Vertical, s.paddingY);
  if (s.paddingTop != null) yn.setPadding(Edge.Top, s.paddingTop);
  if (s.paddingRight != null) yn.setPadding(Edge.Right, s.paddingRight);
  if (s.paddingBottom != null) yn.setPadding(Edge.Bottom, s.paddingBottom);
  if (s.paddingLeft != null) yn.setPadding(Edge.Left, s.paddingLeft);
  // Margin: same All < Horizontal/Vertical < per-side specificity (space OUTSIDE the box).
  if (s.margin != null) yn.setMargin(Edge.All, s.margin);
  if (s.marginX != null) yn.setMargin(Edge.Horizontal, s.marginX);
  if (s.marginY != null) yn.setMargin(Edge.Vertical, s.marginY);
  if (s.marginTop != null) yn.setMargin(Edge.Top, s.marginTop);
  if (s.marginRight != null) yn.setMargin(Edge.Right, s.marginRight);
  if (s.marginBottom != null) yn.setMargin(Edge.Bottom, s.marginBottom);
  if (s.marginLeft != null) yn.setMargin(Edge.Left, s.marginLeft);
  // Gap: both axes, then per-axis override.
  if (s.gap != null) yn.setGap(Gutter.All, s.gap);
  if (s.rowGap != null) yn.setGap(Gutter.Row, s.rowGap);
  if (s.columnGap != null) yn.setGap(Gutter.Column, s.columnGap);

  // Sizing: a px number, a "NN%" of the parent, or (width only) "stretch" = fill the cross axis.
  if (typeof s.width === "number") yn.setWidth(s.width);
  else if (s.width === "stretch") yn.setAlignSelf(Align.Stretch);
  else if (typeof s.width === "string") yn.setWidthPercent(parseFloat(s.width));
  setSize(s.height, (n) => yn.setHeight(n), (n) => yn.setHeightPercent(n));
  setSize(s.basis, (n) => yn.setFlexBasis(n), (n) => yn.setFlexBasisPercent(n));
  setSize(s.minWidth, (n) => yn.setMinWidth(n), (n) => yn.setMinWidthPercent(n));
  setSize(s.maxWidth, (n) => yn.setMaxWidth(n), (n) => yn.setMaxWidthPercent(n));
  setSize(s.minHeight, (n) => yn.setMinHeight(n), (n) => yn.setMinHeightPercent(n));
  setSize(s.maxHeight, (n) => yn.setMaxHeight(n), (n) => yn.setMaxHeightPercent(n));
  if (typeof s.grow === "number") yn.setFlexGrow(s.grow);
  if (typeof s.shrink === "number") yn.setFlexShrink(s.shrink);

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
      const constrained = (widthMode === MeasureMode.AtMost || widthMode === MeasureMode.Exactly) && Number.isFinite(availW) && availW > 0;
      if (constrained) {
        const single = measure(str, st);
        // selectable text always keeps wrap geometry (so even single-line is selectable)
        if (!scene.props.selectable && !selectableAll && single.w <= availW && !str.includes("\n")) {
          scene.wrapped = undefined; // fits on one line
          return { width: widthMode === MeasureMode.Exactly ? availW : single.w, height: single.h };
        }
        // Word-wrap (Intl.Segmenter) — fills what was the WRAPPING SLOT. The result
        // is cached on the node for rendering + selection geometry.
        const wrap = wrapText(str, availW, st);
        scene.wrapped = { width: availW, result: wrap };
        return { width: widthMode === MeasureMode.Exactly ? availW : Math.min(availW, wrap.width), height: wrap.height };
      }
      scene.wrapped = undefined;
      const m = measure(str, st);
      return { width: m.w, height: m.h };
    });
    return yn;
  }

  let i = 0;
  for (const c of scene.children) {
    if (c.kind === "element" && !c.hidden) yn.insertChild(build(c), i++);
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
    if (c.kind === "element" && !c.hidden) writeBack(c, yn.getChild(i++), x, y);
  }
}

/** Lay out `root` to fill (vw, vh) using Yoga, writing x/y/w/h onto every node. */
export function layoutWithYoga(root: ElementNode, vw: number, vh: number, allSelectable = false): void {
  selectableAll = allSelectable;
  const yRoot = build(root);
  yRoot.setWidth(vw);
  yRoot.setHeight(vh);
  yRoot.calculateLayout(vw, vh, Direction.LTR);
  writeBack(root, yRoot, 0, 0);
  yRoot.freeRecursive(); // WASM nodes are NOT GC'd — must free every pass
}
