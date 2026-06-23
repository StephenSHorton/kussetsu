// kussetsu/compat — the Vite plugin.
//
// NOTE on integration: vite 8 (rolldown) + @vitejs/plugin-react 6 transform JSX with
// OXC, not Babel — there is no shared Babel pass to ride. So compat runs its OWN small
// Babel pass as an `enforce:'pre'` plugin, ahead of the React transform: it rewrites the
// migrated HTML tag set into <view>/<text> + a mapped style (still JSX), then hands the
// result to the normal pipeline for jsx-runtime lowering + TS stripping. Bringing our
// own @babel/core makes the on-ramp independent of how the React plugin lowers JSX.

import * as babel from "@babel/core";
import kussetsuCompat from "./babel.ts";

export interface CompatOptions {
  /** Which files to transform. Default: .jsx/.tsx under the project. */
  include?: RegExp;
  /** Files to skip even if they match `include` — e.g. the renderer's own core, which
   *  legitimately authors real DOM (`<div>`/`<canvas>`) and isn't a migration target. */
  exclude?: RegExp;
}

/** The shape we return — a minimal, structural Vite plugin (`name` + `enforce:'pre'` + a
 *  `transform` hook). It's assignable to vite's `Plugin`, so `plugins: [kussetsuCompatVite()]`
 *  type-checks, WITHOUT making the published types import (and re-bundle) vite's whole type graph.
 *  `map` is `any` because it's a build-time source map handed straight to vite. */
export interface CompatVitePlugin {
  name: string;
  enforce: "pre";
  transform(code: string, id: string): Promise<{ code: string; map?: any } | null>;
}

export function kussetsuCompatVite(options: CompatOptions = {}): CompatVitePlugin {
  const include = options.include ?? /\.[jt]sx$/;
  const { exclude } = options;
  return {
    name: "kussetsu-compat",
    enforce: "pre", // run BEFORE @vitejs/plugin-react's OXC JSX transform
    async transform(code, id) {
      if (id.includes("/node_modules/")) return null;
      const clean = id.split("?")[0];
      if (!include.test(clean) || exclude?.test(clean)) return null;
      // Cheap skip: only pay the parse cost on files that could contain migratable HTML.
      if (!/<\s*[a-z][a-z0-9]*[\s/>]/.test(code)) return null;

      const result = babel.transformSync(code, {
        configFile: false,
        babelrc: false,
        filename: id,
        plugins: [kussetsuCompat],
        parserOpts: { plugins: ["jsx", "typescript"] },
        // Keep TS + JSX in the output; the React plugin/OXC lowers + strips them next.
        generatorOpts: { retainLines: true },
        sourceMaps: true,
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    },
  };
}

export default kussetsuCompatVite;
