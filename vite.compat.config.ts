import { defineConfig } from "vite";

// Builds the kussetsu/compat on-ramp as published subpaths, SEPARATE from the core renderer
// (vite.lib.config.ts) so it can't bundle the build-time deps into the browser library:
//   - dist/compat/index.js     — the BUILD-TIME plugin (Vite + Babel). Node; @babel/core is a
//                                (optional) peer, vite is the consumer's own. Imported in a
//                                vite.config: `import { kussetsuCompatVite } from "kussetsu/compat"`.
//   - dist/compat/runtime.js   — the opt-in BROWSER runtime resolver (__kStyle/__kClass/__kMerge)
//                                for dynamic styles. Pure mappers only — no @babel/core — so it's
//                                safe to import into app code: `import { __kStyle } from "kussetsu/compat/runtime"`.
// emptyOutDir:false so it doesn't wipe the core build's dist/ (run after vite.lib.config.ts).
export default defineConfig({
  build: {
    lib: {
      entry: { "compat/index": "src/compat/index.ts", "compat/runtime": "src/compat/runtime.ts" },
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: false,
    target: "es2022",
    minify: false,
    rollupOptions: {
      // build-time host (babel) + the consumer's own toolchain are never bundled.
      external: ["@babel/core", "vite", "react", "react-dom", "react/jsx-runtime"],
    },
  },
});
