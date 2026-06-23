// kussetsu/compat — a BOUNDED Tailwind utility subset → CSS declarations.
//
// We ship no Tailwind engine. Each supported utility is translated to the CSS it
// stands for, then routed through mapCssDeclarations() (style.ts) so the paint-ceiling
// rules + fail-loud messages live in ONE place: `shadow-lg` becomes `box-shadow:…`
// and fails with the same message an inline box-shadow would. The subset is honestly
// scoped to what the renderer paints today — that scoping IS the roadmap.
//
// Variant prefixes (hover:/focus:/md:/dark:/group-*) are rejected before translation:
// they need a cascade/event/media layer that doesn't exist, and silently emitting the
// base value ("renders but never changes on hover") is the trust-trap. Per-token: the
// `p-2` in `p-2 hover:p-4` still compiles; only `hover:p-4` fails.

const P = "kussetsu/compat:";
const sp = (n: string) => `${parseFloat(n) * 4}px`; // Tailwind spacing: n × 0.25rem = n × 4px

export interface TwResult {
  decls?: [string, string][];
  error?: string;
  ignore?: boolean;
}

// A curated palette slice. Unknown colors fail loud (with the bg-[#hex] escape), so a
// partial palette is honest, not lossy. Extend freely; arbitrary values cover the rest.
const COLORS: Record<string, string> = {
  white: "#ffffff", black: "#000000", transparent: "transparent",
  "slate-50": "#f8fafc", "slate-100": "#f1f5f9", "slate-200": "#e2e8f0", "slate-300": "#cbd5e1",
  "slate-400": "#94a3b8", "slate-500": "#64748b", "slate-600": "#475569", "slate-700": "#334155",
  "slate-800": "#1e293b", "slate-900": "#0f172a", "slate-950": "#020617",
  "gray-100": "#f3f4f6", "gray-300": "#d1d5db", "gray-500": "#6b7280", "gray-700": "#374151", "gray-900": "#111827",
  "zinc-800": "#27272a", "zinc-900": "#18181b",
  "red-500": "#ef4444", "red-600": "#dc2626",
  "green-500": "#22c55e", "emerald-500": "#10b981",
  "blue-400": "#60a5fa", "blue-500": "#3b82f6", "blue-600": "#2563eb",
  "indigo-500": "#6366f1", "indigo-600": "#4f46e5", "violet-500": "#8b5cf6",
  "amber-400": "#fbbf24", "amber-500": "#f59e0b", "pink-500": "#ec4899",
};

const TEXT_SIZE: Record<string, string> = {
  xs: "12px", sm: "14px", base: "16px", lg: "18px", xl: "20px",
  "2xl": "24px", "3xl": "30px", "4xl": "36px", "5xl": "48px", "6xl": "60px",
};
const FONT_WEIGHT: Record<string, string> = {
  thin: "100", extralight: "200", light: "300", normal: "400", medium: "500",
  semibold: "600", bold: "700", extrabold: "800", black: "900",
};
const RADIUS: Record<string, string> = {
  none: "0px", sm: "2px", "": "4px", md: "6px", lg: "8px", xl: "12px",
  "2xl": "16px", "3xl": "24px", full: "9999px",
};
const MAX_W: Record<string, string> = {
  xs: "320px", sm: "384px", md: "448px", lg: "512px", xl: "576px", "2xl": "672px", full: "100%",
};

// Exact-match utilities (no numeric/color suffix).
const EXACT: Record<string, [string, string][] | "ignore"> = {
  flex: [["display", "flex"]],
  "inline-flex": [["display", "flex"]],
  block: [["display", "block"]],
  grid: [["display", "grid"]], // → fails in mapCss (honest)
  hidden: [["display", "none"]],
  "flex-row": [["flex-direction", "row"]],
  "flex-col": [["flex-direction", "column"]],
  "flex-row-reverse": [["flex-direction", "row-reverse"]],
  "flex-col-reverse": [["flex-direction", "column-reverse"]],
  "flex-wrap": [["flex-wrap", "wrap"]],
  "flex-nowrap": [["flex-wrap", "nowrap"]],
  "flex-1": [["flex", "1 1 0%"]],
  "flex-auto": [["flex", "auto"]],
  "flex-none": [["flex", "none"]],
  grow: [["flex-grow", "1"]],
  "grow-0": [["flex-grow", "0"]],
  shrink: [["flex-shrink", "1"]],
  "shrink-0": [["flex-shrink", "0"]],
  "items-start": [["align-items", "flex-start"]],
  "items-center": [["align-items", "center"]],
  "items-end": [["align-items", "flex-end"]],
  "items-stretch": [["align-items", "stretch"]],
  "items-baseline": [["align-items", "baseline"]],
  "justify-start": [["justify-content", "flex-start"]],
  "justify-center": [["justify-content", "center"]],
  "justify-end": [["justify-content", "flex-end"]],
  "justify-between": [["justify-content", "space-between"]],
  "justify-around": [["justify-content", "space-around"]],
  "justify-evenly": [["justify-content", "space-evenly"]],
  "self-stretch": [["align-self", "stretch"]],
  "self-center": [["align-self", "center"]],
  "self-start": [["align-self", "flex-start"]],
  "self-end": [["align-self", "flex-end"]],
  "w-full": [["width", "100%"]],
  "w-screen": [["width", "100vw"]],
  "w-auto": [["width", "auto"]],
  "w-px": [["width", "1px"]],
  "h-full": [["height", "100%"]],
  "h-screen": [["height", "100vh"]],
  "h-auto": [["height", "auto"]],
  "h-px": [["height", "1px"]],
  relative: [["position", "relative"]],
  absolute: [["position", "absolute"]],
  fixed: [["position", "fixed"]],
  sticky: [["position", "sticky"]],
  "overflow-hidden": [["overflow", "hidden"]],
  "overflow-auto": [["overflow", "auto"]],
  "overflow-scroll": [["overflow", "scroll"]],
  "overflow-visible": [["overflow", "visible"]],
  rounded: [["border-radius", "4px"]],
  "rounded-full": [["border-radius", "9999px"]],
  border: [["border", "1px solid"]], // → fails (compat doesn't map border yet; use the native border field)
  italic: [["font-style", "italic"]],
  underline: [["text-decoration", "underline"]],
  "line-through": [["text-decoration", "line-through"]],
  truncate: [["text-overflow", "ellipsis"]],
  "text-center": [["text-align", "center"]],
  "text-left": [["text-align", "left"]],
  "text-right": [["text-align", "right"]],
  "font-sans": "ignore",
  "font-mono": [["font-family", "monospace"]],
  "font-serif": [["font-family", "serif"]],
};

/** One Tailwind class token → CSS declarations (or an error / ignore). */
export function tailwindToken(token: string): TwResult {
  const t = token.trim();
  if (!t) return { ignore: true };

  // Variant prefix (hover:/focus:/md:/dark:/group-hover:/[&>*]:) — `:` outside [].
  const brk = t.indexOf("[");
  const colon = t.indexOf(":");
  if (colon !== -1 && (brk === -1 || colon < brk)) {
    const variant = t.slice(0, colon);
    const hint =
      /^(hover|focus|active|focus-within|focus-visible|group|peer)/.test(variant)
        ? "state variants need React state + onActivate (no hover/focus events are wired)"
        : /^(sm|md|lg|xl|2xl)$/.test(variant)
          ? "responsive variants need a resize hook driving props (no media evaluator)"
          : variant === "dark"
            ? "dark: needs a theme value in React context (no cascade)"
            : "conditional variants have no static target";
    return { error: `${P} the '${variant}:' variant has no target — ${hint}. ('${t}')` };
  }

  // Arbitrary value: prefix-[value]
  const arb = t.match(/^(-?[a-z]+(?:-[a-z]+)*)-\[(.+)\]$/);
  if (arb) {
    const [, prefix, valRaw] = arb;
    const val = valRaw.replace(/_/g, " ");
    switch (prefix) {
      case "w": return { decls: [["width", val]] };
      case "h": return { decls: [["height", val]] };
      case "min-w": return { decls: [["min-width", val]] };
      case "max-w": return { decls: [["max-width", val]] };
      case "p": return { decls: [["padding", val]] };
      case "gap": return { decls: [["gap", val]] };
      case "rounded": return { decls: [["border-radius", val]] };
      case "text": return { decls: [/^#|rgb|hsl/.test(val) ? ["color", val] : ["font-size", val]] };
      case "bg": return { decls: [["background-color", val]] };
      case "top": return { decls: [["top", val]] };
      case "left": return { decls: [["left", val]] };
      default: return { error: `${P} arbitrary utility '${prefix}-[…]' isn't supported (try inline style).` };
    }
  }

  if (t in EXACT) {
    const v = EXACT[t];
    return v === "ignore" ? { ignore: true } : { decls: v };
  }

  // Color families first — their value can contain a dash (slate-800), so match by
  // prefix on the whole remainder, not by splitting on the last dash.
  if (t.startsWith("bg-")) {
    const c = t.slice(3);
    if (c.startsWith("gradient")) return { error: `${P} bg-gradient-* has no GPU target yet. ('${t}')` };
    if (COLORS[c]) return { decls: [["background-color", COLORS[c]]] };
    return { error: `${P} unknown background '${t}'. Use bg-[#hex] for arbitrary colors.` };
  }
  if (t.startsWith("text-")) {
    const s = t.slice(5);
    if (TEXT_SIZE[s]) return { decls: [["font-size", TEXT_SIZE[s]]] };
    if (COLORS[s]) return { decls: [["color", COLORS[s]]] };
    return { error: `${P} unknown text utility '${t}' (size or color). Use text-[15px] / text-[#fff] for arbitrary values.` };
  }
  if (t.startsWith("border-")) return { error: `${P} border-* isn't auto-mapped by compat yet — set the native \`border\` (px) + \`borderColor\` Style field directly. ('${t}')` };

  // Prefixed numeric / keyword families.
  const dash = t.lastIndexOf("-");
  const head = dash === -1 ? t : t.slice(0, dash);
  const tail = dash === -1 ? "" : t.slice(dash + 1);

  switch (head) {
    case "p": return num(tail, (n) => [["padding", sp(n)]], t);
    case "px": return num(tail, (n) => [["padding-left", sp(n)], ["padding-right", sp(n)]], t);
    case "py": return num(tail, (n) => [["padding-top", sp(n)], ["padding-bottom", sp(n)]], t);
    case "pt": return num(tail, (n) => [["padding-top", sp(n)]], t);
    case "pr": return num(tail, (n) => [["padding-right", sp(n)]], t);
    case "pb": return num(tail, (n) => [["padding-bottom", sp(n)]], t);
    case "pl": return num(tail, (n) => [["padding-left", sp(n)]], t);
    case "m": case "mx": case "my": case "mt": case "mr": case "mb": case "ml":
      return { decls: [[head === "m" ? "margin" : `margin-${{ mx: "inline", my: "block", mt: "top", mr: "right", mb: "bottom", ml: "left" }[head]}`, sp(tail || "0")]] }; // → fails in mapCss
    case "space": return { error: `${P} space-x/space-y use margins on children (unwired) — use a parent gap instead. ('${t}')` };
    case "gap": return num(tail, (n) => [["gap", sp(n)]], t);
    case "gap-x": return { decls: [["column-gap", sp(tail)]] };
    case "gap-y": return { decls: [["row-gap", sp(tail)]] };
    case "w": return num(tail, (n) => [["width", sp(n)]], t);
    case "h": return num(tail, (n) => [["height", sp(n)]], t);
    case "min-w": return num(tail, (n) => [["min-width", sp(n)]], t);
    case "max-w": return { decls: [["max-width", MAX_W[tail] ?? sp(tail)]] };
    case "min-h": return { error: `${P} min-h-* is not wired to layout yet. ('${t}')` };
    case "max-h": return { error: `${P} max-h-* is not wired to layout yet. ('${t}')` };
    case "rounded": return { decls: [["border-radius", RADIUS[tail] ?? sp(tail)]] };
    case "font": return FONT_WEIGHT[tail] ? { decls: [["font-weight", FONT_WEIGHT[tail]]] } : { error: `${P} unknown font utility '${t}'.` };
    case "leading": return { error: `${P} leading-* (line-height) isn't controllable yet. ('${t}')` };
    case "tracking": return { error: `${P} tracking-* (letter-spacing) has no target. ('${t}')` };
    case "z": return { decls: [["z-index", tail]] }; // → fails in mapCss
    case "top": return num(tail, (n) => [["top", sp(n)]], t);
    case "left": return num(tail, (n) => [["left", sp(n)]], t);
    case "right": return num(tail, (n) => [["right", sp(n)]], t);
    case "bottom": return num(tail, (n) => [["bottom", sp(n)]], t);
    case "inset": return { decls: [["inset", tail === "0" ? "0" : sp(tail)]] };
    case "opacity": return { decls: [["opacity", String(Number(tail) / 100)]] }; // → fails in mapCss
    case "shadow": return { error: `${P} shadow-* (box-shadow) has no GPU target yet (needs a shadow pass). ('${t}')` };
    case "ring": return { error: `${P} ring-* has no GPU target yet (no stroke primitive). ('${t}')` };
    case "blur": case "backdrop-blur": return { error: `${P} ${head}-* has no CSS path — real blur is the glass={{blur}} prop. ('${t}')` };
    case "transition": case "duration": case "ease": case "animate": return { error: `${P} ${head}-* has no animator — drive animation from React state. ('${t}')` };
    case "rotate": case "scale": case "translate": case "skew": return { error: `${P} ${head}-* (transform) has no GPU target yet. ('${t}')` };
    case "overflow-x": case "overflow-y": return { error: `${P} ${head} has no target — overflow clips both axes. ('${t}')` };
    case "grid-cols": case "col-span": case "row-span": return { error: `${P} grid utilities have no target (no grid layout). ('${t}')` };
    case "border": return { error: `${P} border-* isn't auto-mapped by compat yet — set the native \`border\` (px) + \`borderColor\` Style field directly. ('${t}')` };
  }

  if (t === "uppercase" || t === "lowercase" || t === "capitalize")
    return { error: `${P} text-transform isn't wired yet (no string transform in the text path). ('${t}')` };

  return { error: `${P} unknown utility '${t}' — not in the supported subset (see COVERAGE.md).` };
}

function num(tail: string, f: (n: string) => [string, string][], token: string): TwResult {
  if (tail === "px") return { decls: f("0.25") }; // n-px = 1px
  if (tail === "full") return { decls: f("0").map(([p]) => [p, "100%"] as [string, string]) }; // derive prop from the builder
  if (!/^-?\d*\.?\d+$/.test(tail)) return { error: `${P} '${token}' isn't a supported numeric utility.` };
  return { decls: f(tail) };
}

/** Resolve a full className string → merged CSS declarations + per-token errors. */
export function classNameToDecls(className: string): { decls: [string, string][]; errors: string[] } {
  const decls: [string, string][] = [];
  const errors: string[] = [];
  for (const token of className.split(/\s+/)) {
    if (!token) continue;
    const r = tailwindToken(token);
    if (r.error) errors.push(r.error);
    else if (r.decls) decls.push(...r.decls);
  }
  return { decls, errors };
}
