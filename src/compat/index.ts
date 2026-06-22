// kussetsu/compat — a BUILD-TIME migration on-ramp.
//
// Tag-aliases an existing React app's HTML (div→view, p/h*/span→text, button→view+role,
// text input→editable) and maps inline style + a bounded Tailwind subset onto kussetsu's
// `Style` — and REFUSES, at build time with a file:line, everything it can't paint
// (icons/images, shadows/borders, gradients, margins, grid, hover/responsive variants,
// transforms, portals…). The failure mode is a compile error you read, not a blank box
// you ship. It's a HEAD START for the supported subset, not "your app just works."
//
//   // vite.config.ts  (runs in-repo today; not yet a published `kussetsu/compat` subpath)
//   import { kussetsuCompatVite } from "./src/compat";
//   plugins: [kussetsuCompatVite(), react()]  // BEFORE react() — it runs an enforce:'pre' pass
//
// See COVERAGE.md (what maps / what's a renderer feature in disguise) and DESIGN.md.

export { default } from "./vite.ts";
export { kussetsuCompatVite } from "./vite.ts";
export { default as kussetsuCompatBabel } from "./babel.ts";

// Pure mappers (framework-agnostic — an SWC/oxc front-end could reuse them):
export { mapCssDeclarations } from "./style.ts";
export { tailwindToken, classNameToDecls } from "./tailwind.ts";
export { mapTag } from "./tags.ts";
export { parseColor, parseLength } from "./parse.ts";

// Opt-in runtime resolver for dynamic styles (still fails loud, at render time):
export { __kStyle, __kClass, __kMerge } from "./runtime.ts";
