// The host model of our custom React renderer. Plain JS objects — NOT the DOM.
// One tree drives everything: the reconciler mutates it, layout annotates x/y/w/h,
// the WebGPU painter draws it, the semantics overlay mirrors its interactive nodes.

export type RGBA = [number, number, number, number]; // 0..1 each, STRAIGHT alpha

export interface Style {
  direction?: "row" | "column"; // main axis (default "column")
  padding?: number;
  gap?: number;
  width?: number | "stretch"; // fixed px, or fill parent cross-axis
  height?: number;
  align?: "start" | "center" | "end"; // children, cross axis
  justify?: "start" | "center" | "end"; // children, main axis
  wrap?: boolean; // flex-wrap (real layout only)
  grow?: number; // flex-grow (real layout only)
  shrink?: number; // flex-shrink (real layout only)
  minWidth?: number; // (real layout only)
  overflow?: "scroll" | "hidden"; // clip children to this box; "scroll" = wheel-scrollable
  absolute?: { x: number; y: number }; // take out of flow, place at viewport x/y
  background?: RGBA;
  radius?: number;
  // text-only
  color?: RGBA;
  fontSize?: number;
  fontWeight?: number;
}

// A node with props.glass is painted as REFRACTIVE GLASS (samples the backdrop),
// not as a flat background rect.
export interface GlassSpec {
  refraction?: number; // default 0.09 — fraction of panel size the rim bends
  frost?: number; // default 2 — backdrop blur, CSS px
  tint?: number; // default 0.05 — mix toward tintColor
  tintColor?: RGBA; // default cool white
  rim?: number; // default 22 — rim band width, CSS px
}

export type Role = "button" | "heading" | "paragraph";

export interface NodeProps {
  style?: Style;
  role?: Role;
  ariaLabel?: string;
  level?: number; // heading level
  onActivate?: () => void;
  draggable?: boolean;
  onDrag?: (worldDx: number, worldDy: number) => void; // delta in WORLD px
  selectable?: boolean; // text node: wrap + click/drag to select
  glass?: GlassSpec; // present => painted as refractive glass
  children?: unknown;
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
  for (const c of node.children) if (c.kind === "text") s += c.text;
  return s;
}

/** First <text> descendant's string — used to label a <view role="button">. */
export function firstText(node: ElementNode): string {
  if (node.type === "text") return textOf(node);
  for (const c of node.children) {
    if (c.kind === "element") {
      const t = firstText(c);
      if (t) return t;
    }
  }
  return "";
}

// JSX host elements. Vite/esbuild strips types without type-checking, so the
// loop runs even if these are loose — but keep them honest.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      view: NodeProps & { children?: unknown };
      text: NodeProps & { children?: unknown };
    }
  }
}
