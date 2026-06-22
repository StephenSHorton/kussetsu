// Minimal flexbox: intrinsic sizing bottom-up, then placement top-down. Supports
// row/column, padding, gap, fixed/stretch cross-size, align + justify. This is the
// deliberately-swappable piece — Yoga or Taffy (Rust/WASM) drops in here for real.
import { type ElementNode, type Style, textOf } from "./scene";

let measureCtx: CanvasRenderingContext2D | null = null;

function fontStr(s: Style): string {
  return `${s.fontWeight ?? 400} ${s.fontSize ?? 16}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
}

export function measureText(text: string, s: Style): { w: number; h: number } {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const ctx = measureCtx!;
  ctx.font = fontStr(s);
  const m = ctx.measureText(text);
  // Width hugs the actual glyphs (kerned). Height must match how the glyphs are actually
  // RASTERISED — the atlas cell is ~1.32× font-size tall (GLYPH_BASE*1.3 in webgpu.ts) with
  // the baseline ~0.98× down. The per-string actualBoundingBox underestimates this badly for
  // strings without descenders (a 64px "Kussetsu" measured ~48px but its baseline renders at
  // ~62px), so the glyphs overflowed the box and the next element rode up onto them.
  return { w: Math.ceil(m.width) + 2, h: Math.ceil((s.fontSize ?? 16) * 1.32) };
}

function elementChildren(node: ElementNode): ElementNode[] {
  return node.children.filter((c): c is ElementNode => c.kind === "element");
}

// Children that participate in flow layout (absolutely-positioned ones don't).
function flowChildren(node: ElementNode): ElementNode[] {
  return elementChildren(node).filter((c) => !c.props.style?.absolute);
}

function intrinsic(node: ElementNode): { w: number; h: number } {
  const s = node.props.style ?? {};
  if (node.type === "text") {
    const t = measureText(textOf(node), s);
    return { w: typeof s.width === "number" ? s.width : t.w, h: s.height ?? t.h };
  }
  const pad = s.padding ?? 0;
  const gap = s.gap ?? 0;
  const dir = s.direction ?? "column";
  const kids = flowChildren(node);
  const sizes = kids.map(intrinsic);
  let main = 0;
  let cross = 0;
  sizes.forEach((sz, i) => {
    const m = dir === "row" ? sz.w : sz.h;
    const c = dir === "row" ? sz.h : sz.w;
    main += m + (i > 0 ? gap : 0);
    cross = Math.max(cross, c);
  });
  let w = (dir === "row" ? main : cross) + pad * 2;
  let h = (dir === "row" ? cross : main) + pad * 2;
  if (typeof s.width === "number") w = s.width;
  if (typeof s.height === "number") h = s.height;
  return { w, h };
}

/** Lay out `root` to fill (vw, vh) unless it specifies its own size. */
export function layout(root: ElementNode, vw: number, vh: number): void {
  const rs = root.props.style ?? {};
  root.x = 0;
  root.y = 0;
  root.w = typeof rs.width === "number" ? rs.width : vw;
  root.h = typeof rs.height === "number" ? rs.height : vh;
  arrange(root);
}

function arrange(node: ElementNode): void {
  const s = node.props.style ?? {};
  const pad = s.padding ?? 0;
  const gap = s.gap ?? 0;
  const dir = s.direction ?? "column";
  const align = s.align ?? "start";
  const justify = s.justify ?? "start";

  const innerX = node.x + pad;
  const innerY = node.y + pad;
  const innerW = node.w - pad * 2;
  const innerH = node.h - pad * 2;

  const kids = flowChildren(node);
  const sizes = kids.map(intrinsic);

  let totalMain = 0;
  sizes.forEach((sz, i) => {
    totalMain += (dir === "row" ? sz.w : sz.h) + (i > 0 ? gap : 0);
  });
  const freeMain = (dir === "row" ? innerW : innerH) - totalMain;
  const startOffset = justify === "center" ? Math.max(0, freeMain / 2) : justify === "end" ? Math.max(0, freeMain) : 0;
  let cursor = (dir === "row" ? innerX : innerY) + startOffset;

  kids.forEach((k, i) => {
    const ks = k.props.style ?? {};
    let kw = sizes[i].w;
    let kh = sizes[i].h;
    if (dir === "column") {
      if (ks.width === "stretch") kw = innerW;
      else if (typeof ks.width === "number") kw = ks.width;
    } else {
      if (typeof ks.height === "number") kh = ks.height;
    }

    const crossInner = dir === "row" ? innerH : innerW;
    const crossSize = dir === "row" ? kh : kw;
    let crossPos = dir === "row" ? innerY : innerX;
    if (align === "center") crossPos += Math.max(0, (crossInner - crossSize) / 2);
    else if (align === "end") crossPos += Math.max(0, crossInner - crossSize);

    if (dir === "row") {
      k.x = cursor;
      k.y = crossPos;
      k.w = kw;
      k.h = kh;
      cursor += kw + gap;
    } else {
      k.x = crossPos;
      k.y = cursor;
      k.w = kw;
      k.h = kh;
      cursor += kh + gap;
    }
    arrange(k);
  });

  // Absolutely-positioned children: placed at their viewport x/y, sized by
  // explicit width/height or intrinsic. (Used by the floating glass panel.)
  for (const k of elementChildren(node)) {
    const abs = k.props.style?.absolute;
    if (!abs) continue;
    const ks = k.props.style ?? {};
    const it = intrinsic(k);
    k.x = abs.x;
    k.y = abs.y;
    k.w = typeof ks.width === "number" ? ks.width : it.w;
    k.h = typeof ks.height === "number" ? ks.height : it.h;
    arrange(k);
  }
}
