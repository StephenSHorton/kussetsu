import { defineConfig } from "vite";

// Library build of the Kussetsu core (the renderer + public API in src/core/index.ts), kept
// separate from the marketing/demo SITE build (vite.config.ts). Emits an ESM bundle to dist/;
// React, the reconciler/scheduler, and yoga are externalized (declared as peer/deps, installed
// alongside, not bundled). Type declarations are emitted by `tsc -p tsconfig.lib.json`.
export default defineConfig({
  build: {
    lib: { entry: "src/core/index.ts", formats: ["es"], fileName: () => "index.js" },
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "react-reconciler", "scheduler", "yoga-layout"],
    },
  },
});
