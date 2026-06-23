// The host model of our custom React renderer. Plain JS objects — NOT the DOM.
// One tree drives everything: the reconciler mutates it, layout annotates x/y/w/h,
// the WebGPU painter draws it, the semantics overlay mirrors its interactive nodes.
import type { ReactNode } from "react";

export type RGBA = [number, number, number, number]; // 0..1 each, STRAIGHT alpha

/** A length: fixed pixels (`200`) or a percentage of the parent (`"50%"`). */
export type Size = number | `${number}%`;

export interface Style {
  direction?: "row" | "column"; // main axis (default "column")
  padding?: number; // all four sides
  paddingX?: number; // left + right (overrides `padding` on the x axis)
  paddingY?: number; // top + bottom (overrides `padding` on the y axis)
  paddingTop?: number; // per-side (most specific — overrides padding / paddingX-Y)
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number; // all four sides — space OUTSIDE the box (flows siblings apart)
  marginX?: number; // left + right (overrides `margin` on the x axis)
  marginY?: number; // top + bottom (overrides `margin` on the y axis)
  marginTop?: number; // per-side (most specific — overrides margin / marginX-Y)
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  gap?: number; // both axes
  rowGap?: number; // between rows (overrides `gap` on the row axis)
  columnGap?: number; // between columns (overrides `gap` on the column axis)
  /** Fixed px (`200`), a percentage of the parent (`"50%"`), or `"stretch"` to fill the
   *  parent's CROSS axis (NOT `width:100%` — for a proportional main-axis size use `grow`/`basis`). */
  width?: Size | "stretch";
  height?: Size; // fixed px or a percentage of the parent
  align?: "start" | "center" | "end"; // children, cross axis
  justify?: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly"; // children, main axis
  wrap?: boolean; // flex-wrap (real layout only)
  grow?: number; // flex-grow — share of leftover MAIN-axis space (real layout only)
  shrink?: number; // flex-shrink (real layout only)
  basis?: Size; // flex-basis — the proportional main-axis size before grow/shrink (real layout only)
  minWidth?: Size; // (real layout only)
  maxWidth?: Size; // (real layout only) — e.g. chat bubbles hug short / wrap long
  minHeight?: Size; // (real layout only)
  maxHeight?: Size; // (real layout only)
  overflow?: "scroll" | "hidden"; // clip children to this box; "scroll" = wheel-scrollable
  absolute?: { x: number; y: number }; // take out of flow, place at viewport x/y
  background?: RGBA;
  radius?: number;
  cornerSmoothing?: number; // 0 = round corners (default), 1 = squircle (superellipse)
  boxShadow?: ShadowSpec; // a drop shadow painted BEHIND the box (one analytic blurred rounded-rect)
  opacity?: number; // 0..1 GROUP opacity — the node + its whole subtree fade as ONE unit (composited
  // offscreen, so overlapping children don't double-darken). Default 1 (opaque). < 1 forms a group.
  zIndex?: number; // lift this node + subtree to an OVERLAY layer painted above all normal content
  // (modals / dropdowns / tooltips), sorted ascending by zIndex. Escapes ancestor scroll + overflow
  // clip (a "top layer", like CSS position:fixed). Undefined = normal in-tree paint order.
  border?: number; // border/stroke width in CSS px — a hairline outline on the box edge (scales with zoom).
  // Ignored on glass/material nodes (use the glass rim). A sub-pixel width still paints a crisp ~1px line.
  borderColor?: RGBA; // border color (default: a faint light hairline). Works without a background; note a
  // translucent border (alpha < 1) reveals the page behind the box, not its own fill.
  // text-only
  color?: RGBA;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number; // CSS px added between glyphs (tracking)
}

/** A drop shadow: an offset, blurred, optionally spread rounded-rect of `color` painted
 *  behind the node (CSS `box-shadow`, outer only). All lengths are CSS px (scale with zoom). */
export interface ShadowSpec {
  x?: number; // horizontal offset (default 0)
  y?: number; // vertical offset (default 0)
  blur?: number; // blur radius (default 0 = a hard offset rect)
  spread?: number; // grow (+) / shrink (−) the shadow box before blurring (default 0)
  color?: RGBA; // default a soft black, [0, 0, 0, 0.25]
}

// A node with props.glass is painted as REFRACTIVE GLASS (samples the backdrop),
// not as a flat background rect.
export interface GlassSpec {
  refraction?: number; // default 0.09 — fraction of panel size the rim bends
  blur?: number; // default 0 — backdrop blur radius, CSS px
  tint?: number; // default 0.05 — mix toward tintColor
  tintColor?: RGBA; // default cool white
  rim?: number; // default 16 — rim band width, CSS px
  specular?: number; // default 0.05 — highlight/glint intensity
  dispersion?: number; // default 0.025 — chromatic rim split (the colorful edge)
}

/**
 * Fill a node with a CUSTOM WGSL fragment shader — the "shader material" primitive
 * ("R3F materials, for 2D UI"). Use it as `<View material={{ shader }} />`.
 *
 * Your `shader` string MUST define a `material` function:
 * ```wgsl
 * fn material(uv: vec2f, px: vec2f) -> vec4f {
 *   //   uv — 0..1 within the element's box
 *   //   px — screen position, CSS px
 *   //   returns straight-alpha RGBA (auto-clipped to the node's rounded rect)
 *   return vec4f(uv, 0.0, 1.0);
 * }
 * ```
 * In scope you get the uniform `u` plus helpers:
 * - `u.res.xy` = viewport (css px), `u.res.w` = time (seconds)
 * - `u.ptr.xy` = pointer (css px), `u.ptr.z` = the node's corner radius
 * - `u.rect` = element rect `(x, y, w, h)`; `u.c0`..`u.c3` = your `uniforms` (below)
 * - helpers: `noise2(p)`, `fbm(p)`, `hsv2rgb(c)`, and — when `backdrop` is set —
 *   `sampleBackdrop(cssPx)` to read the live scene behind the node (ripple / heat-haze / loupe).
 */
export interface MaterialSpec {
  /** WGSL defining `fn material(uv: vec2f, px: vec2f) -> vec4f`. A compile error is logged
   *  to the console with the line number mapped back to YOUR source (not the wrapper). */
  shader: string;
  /**
   * Up to **16** custom floats, packed into four `vec4f`s in order:
   * `u.c0 = [0,1,2,3]`, `u.c1 = [4,5,6,7]`, `u.c2 = [8,9,10,11]`, `u.c3 = [12,13,14,15]`
   * — so index `5` is `u.c1.y`. Pass a `() => number[]` to resolve them per frame (live values).
   * Floats past the 16th are ignored (with a dev warning).
   */
  uniforms?: number[] | (() => number[]);
  /** Let the shader call `sampleBackdrop(cssPx)` to read the live scene behind this node. */
  backdrop?: boolean;
  /** Request a continuous repaint loop (for time-animated shaders that read `u.res.w`). */
  animated?: boolean;
}

/** Draw an image inside a node's box (icons, avatars, photos, logos) — `<Image src="…" />` or
 *  `<View image={{ src }} />`. Loaded once and cached per `src`; clipped to the box's `radius`. */
export interface ImageSpec {
  /** Image URL, data URI, or blob URL. Also the texture cache key. */
  src: string;
  /** How the image fills the box (default `"cover"`): `"cover"` fills + crops to the box aspect,
   *  `"contain"` fits the whole image inside (letterboxed), `"fill"` stretches to the box. */
  fit?: "cover" | "contain" | "fill";
}

/** A full-screen post effect applied only WITHIN a node's box — `<View postProcess="bloom" />`. */
export type PostProcess = "bloom";

export type Role = "button" | "heading" | "paragraph";

// Payload for onActivate — the mouse button + modifier keys at activation (e.g. detect a
// cmd/ctrl-click). Keyboard activation (Enter/Space) reports button 0 with the held modifiers.
export interface ActivateEvent {
  button: number; // 0 = primary/left (and keyboard)
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface NodeProps {
  style?: Style;
  role?: Role;
  ariaLabel?: string;
  level?: number; // heading level
  onActivate?: (e: ActivateEvent) => void;
  onPointerEnter?: () => void; // cursor entered this node's box (hover) — view becomes interactive
  onPointerLeave?: () => void; // cursor left this node's box
  draggable?: boolean;
  onDrag?: (worldDx: number, worldDy: number) => void; // delta in WORLD px
  selectable?: boolean; // text node: wrap + click/drag to select
  editable?: boolean; // view: a text field (transparent <input> overlay drives it)
  value?: string; // editable field current value
  onChange?: (v: string) => void; // editable field change
  glass?: GlassSpec; // present => painted as refractive glass (samples the backdrop)
  /** Fill this node with a custom WGSL fragment shader. See {@link MaterialSpec}. */
  material?: MaterialSpec;
  /** Emit an instanced, pointer-reactive particle field over this node's box. See {@link ParticleSpec}. */
  particles?: import("./particles").ParticleSpec;
  /** Draw an image inside this node's box (clipped to `style.radius`). See {@link ImageSpec}. */
  image?: ImageSpec;
  /** Render an SVG as REAL vectors (analytic GPU fills — crisp at any zoom), fit into this node's box.
   *  The value is the SVG source (URL / data URI). Use `<Svg src="…" />`. v1: fills only (no strokes). */
  svg?: string;
  /** Apply a full-screen post effect, masked to this node's box. See {@link PostProcess}. */
  postProcess?: PostProcess;
  children?: ReactNode;
}

// Pan/zoom view transform: screen = world * scale + (tx, ty). All CSS px.
export interface Camera {
  tx: number;
  ty: number;
  scale: number;
}

export interface ElementNode {
  kind: "element";
  id: number;
  type: "view" | "text";
  props: NodeProps;
  parent: AnyNode | Container | null;
  children: AnyNode[];
  // Set by the reconciler's hideInstance/unhideInstance hooks when a <Suspense>/<Activity>
  // boundary toggles this subtree's visibility. Every layout/paint/hit-test pass skips a
  // node (and its subtree) while this is true, so a hidden subtree neither paints, takes
  // layout space, nor receives input — it stays mounted, ready to reappear.
  hidden?: boolean;
  // computed layout (CSS px, top-left origin)
  x: number;
  y: number;
  w: number;
  h: number;
  // text nodes: cached wrap result (set by the layout measure-func)
  wrapped?: { width: number; result: import("./text").WrapResult };
}

export interface TextNode {
  kind: "text";
  text: string;
  parent: AnyNode | Container | null;
  hidden?: boolean; // hidden by a Suspense/Activity visibility toggle (see ElementNode.hidden)
}

export type AnyNode = ElementNode | TextNode;

export interface Container {
  kind: "container";
  canvas: HTMLCanvasElement;
  children: AnyNode[];
  dirty: boolean;
  onDirty?: () => void;
}

let idCounter = 1;

export function newElement(type: "view" | "text", props: NodeProps): ElementNode {
  return { kind: "element", id: idCounter++, type, props: props ?? {}, parent: null, children: [], x: 0, y: 0, w: 0, h: 0 };
}

export function newText(text: string): TextNode {
  return { kind: "text", text, parent: null };
}

/** Concatenated string content of a <text> element (its text-node children). */
export function textOf(node: ElementNode): string {
  let s = "";
  for (const c of node.children) if (c.kind === "text" && !c.hidden) s += c.text;
  return s;
}

/** First <text> descendant's string — used to label a <view role="button">. */
export function firstText(node: ElementNode): string {
  if (node.type === "text") return textOf(node);
  for (const c of node.children) {
    if (c.kind === "element" && !c.hidden) {
      const t = firstText(c);
      if (t) return t;
    }
  }
  return "";
}

// JSX host elements. React 19 dropped the global `JSX` namespace and scopes JSX to the
// `react` module's namespace, so we augment THAT (the React-18-era `declare global` form
// no longer registers intrinsics under the react-jsx runtime). `view` and `text` already
// exist on React.JSX.IntrinsicElements as SVG elements, so we deliberately override them
// with the Kussetsu host nodes — hence the @ts-expect-error on each (the SVG signature is
// intentionally incompatible). Vite/esbuild strips types without type-checking anyway.
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      // Inline `import("react").ReactNode` (not the local alias) — augmenting the exported
      // "react" module forbids referencing scene.ts's private type-import (TS4033).
      // @ts-expect-error deliberately override SVG's <view> intrinsic with the Kussetsu host node
      view: NodeProps & { children?: import("react").ReactNode };
      // @ts-expect-error deliberately override SVG's <text> intrinsic with the Kussetsu host node
      text: NodeProps & { children?: import("react").ReactNode };
    }
  }
}
