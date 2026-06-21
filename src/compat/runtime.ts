// kussetsu/compat — the opt-in RUNTIME resolver (the escape hatch for genuinely
// dynamic styles the build-time transform can't see: style={expr}, className={cn(…)}).
//
// It routes through the SAME mapping tables as the build-time path, so the supported
// subset is identical — and it STILL FAILS LOUD: an unsupported property throws a clear
// error naming the feature, rather than silently rendering wrong. The only thing it
// trades away is *when* you find out (render time vs build time). Default is build-time
// `error`; this is here for the cases where you consciously opt in.
//
// (The Babel→runtime emission — rewriting `style={expr}` to `style={__kStyle(expr)}` —
//  is the next increment; this module is the resolver it will call, usable directly today.)

import type { Style } from "../core/scene";
import { mapCssDeclarations } from "./style.ts";
import { classNameToDecls } from "./tailwind.ts";

/** Resolve a (possibly dynamic) inline-style object to a kussetsu Style. Throws loud. */
export function __kStyle(obj: Record<string, string | number> | null | undefined): Style {
  if (!obj) return {};
  const { style, errors } = mapCssDeclarations(Object.entries(obj));
  if (errors.length) throw new Error(errors.map((e) => e.message).join("\n"));
  return style as Style;
}

/** Resolve a (possibly dynamic) className string to a kussetsu Style. Throws loud. */
export function __kClass(className: string | null | undefined): Style {
  if (!className) return {};
  const { decls, errors: tw } = classNameToDecls(className);
  const { style, errors } = mapCssDeclarations(decls);
  const all = [...tw, ...errors.map((e) => e.message)];
  if (all.length) throw new Error(all.join("\n"));
  return style as Style;
}

/** Merge className + inline style with inline winning (CSS-ish precedence). */
export function __kMerge(className?: string, style?: Record<string, string | number>): Style {
  return { ...__kClass(className), ...__kStyle(style) };
}
