// Examples entry: pick a demo by URL and mount it on a Kussetsu root. The renderer
// itself is createGpuRoot() in ./runtime — everything here is example/dev wiring.
import { createElement, type ComponentType } from "react";
import { createGpuRoot, type GpuRootOptions } from "../core/runtime";
import { buildGlassPanel } from "./devPanel";
import { glassTuning } from "../core/glassTuning";
import { App } from "./App";
import { ChatApp } from "./ChatApp";
import { CompatDemo } from "./compat";
import { runStress } from "./stress";

const canvas = document.getElementById("gpu") as HTMLCanvasElement;

function showError(err: unknown) {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#f88;font:600 18px system-ui">${(err as Error).message}</div>`,
  );
  throw err;
}

async function boot(Component: ComponentType, opts: GpuRootOptions) {
  try {
    const root = await createGpuRoot(canvas, opts);
    // Dev tooling (NOT part of the renderer): live glass tuning panel + console hooks.
    canvas.parentElement!.appendChild(buildGlassPanel(root.requestRender));
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
// `?compat` = the kussetsu/compat migration on-ramp (plain HTML/Tailwind → GPU).
const params = new URLSearchParams(location.search);
if (params.has("stress")) {
  runStress(canvas).catch(showError);
} else if (params.has("demo")) {
  boot(App, { camera: false, pageScroll: true });
} else if (params.has("compat")) {
  boot(CompatDemo, { camera: false });
} else {
  boot(ChatApp, { camera: false });
}
