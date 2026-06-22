// kussetsu/compat — CSS declarations → Kussetsu `Style`, with FAIL-LOUD discipline.
//
// This is the heart of the on-ramp's honesty. Every CSS property a real app uses is
// classified against the ACTUAL paint ceiling + wired layout (see COVERAGE.md):
//   • maps cleanly        → we set the Style field
//   • maps with a caveat  → we set it and note the divergence
//   • no GPU/layout target → we REFUSE (an error the caller turns into a build error)
// We never silently drop or coerce — "mostly works" is the trust-trap.
//
// Corrections that came out of adversarially verifying the map against the source:
//   - display:flex must emit direction:'row' (CSS flex defaults row; kussetsu defaults column)
//   - margin (any side) is NOT wired in Yoga → refuse, never no-op
//   - per-side / asymmetric padding has no target → refuse unless it collapses to one number
//   - overflow clips BOTH axes & scrolls vertical-only → overflow-x/y can't be honored → refuse
//   - width:100% → 'stretch' fills the CROSS axis only (correct in column containers)
//   - opacity has no per-subtree multiply → refuse (leaf-only support is a future feature)

import type { RGBA, Style } from "../core/scene";
import { parseColor, parseLength } from "./parse.ts";

export interface StyleMapResult {
  style: Partial<Style>;
  errors: { prop: string; message: string }[];
}

const P = "kussetsu/compat:";
const camelToKebab = (k: string) => k.replace(/([A-Z])/g, "-$1").toLowerCase();

// Font stacks that already match what the glyph atlas renders (system-ui) → ignore.
const SYSTEM_FONT = /(system-ui|-apple-system|segoe ui|roboto|sans-serif|ui-sans-serif|inherit)/i;

const ENUM = {
  direction: { row: "row", column: "column" } as Record<string, Style["direction"]>,
  justify: { "flex-start": "start", start: "start", left: "start", center: "center", "flex-end": "end", right: "end", end: "end" } as Record<string, Style["justify"]>,
  align: { "flex-start": "start", start: "start", center: "center", "flex-end": "end", end: "end" } as Record<string, Style["align"]>,
};

/** Map a flat set of resolved CSS declarations. `null` value = a dynamic (unresolvable) value. */
export function mapCssDeclarations(decls: Array<[string, string | number | null]>): StyleMapResult {
  const style: Partial<Style> = {};
  const errors: { prop: string; message: string }[] = [];
  const m = new Map<string, string | number | null>();
  for (const [k, v] of decls) m.set(camelToKebab(k.trim()), v);

  const fail = (prop: string, message: string) => errors.push({ prop, message });
  const get = (k: string) => m.get(k);
  const has = (k: string) => m.has(k);

  // Reject dynamic values up front (the Babel layer normally catches these with a
  // precise location, but a runtime resolver routes through here too).
  for (const [k, v] of m) if (v === null) fail(k, `${P} dynamic value for '${k}' can't be resolved at build time — make it static or use the runtime resolver.`);

  // ── display + flex-direction (correlated) ──────────────────────────────────
  let direction: Style["direction"] | undefined;
  if (has("flex-direction")) {
    const v = String(get("flex-direction"));
    if (ENUM.direction[v]) direction = ENUM.direction[v];
    else fail("flex-direction", `${P} flex-direction:${v} has no target (only row|column; *-reverse needs a layout feature).`);
  }
  if (has("display")) {
    const v = String(get("display"));
    if (v === "flex" || v === "inline-flex") {
      if (direction === undefined) direction = "row"; // CSS flex defaults ROW; kussetsu Style defaults COLUMN
    } else if (v === "block" || v === "flow-root" || v === "contents") {
      // every <view> is already a flex column container — block ≈ that
    } else if (v === "none") {
      fail("display", `${P} display:none has no target (no visibility flag) — render conditionally in React instead.`);
    } else {
      fail("display", `${P} display:${v} has no GPU/layout target yet (only flex/block).`);
    }
  }
  if (direction !== undefined) style.direction = direction;

  // ── simple flex fields ──────────────────────────────────────────────────────
  if (has("flex-wrap")) {
    const v = String(get("flex-wrap"));
    if (v === "wrap") style.wrap = true;
    else if (v === "nowrap") void 0;
    else fail("flex-wrap", `${P} flex-wrap:${v} has no target (wrap-reverse needs a layout feature).`);
  }
  if (has("flex-grow")) style.grow = Number(get("flex-grow"));
  if (has("flex-shrink")) style.shrink = Number(get("flex-shrink"));
  if (has("flex-basis")) fail("flex-basis", `${P} flex-basis is not wired to layout yet — use width/height, or it needs a layout feature.`);
  if (has("flex")) {
    const parts = String(get("flex")).trim().split(/\s+/);
    if (parts.length === 1 && /^\d+$/.test(parts[0])) {
      style.grow = Number(parts[0]); style.shrink = 1; // flex:1 == 1 1 0
    } else if (parts.length >= 2) {
      style.grow = Number(parts[0]); style.shrink = Number(parts[1]);
      const basis = parts[2];
      if (basis && basis !== "0" && basis !== "0%" && basis !== "auto")
        fail("flex", `${P} the flex-basis component '${basis}' is not wired to layout yet.`);
    } else if (parts[0] !== "none" && parts[0] !== "auto" && parts[0] !== "initial") {
      fail("flex", `${P} unsupported flex shorthand '${get("flex")}'.`);
    }
  }
  if (has("justify-content")) {
    const v = String(get("justify-content"));
    if (ENUM.justify[v]) style.justify = ENUM.justify[v];
    else fail("justify-content", `${P} justify-content:${v} has no target (start|center|end only; space-* needs a layout feature).`);
  }
  if (has("align-items")) {
    const v = String(get("align-items"));
    if (ENUM.align[v]) style.align = ENUM.align[v];
    else if (v === "stretch") fail("align-items", `${P} align-items:stretch on a container isn't wired — stretch is per-child only (width:'stretch').`);
    else fail("align-items", `${P} align-items:${v} has no target (start|center|end only).`);
  }
  if (has("align-self")) {
    const v = String(get("align-self"));
    if (v === "stretch") style.width = "stretch";
    else fail("align-self", `${P} align-self:${v} isn't wired — only align-self:stretch maps (→ width:'stretch').`);
  }

  // ── gap (one value, BOTH axes — Yoga wires Gutter.All only) ─────────────────
  {
    if (has("gap")) {
      const g = parseLength(get("gap") as never);
      if (g == null) fail("gap", `${P} gap must be a px/rem length.`);
      else style.gap = g;
    } else if (has("row-gap") || has("column-gap")) {
      const r = has("row-gap") ? parseLength(get("row-gap") as never) : null;
      const c = has("column-gap") ? parseLength(get("column-gap") as never) : null;
      if (has("row-gap") && has("column-gap") && r != null && r === c) style.gap = r; // symmetric ≡ both axes
      else fail(has("row-gap") ? "row-gap" : "column-gap", `${P} single-axis gap has no target — only a both-axes gap is wired (set row-gap and column-gap equal, or use gap).`);
    }
  }

  // ── sizing ──────────────────────────────────────────────────────────────────
  if (has("width")) {
    const raw = String(get("width")).trim();
    const px = parseLength(get("width") as never);
    if (px != null) style.width = px;
    else if (raw === "100%" || raw === "stretch") style.width = "stretch"; // NB: fills CROSS axis (correct in column containers)
    else if (raw === "auto" || raw === "fit-content" || raw === "max-content") void 0;
    else fail("width", `${P} width:${raw} has no target (px/rem, '100%'→stretch, or auto only).`);
  }
  if (has("height")) {
    const raw = String(get("height")).trim();
    const px = parseLength(get("height") as never);
    if (px != null) style.height = px;
    else if (raw === "auto" || raw === "fit-content") void 0;
    else fail("height", `${P} height:${raw} has no target (px/rem or auto; no percent/stretch height).`);
  }
  for (const [css, key] of [["min-width", "minWidth"], ["max-width", "maxWidth"]] as const) {
    if (has(css)) {
      const px = parseLength(get(css) as never);
      if (px != null) (style as Record<string, unknown>)[key] = px;
      else fail(css, `${P} ${css} must be a px/rem length.`);
    }
  }
  if (has("min-height")) fail("min-height", `${P} min-height is not wired to layout yet (renderer feature).`);
  if (has("max-height")) fail("max-height", `${P} max-height is not wired to layout yet (renderer feature).`);
  if (has("aspect-ratio")) fail("aspect-ratio", `${P} aspect-ratio is not wired to layout yet (renderer feature).`);

  // ── padding (collapse to one number or refuse) ──────────────────────────────
  {
    const sides: Record<string, number | null> = {};
    for (const s of ["top", "right", "bottom", "left"]) if (has(`padding-${s}`)) sides[s] = parseLength(get(`padding-${s}`) as never);
    if (has("padding")) {
      const parts = String(get("padding")).trim().split(/\s+/).map((p) => parseLength(p));
      if (parts.some((p) => p == null)) fail("padding", `${P} padding values must be px/rem lengths.`);
      else if (parts.every((p) => p === parts[0])) style.padding = parts[0] as number;
      else fail("padding", `${P} asymmetric padding '${get("padding")}' has no target — only a single all-sides padding is wired.`);
    }
    const sk = Object.keys(sides);
    if (sk.length) {
      const vals = sk.map((s) => sides[s]);
      const allEqual = vals.every((v) => v != null && v === vals[0]) && sk.length === 4;
      if (allEqual && style.padding === undefined) style.padding = vals[0] as number;
      else fail(`padding-${sk[0]}`, `${P} per-side padding has no target — only a single all-sides padding is wired (set all four equal, or use padding).`);
    }
  }

  // ── margin: completely unwired in Yoga → must be loud, never a no-op ─────────
  for (const k of ["margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "margin-inline", "margin-block"])
    if (has(k)) fail(k, `${P} ${k} is not wired to layout yet — convert vertical rhythm to a parent gap, or it needs a margin layout feature.`);

  // ── position / offsets ──────────────────────────────────────────────────────
  if (has("position")) {
    const v = String(get("position"));
    if (v === "absolute") {
      const x = has("left") ? parseLength(get("left") as never) : 0;
      const y = has("top") ? parseLength(get("top") as never) : 0;
      if (x == null || y == null) fail("position", `${P} absolute top/left must be px/rem (percent offsets aren't supported).`);
      else style.absolute = { x, y }; // NB: parent-relative (like CSS), not viewport
      if (has("right")) fail("right", `${P} 'right' has no target — only top/left position an absolute box (right/bottom drive stretch, unwired).`);
      if (has("bottom")) fail("bottom", `${P} 'bottom' has no target — only top/left position an absolute box.`);
    } else if (v === "relative" || v === "static") {
      // relative w/o offsets is a no-op here (absolute children are already parent-relative)
      if (has("top") || has("left") || has("right") || has("bottom"))
        fail("position", `${P} position:relative offsets have no target (no relative-shift layout).`);
    } else {
      fail("position", `${P} position:${v} has no target (only absolute; no fixed/sticky/z-index stacking).`);
    }
  } else {
    for (const k of ["top", "left", "right", "bottom"]) if (has(k)) fail(k, `${P} '${k}' only applies with position:absolute (and only top/left are wired).`);
  }
  if (has("z-index")) fail("z-index", `${P} z-index has no target — paint order is tree order (put later siblings on top).`);
  if (has("inset")) {
    const v = String(get("inset")).trim();
    if (v === "0" || v === "0px") fail("inset", `${P} inset:0 means stretch-to-fill (top/right/bottom/left) which has no target — size the box explicitly.`);
    else fail("inset", `${P} inset shorthand has no target — use absolute top/left only.`);
  }

  // ── overflow (clips both axes; scroll is vertical-only) ─────────────────────
  if (has("overflow")) {
    const v = String(get("overflow"));
    if (v === "hidden" || v === "clip") style.overflow = "hidden";
    else if (v === "auto" || v === "scroll") style.overflow = "scroll"; // vertical scroll only
    else if (v === "visible") void 0;
    else fail("overflow", `${P} overflow:${v} has no target (hidden|scroll|auto only).`);
  }
  for (const k of ["overflow-x", "overflow-y"])
    if (has(k)) fail(k, `${P} ${k} has no target — overflow clips BOTH axes (and scrolls vertically only); single-axis overflow needs a renderer feature.`);

  // ── background (solid only) ─────────────────────────────────────────────────
  for (const k of ["background", "background-color"]) {
    if (!has(k)) continue;
    const raw = String(get(k)).trim();
    if (/gradient|url\(/i.test(raw)) { fail(k, `${P} ${k} '${raw.slice(0, 24)}…' has no GPU target yet (gradients/images need a paint feature).`); continue; }
    const c = parseColor(raw);
    if (c) style.background = c;
    else fail(k, `${P} can't resolve color '${raw}' (var()/currentColor/hsl/theme() aren't resolvable here).`);
  }
  if (has("background-image")) fail("background-image", `${P} background-image has no GPU target yet (no texture pipeline).`);

  // ── border-radius (single value) ────────────────────────────────────────────
  if (has("border-radius")) {
    const parts = String(get("border-radius")).trim().split(/\s+/).map((p) => parseLength(p));
    if (parts.some((p) => p == null)) fail("border-radius", `${P} border-radius must be px/rem.`);
    else if (parts.every((p) => p === parts[0])) style.radius = parts[0] as number;
    else fail("border-radius", `${P} per-corner border-radius has no target — only a single uniform radius is painted.`);
  }

  // ── text ────────────────────────────────────────────────────────────────────
  if (has("color")) {
    const c = parseColor(String(get("color")));
    if (c) style.color = c;
    else fail("color", `${P} can't resolve text color '${get("color")}'.`);
  }
  if (has("font-size")) {
    const px = parseLength(get("font-size") as never);
    if (px != null) style.fontSize = px;
    else fail("font-size", `${P} font-size must be a px/rem length.`);
  }
  if (has("font-weight")) {
    const v = String(get("font-weight"));
    const named: Record<string, number> = { normal: 400, bold: 700, bolder: 800, lighter: 300 };
    const w = named[v] ?? (/^\d+$/.test(v) ? Number(v) : NaN);
    if (!Number.isNaN(w)) style.fontWeight = w;
    else fail("font-weight", `${P} unsupported font-weight '${v}'.`);
  }
  if (has("font-family")) {
    if (!SYSTEM_FONT.test(String(get("font-family"))))
      fail("font-family", `${P} font-family is fixed to the system-ui stack — '${get("font-family")}' can't be honored (needs a font pipeline).`);
  }

  // ── things with a real, named renderer gap → always loud ────────────────────
  const NO_TARGET: Record<string, string> = {
    "box-shadow": "box-shadow has no GPU target yet (needs a shadow pass)",
    border: "compat doesn't auto-map CSS `border` yet — set the native `border` (px) + `borderColor` Style field directly",
    "border-width": "compat doesn't auto-map `border-width` yet — use the native `border` (px) Style field",
    "border-color": "compat doesn't auto-map `border-color` yet — use the native `borderColor` Style field",
    "border-style": "border-style (dashed/dotted) isn't supported — only a solid stroke via the native `border` field",
    outline: "outline isn't mapped — use the native `border` / `borderColor` Style field",
    "box-sizing": "", // ignore: Yoga is already border-box-like
    transform: "transform has no GPU target yet (camera is whole-scene translate+scale only)",
    filter: "filter has no GPU target yet",
    "backdrop-filter": "backdrop-filter has no CSS path — use the glass={{...}} prop instead",
    transition: "transition has no animator — drive animation from React state",
    animation: "animation/@keyframes has no animator — drive it from React state",
    opacity: "opacity has no per-subtree multiply — fold alpha into background/color, or it needs a group-opacity feature",
    "line-height": "line-height isn't controllable yet (text uses the font's measured metrics)",
    "text-align": "text-align has no target — align text via a wrapping container's justify/align",
    "letter-spacing": "letter-spacing has no target (glyph atlas has fixed advances)",
    "text-decoration": "text-decoration (underline/strike) has no GPU target yet",
    "text-decoration-line": "text-decoration has no GPU target yet",
    "text-overflow": "text-overflow/ellipsis has no target yet",
    "white-space": "white-space:nowrap has no no-wrap measure path yet",
    "mix-blend-mode": "blend modes have no GPU target yet",
    "clip-path": "clip-path has no target (only rectangular clip via overflow)",
    "font-style": "italic has no target (the glyph atlas has no italic face)",
    "text-transform": "text-transform has no target — the text path applies no case transform",
  };
  for (const k in NO_TARGET) {
    if (!has(k)) continue;
    if (NO_TARGET[k] === "") continue; // explicitly ignored, harmless
    fail(k, `${P} ${NO_TARGET[k]}.`);
  }

  // pointer-events:none implies a non-interactive node — but interactivity here is
  // driven by role/editable/selectable, not CSS, so we can't honor it → fail loud
  // (silently keeping a "disabled" element interactive is a behavioral trust-trap).
  if (has("pointer-events") && String(get("pointer-events")).trim() === "none")
    fail("pointer-events", `${P} pointer-events:none has no target — interactivity is set by a node's role, not CSS. Render it non-interactive in React instead.`);

  // Truly cosmetic / no paint footprint → silently ignored (documented):
  // cursor, user-select, will-change, content-visibility, -webkit-* — they neither
  // lay out nor paint anything.

  return { style, errors };
}
