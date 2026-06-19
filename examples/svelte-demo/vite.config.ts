import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Project GitHub Pages serve under /<repo>/, so the production build needs a
// matching base. Local dev stays at root.
export default defineConfig(({ command }) => ({
  plugins: [svelte()],
  base: command === "build" ? "/glaze/" : "/",
  server: { port: 5273, open: false },
  // Workspace packages: @glaze/svelte ships .svelte/.ts source (let the svelte
  // plugin compile it); @glaze/core ships dist ESM. Keep both out of the
  // esbuild dep pre-bundler.
  optimizeDeps: { exclude: ["@glaze/core", "@glaze/svelte"] },
}));
