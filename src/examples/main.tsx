// Examples entry: pick a demo by URL and mount it on a Kussetsu root. The renderer
// itself is createGpuRoot() in ./runtime — everything here is example/dev wiring.
import { createElement, type ComponentType } from "react";
import { createGpuRoot, type GpuRootOptions } from "../core/runtime";
import { buildGlassPanel } from "./devPanel";
import { glassTuning } from "../core/glassTuning";
import { App } from "./App";
import { CompatDemo } from "./compat";
import { bootCommandMenu } from "./CommandMenuDemo";
import { FxGallery } from "./FxGallery";
import { MorphDemo } from "./MorphDemo";
import { Showcase } from "./Showcase";
import { MainPage } from "./MainPage";
import { MarketingPage, BG_LIGHTS } from "./MarketingPage";
import { runStress } from "./stress";

const canvas = document.getElementById("gpu") as HTMLCanvasElement;

function showError(err: unknown) {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#f88;font:600 18px system-ui">${(err as Error).message}</div>`,
  );
  throw err;
}

async function boot(Component: ComponentType, opts: GpuRootOptions, devPanel = true) {
  try {
    const root = await createGpuRoot(canvas, opts);
    // Dev tooling (NOT part of the renderer): live glass tuning panel + console hooks.
    if (devPanel) canvas.parentElement!.appendChild(buildGlassPanel(root.requestRender));
    (window as unknown as { __glass?: typeof glassTuning; __frame?: () => void }).__glass = glassTuning;
    (window as unknown as { __frame?: () => void }).__frame = root.frame;
    root.render(createElement(Component));
    // eslint-disable-next-line no-console
    console.log("[kussetsu] booted — React driving a WebGPU canvas, DOM only for a11y + input");
  } catch (err) {
    showError(err);
  }
}

// Default: the glass chat app. `?stress` = 10k-node demo, `?demo` = kitchen sink,
// `?compat` = the migration on-ramp, `?menu` = the ⌘K glass command palette over a
// live feed ("impossible in CSS").
const params = new URLSearchParams(location.search);
if (params.has("stress")) {
  runStress(canvas).catch(showError);
} else if (params.has("demo")) {
  boot(MainPage, { camera: false, pageScroll: true, textSelectable: true }); // the capability showcase
} else if (params.has("kitchen")) {
  boot(App, { camera: false, pageScroll: true }); // kitchen-sink demo
} else if (params.has("compat")) {
  boot(CompatDemo, { camera: false });
} else if (params.has("menu")) {
  bootCommandMenu(canvas).catch(showError);
} else if (params.has("fx")) {
  boot(FxGallery, { camera: false });
} else if (params.has("spring")) {
  boot(MorphDemo, { camera: false });
} else if (params.has("showcase")) {
  boot(Showcase, { camera: false }); // the old tabbed showcase
} else {
  // Marketing site WITH the glass tuning panel. Seed it with the current light-glass look so
  // enabling the sliders starts from here, not the dark demo defaults. NOTE: while the panel
  // is live it overrides EVERY glass panel with one shared param set (nav/cards/CTA become
  // identical) — find a look you like, then I bake it back into the per-element specs.
  boot(MarketingPage, { camera: false, background: BG_LIGHTS }, false); // marketing site, no dev panel
}
