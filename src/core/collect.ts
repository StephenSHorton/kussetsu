// Turn the laid-out scene tree into flat draw/semantics lists, applying the
// pan/zoom CAMERA (world -> screen), per-region SCROLL offsets, and CLIP rects.
// Pre-order = parents before children (paint order) and reading order (AT).
import { type Camera, type ElementNode, type RGBA, firstText, textOf } from "./scene";
import type { ParticleSpec } from "./particles";
import type { ClipRect, GlassPanel, MaterialPanel, Rect, TextItem } from "./webgpu";
import type { SemNode } from "./a11y";
import { measureWidth, selectionRects } from "./text";
import { glassTuning } from "./glassTuning";

const FOCUS_RING: RGBA = [0.35, 0.95, 1.0, 1];
const GLASS_TINT: RGBA = [0.82, 0.87, 1, 1];
const SELECTION_COLOR: RGBA = [0.3, 0.46, 0.96, 0.4];
const CARET_COLOR: RGBA = [0.96, 0.98, 1, 1];

export interface Selection {
  anchorId: number; // where the drag started (scene node id)
  anchorOffset: number;
  focusId: number; // where it is now
  focusOffset: number;
}
export interface SelectableRegion {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  node: ElementNode;
  scale: number;
}

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
    if (s.background && !n.props.glass && !n.props.material) {
      out.push({ x, y, w, h, radius: (s.radius ?? 0) * cam.scale, smoothing: s.cornerSmoothing, color: s.background, clip });
    }
    if (n.props.glass || n.props.material) return; // their children render in the FOREGROUND pass
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
      const size = (s.fontSize ?? 16) * cam.scale;
      const weight = s.fontWeight ?? 400;
      const color = s.color ?? ([1, 1, 1, 1] as RGBA);
      const tracking = (s.letterSpacing ?? 0) * cam.scale;
      if (n.wrapped) {
        // wrapped paragraph: one TextItem per visual line
        for (const L of n.wrapped.result.lines) {
          if (!L.text) continue;
          out.push({ x: n.x * cam.scale + cam.tx, y: (n.y - sy + L.y) * cam.scale + cam.ty, text: L.text, size, weight, color, clip, tracking });
        }
      } else {
        const str = textOf(n);
        if (str) out.push({ x: n.x * cam.scale + cam.tx, y: (n.y - sy) * cam.scale + cam.ty, text: str, size, weight, color, clip, tracking });
      }
    }
    if (n.props.glass || n.props.material) return; // their children render in the FOREGROUND pass
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

/** Content INSIDE glass nodes — drawn AFTER the glass composite so labels/inputs
 *  sit crisply ON the glass instead of being refracted by it. */
export function collectForeground(root: ElementNode, cam: Camera, scroll: ScrollMap): { rects: Rect[]; texts: TextItem[] } {
  const rects: Rect[] = [];
  const texts: TextItem[] = [];
  // sy = the scroll offset in effect at the glass/material node, shared by all its children.
  const emit = (n: ElementNode, sy: number) => {
    const s = n.props.style ?? {};
    const x = n.x * cam.scale + cam.tx;
    const y = (n.y - sy) * cam.scale + cam.ty;
    if (s.background) rects.push({ x, y, w: n.w * cam.scale, h: n.h * cam.scale, radius: (s.radius ?? 0) * cam.scale, smoothing: s.cornerSmoothing, color: s.background });
    if (n.type === "text") {
      const size = (s.fontSize ?? 16) * cam.scale;
      const weight = s.fontWeight ?? 400;
      const color = s.color ?? ([1, 1, 1, 1] as RGBA);
      const tracking = (s.letterSpacing ?? 0) * cam.scale;
      if (n.wrapped) {
        for (const L of n.wrapped.result.lines) if (L.text) texts.push({ x, y: (n.y - sy + L.y) * cam.scale + cam.ty, text: L.text, size, weight, color, tracking });
      } else {
        const str = textOf(n);
        if (str) texts.push({ x, y, text: str, size, weight, color, tracking });
      }
    }
    for (const c of n.children) if (c.kind === "element") emit(c, sy);
  };
  const find = (n: ElementNode, sy: number) => {
    if (n.props.glass || n.props.material) {
      for (const c of n.children) if (c.kind === "element") emit(c, sy);
      return; // nested glass/material not handled — fine for now
    }
    const childSy = n.props.style?.overflow === "scroll" ? sy + (scroll.get(n.id) ?? 0) : sy;
    for (const c of n.children) if (c.kind === "element") find(c, childSy);
  };
  find(root, 0);
  return { rects, texts };
}

/** Custom-shader fill nodes (props.material) → flat panel list (camera + scroll applied). */
export function collectMaterials(root: ElementNode, cam: Camera, scroll: ScrollMap): MaterialPanel[] {
  const out: MaterialPanel[] = [];
  const walk = (n: ElementNode, sy: number) => {
    const m = n.props.material;
    if (m) {
      out.push({
        x: n.x * cam.scale + cam.tx,
        y: (n.y - sy) * cam.scale + cam.ty, // scroll offset — materials scroll inside scroll regions
        w: n.w * cam.scale,
        h: n.h * cam.scale,
        radius: (n.props.style?.radius ?? 0) * cam.scale,
        shader: m.shader,
        uniforms: typeof m.uniforms === "function" ? m.uniforms() : (m.uniforms ?? []), // fn → live per-frame values
        backdrop: !!m.backdrop,
        animated: !!m.animated,
      });
    }
    const childSy = n.props.style?.overflow === "scroll" ? sy + (scroll.get(n.id) ?? 0) : sy;
    for (const c of n.children) if (c.kind === "element") walk(c, childSy);
  };
  walk(root, 0);
  return out;
}

export function collectGlass(root: ElementNode, cam: Camera, scroll: ScrollMap): GlassPanel[] {
  const out: GlassPanel[] = [];
  // When the slider panel is live, its params override every panel's per-node spec.
  const t = glassTuning.enabled ? glassTuning.params : null;
  const walk = (n: ElementNode, sy: number) => {
    const g = n.props.glass;
    if (g) {
      out.push({
        x: n.x * cam.scale + cam.tx,
        y: (n.y - sy) * cam.scale + cam.ty, // scroll offset — glass scrolls inside scroll regions
        w: n.w * cam.scale,
        h: n.h * cam.scale,
        radius: (n.props.style?.radius ?? 22) * cam.scale,
        refraction: t ? t.refraction : (g.refraction ?? 0.09),
        blur: (t ? t.blur : (g.blur ?? 0)) * cam.scale,
        tint: t ? t.tint : (g.tint ?? 0.05),
        tintColor: t ? t.tintColor : (g.tintColor ?? GLASS_TINT),
        rim: (t ? t.rim : (g.rim ?? 16)) * cam.scale,
        brighten: t ? t.brighten : 1.03,
        specular: t ? t.specular : (g.specular ?? 0.05),
        dispersion: t ? t.dispersion : (g.dispersion ?? 0.025),
      });
    }
    const childSy = n.props.style?.overflow === "scroll" ? sy + (scroll.get(n.id) ?? 0) : sy;
    for (const c of n.children) if (c.kind === "element") walk(c, childSy);
  };
  walk(root, 0);
  return out;
}

export function collectSemantics(root: ElementNode, cam: Camera, scroll: ScrollMap): SemNode[] {
  const out: SemNode[] = [];
  const walk = (n: ElementNode, clip: ClipRect | undefined, sy: number) => {
    const s = n.props.style ?? {};
    const p = n.props;
    const role = p.role;
    const draggable = p.draggable;
    if (role || draggable || p.onActivate || p.onPointerEnter || p.onPointerLeave) {
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
          onDrag: p.onDrag,
          label: p.ariaLabel ?? firstText(n),
          rect: { x, y, width: w, height: h },
          focusable: role === "button" || !!draggable,
          level: p.level,
          onActivate: p.onActivate,
          onPointerEnter: p.onPointerEnter,
          onPointerLeave: p.onPointerLeave,
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

// Document order = the order collectSelectable() emits regions (tree pre-order). Resolve
// anchor/focus to a forward [start..end] range over that ordering.
function orderedRange(selectables: SelectableRegion[], sel: Selection) {
  const ai = selectables.findIndex((r) => r.id === sel.anchorId);
  const fi = selectables.findIndex((r) => r.id === sel.focusId);
  if (ai < 0 || fi < 0) return null;
  const forward = ai < fi || (ai === fi && sel.anchorOffset <= sel.focusOffset);
  return forward
    ? { startI: ai, startOff: sel.anchorOffset, endI: fi, endOff: sel.focusOffset }
    : { startI: fi, startOff: sel.focusOffset, endI: ai, endOff: sel.anchorOffset };
}

/** Selection highlight bands across ALL spanned text nodes (cross-block), in screen px. */
export function collectSelection(selectables: SelectableRegion[], selection: Selection | null): Rect[] {
  if (!selection) return [];
  const range = orderedRange(selectables, selection);
  if (!range) return [];
  const out: Rect[] = [];
  for (let i = range.startI; i <= range.endI; i++) {
    const r = selectables[i];
    if (!r.node.wrapped) continue;
    const len = textOf(r.node).length;
    const from = i === range.startI ? range.startOff : 0;
    const to = i === range.endI ? range.endOff : len;
    for (const rect of selectionRects(r.node.wrapped.result, from, to)) {
      out.push({ x: r.x + rect.x * r.scale, y: r.y + rect.y * r.scale, w: rect.w * r.scale, h: rect.h * r.scale, radius: 2 * r.scale, color: SELECTION_COLOR });
    }
  }
  return out;
}

/** The selected text in document order (newline between visual rows) — for the clipboard. */
export function selectionToText(selectables: SelectableRegion[], selection: Selection | null): string {
  if (!selection) return "";
  const range = orderedRange(selectables, selection);
  if (!range) return "";
  let text = "";
  let prevY: number | null = null;
  for (let i = range.startI; i <= range.endI; i++) {
    const r = selectables[i];
    const str = textOf(r.node);
    const from = i === range.startI ? range.startOff : 0;
    const to = i === range.endI ? range.endOff : str.length;
    if (prevY !== null && Math.abs(r.y - prevY) > 2) text += "\n"; // different visual row
    text += str.slice(from, to);
    prevY = r.y;
  }
  return text;
}

export interface EditableRegion {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  value: string;
  onChange?: (v: string) => void;
  textNode: ElementNode | null;
  scale: number;
}

/** Editable fields (a transparent <input> is overlaid on these to drive editing/IME). */
export function collectEditable(root: ElementNode, cam: Camera): EditableRegion[] {
  const out: EditableRegion[] = [];
  const walk = (n: ElementNode) => {
    if (n.props.editable) {
      let tnode: ElementNode | null = null;
      const ft = (m: ElementNode) => {
        if (tnode) return;
        if (m.type === "text") {
          tnode = m;
          return;
        }
        for (const c of m.children) if (c.kind === "element") ft(c);
      };
      ft(n);
      out.push({ id: n.id, x: n.x * cam.scale + cam.tx, y: n.y * cam.scale + cam.ty, w: n.w * cam.scale, h: n.h * cam.scale, value: n.props.value ?? "", onChange: n.props.onChange, textNode: tnode, scale: cam.scale });
    }
    for (const c of n.children) if (c.kind === "element") walk(c);
  };
  walk(root);
  return out;
}

/** The blinking caret rect (screen) for an editable field at a caret offset. */
export function editCaretRect(region: EditableRegion, caretOffset: number, cam: Camera): Rect | null {
  const t = region.textNode;
  if (!t) return null;
  const s = t.props.style ?? {};
  const cx = (t.x + measureWidth(region.value.slice(0, caretOffset), s)) * cam.scale + cam.tx;
  return { x: cx, y: t.y * cam.scale + cam.ty, w: Math.max(1.5, 1.5 * cam.scale), h: t.h * cam.scale, radius: 0, color: CARET_COLOR };
}

/** Selectable text regions (screen rects), in document order. `all` makes every text node
 *  selectable (page-wide selection); otherwise only nodes with the `selectable` prop. */
export function collectSelectable(root: ElementNode, cam: Camera, all = false): SelectableRegion[] {
  const out: SelectableRegion[] = [];
  const walk = (n: ElementNode) => {
    if (n.type === "text" && (all || n.props.selectable) && n.wrapped) {
      out.push({ id: n.id, x: n.x * cam.scale + cam.tx, y: n.y * cam.scale + cam.ty, w: n.w * cam.scale, h: n.h * cam.scale, node: n, scale: cam.scale });
    }
    for (const c of n.children) if (c.kind === "element") walk(c);
  };
  walk(root);
  return out;
}

export interface ParticleNode {
  id: number;
  rect: [number, number, number, number]; // WORLD coords — the particle shader applies the camera
  spec: ParticleSpec;
}

export interface PostRegion {
  effect: "bloom";
  rect: [number, number, number, number]; // SCREEN px — the box to apply the effect within
}

/** The first node with props.postProcess → the effect + its on-screen box. The whole scene
 *  still renders through the post pipeline, but the effect is masked to this region so the
 *  rest of the page stays untouched. */
export function collectPostProcess(root: ElementNode, cam: Camera, scroll: ScrollMap): PostRegion | null {
  let found: PostRegion | null = null;
  const walk = (n: ElementNode, sy: number) => {
    if (found) return;
    if (n.props.postProcess) {
      found = { effect: n.props.postProcess, rect: [n.x * cam.scale + cam.tx, (n.y - sy) * cam.scale + cam.ty, n.w * cam.scale, n.h * cam.scale] };
      return;
    }
    const childSy = n.props.style?.overflow === "scroll" ? sy + (scroll.get(n.id) ?? 0) : sy;
    for (const c of n.children) if (c.kind === "element") walk(c, childSy);
  };
  walk(root, 0);
  return found;
}

/** Particle emitter nodes (props.particles). World-space (minus scroll); the runtime simulates each. */
export function collectParticles(root: ElementNode, scroll: ScrollMap): ParticleNode[] {
  const out: ParticleNode[] = [];
  const walk = (n: ElementNode, sy: number) => {
    if (n.props.particles) out.push({ id: n.id, rect: [n.x, n.y - sy, n.w, n.h], spec: n.props.particles });
    const childSy = n.props.style?.overflow === "scroll" ? sy + (scroll.get(n.id) ?? 0) : sy;
    for (const c of n.children) if (c.kind === "element") walk(c, childSy);
  };
  walk(root, 0);
  return out;
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
