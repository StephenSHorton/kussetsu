import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { kussetsuCompatVite } from "./src/compat/vite";

// vite 8 (rolldown) + @vitejs/plugin-react 6 lower JSX with OXC, not Babel — so there's
// no shared Babel pass to hook. kussetsu/compat runs its own small Babel pass FIRST
// (enforce:'pre'): it rewrites the migrated HTML tag set (div/span/button/input/…) into
// <view>/<text> + a mapped style, then the React plugin lowers the result as usual.
// Hand-authored <view>/<text> are left untouched, so migrated HTML and the owned
// vocabulary coexist in one tree.
export default defineConfig(({ command }) => ({
  // Project Pages serve under /<repo>/. Only the production build needs the prefix;
  // local dev stays at "/" (http://localhost:5280).
  base: command === "build" ? "/kussetsu/" : "/",
  // The SITE build outputs to dist-site/ so it can't clobber the LIBRARY build's dist/
  // (vite.lib.config.ts), which is what package.json main/types/exports point at.
  build: { outDir: "dist-site" },
  plugins: [kussetsuCompatVite(), react()],
  server: { port: 5280 },
}));
