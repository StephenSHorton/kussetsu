// Turn the laid-out scene tree into flat draw/semantics lists, applying the
// pan/zoom CAMERA (world -> screen), per-region SCROLL offsets, and CLIP rects.
// Pre-order = parents before children (paint order) and reading order (AT).
import { type Camera, type ElementNode, type RGBA, firstText, textOf } from "./scene";
import type { ClipRect, GlassPanel, Rect, TextItem } from "./webgpu";
import type { SemNode } from "./a11y";

const FOCUS_RING: RGBA = [0.35, 0.95, 1.0, 1];
const GLASS_TINT: RGBA = [0.82, 0.87, 1, 1];

export type ScrollMap = Map<number, number>; // node.id -> scrollY (world px)

function intersect(a: ClipRect, b: ClipRect): ClipRect {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
}

export function collectRects(root: ElementNode, focusedId: number | null, cam: Camera, scroll: ScrollMap): Rect[] {
  const out: Rect[] = [];
  const walk = (n: ElementNode, clip: ClipRect | undefined, sy: number) => {
    const s = n.props.style ?? {};
    const x = n.x * cam.scale + cam.tx;
    const y = (n.y - sy) * cam.scale + cam.ty;
    const w = n.w * cam.scale;
    const h = n.h * cam.scale;
    if (focusedId != null && n.id === focusedId) {
      out.push({ x: x - 4, y: y - 4, w: w + 8, h: h + 8, radius: ((s.radius ?? 0) + 4) * cam.scale, color: FOCUS_RING, clip });
    }
    if (s.background && !n.props.glass) {
      out.push({ x, y, w, h, radius: (s.radius ?? 0) * cam.scale, color: s.background, clip });
    }
    let childClip = clip;
    let childSy = sy;
    if (s.overflow) {
      const own: ClipRect = [x, y, w, h];
      childClip = clip ? intersect(clip, own) : own;
      if (s.overflow === "scroll") childSy = sy + (scroll.get(n.id) ?? 0);
    }
    for (const c of n.children) if (c.kind === "element") walk(c, childClip, childSy);
  };
  walk(root, undefined, 0);
  return out;
}

export function collectTexts(root: ElementNode, cam: Camera, scroll: ScrollMap): TextItem[] {
  const out: TextItem[] = [];
  const walk = (n: ElementNode, clip: ClipRect | undefined, sy: number) => {
    const s = n.props.style ?? {};
    if (n.type === "text") {
      const str = textOf(n);
      if (str) {
        out.push({
          x: n.x * cam.scale + cam.tx,
          y: (n.y - sy) * cam.scale + cam.ty,
          text: str,
          size: (s.fontSize ?? 16) * cam.scale,
          weight: s.fontWeight ?? 400,
          color: s.color ?? [1, 1, 1, 1],
          clip,
        });
      }
    }
    let childClip = clip;
    let childSy = sy;
    if (s.overflow) {
      const own: ClipRect = [n.x * cam.scale + cam.tx, (n.y - sy) * cam.scale + cam.ty, n.w * cam.scale, n.h * cam.scale];
      childClip = clip ? intersect(clip, own) : own;
      if (s.overflow === "scroll") childSy = sy + (scroll.get(n.id) ?? 0);
    }
    for (const c of n.children) if (c.kind === "element") walk(c, childClip, childSy);
  };
  walk(root, undefined, 0);
  return out;
}

export function collectGlass(root: ElementNode, cam: Camera): GlassPanel[] {
  const out: GlassPanel[] = [];
  const walk = (n: ElementNode) => {
    const g = n.props.glass;
    if (g) {
      out.push({
        x: n.x * cam.scale + cam.tx,
        y: n.y * cam.scale + cam.ty,
        w: n.w * cam.scale,
        h: n.h * cam.scale,
        radius: (n.props.style?.radius ?? 22) * cam.scale,
        refraction: g.refraction ?? 0.09,
        frost: (g.frost ?? 2) * cam.scale,
        tint: g.tint ?? 0.05,
        tintColor: g.tintColor ?? GLASS_TINT,
        rim: (g.rim ?? 22) * cam.scale,
      });
    }
    for (const c of n.children) if (c.kind === "element") walk(c);
  };
  walk(root);
  return out;
}

export function collectSemantics(root: ElementNode, cam: Camera, scroll: ScrollMap): SemNode[] {
  const out: SemNode[] = [];
  const walk = (n: ElementNode, clip: ClipRect | undefined, sy: number) => {
    const s = n.props.style ?? {};
    const role = n.props.role;
    const draggable = n.props.draggable;
    if (role || draggable) {
      const x = n.x * cam.scale + cam.tx;
      const y = (n.y - sy) * cam.scale + cam.ty;
      const w = n.w * cam.scale;
      const h = n.h * cam.scale;
      // Skip proxies fully scrolled out of their clip (so AT/find-in-page don't
      // land on hidden rows).
      const visible = !clip || (x + w > clip[0] && y + h > clip[1] && x < clip[0] + clip[2] && y < clip[1] + clip[3]);
      if (visible) {
        out.push({
          id: String(n.id),
          role,
          draggable,
          onDrag: n.props.onDrag,
          label: n.props.ariaLabel ?? firstText(n),
          rect: { x, y, width: w, height: h },
          focusable: role === "button" || !!draggable,
          level: n.props.level,
          onActivate: n.props.onActivate,
        });
      }
    }
    let childClip = clip;
    let childSy = sy;
    if (s.overflow) {
      const own: ClipRect = [n.x * cam.scale + cam.tx, (n.y - sy) * cam.scale + cam.ty, n.w * cam.scale, n.h * cam.scale];
      childClip = clip ? intersect(clip, own) : own;
      if (s.overflow === "scroll") childSy = sy + (scroll.get(n.id) ?? 0);
    }
    for (const c of n.children) if (c.kind === "element") walk(c, childClip, childSy);
  };
  walk(root, undefined, 0);
  return out;
}

export interface ScrollRegion {
  id: number;
  rect: ClipRect; // screen px
  maxScroll: number; // world px
}

/** Scroll containers + their screen rects + scroll range — for wheel routing. */
export function collectScrollRegions(root: ElementNode, cam: Camera, scroll: ScrollMap): ScrollRegion[] {
  const out: ScrollRegion[] = [];
  const walk = (n: ElementNode, sy: number) => {
    const s = n.props.style ?? {};
    let childSy = sy;
    if (s.overflow === "scroll") {
      let contentBottom = n.y;
      for (const c of n.children) if (c.kind === "element") contentBottom = Math.max(contentBottom, c.y + c.h);
      const maxScroll = Math.max(0, contentBottom - n.y + (s.padding ?? 0) - n.h);
      out.push({
        id: n.id,
        rect: [n.x * cam.scale + cam.tx, (n.y - sy) * cam.scale + cam.ty, n.w * cam.scale, n.h * cam.scale],
        maxScroll,
      });
      childSy = sy + (scroll.get(n.id) ?? 0);
    }
    for (const c of n.children) if (c.kind === "element") walk(c, childSy);
  };
  walk(root, 0);
  return out;
}
