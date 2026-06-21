import { createElement } from "react";
import { createRoot } from "./hostConfig";
import { Painter } from "./webgpu";
import { layout } from "./layout";
import { SemanticsOverlay } from "./a11y";
import { collectRects, collectTexts, collectSemantics, collectGlass } from "./collect";
import type { Camera, Container, ElementNode } from "./scene";
import { App } from "./App";
import { runStress } from "./stress";

const canvas = document.getElementById("gpu") as HTMLCanvasElement;
const a11yHost = document.getElementById("a11y") as HTMLElement;

let focusedId: number | null = null;

const container: Container = { kind: "container", canvas, children: [], dirty: true };

async function boot() {
  let painter: Painter;
  try {
    painter = await Painter.create(canvas);
  } catch (err) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#f88;font:600 18px system-ui">${(err as Error).message}</div>`,
    );
    throw err;
  }

  const camera: Camera = { tx: 0, ty: 0, scale: 1 };
  const overlay = new SemanticsOverlay(
    a11yHost,
    {
      setFocusRing(id) {
        focusedId = id != null ? Number(id) : null;
        container.dirty = true;
      },
    },
    () => camera.scale,
  );

  // Pan: drag empty space (events fall through the overlay to the canvas).
  let panning = false;
  let panX = 0;
  let panY = 0;
  canvas.addEventListener("pointerdown", (e) => {
    panning = true;
    panX = e.clientX;
    panY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!panning) return;
    camera.tx += e.clientX - panX;
    camera.ty += e.clientY - panY;
    panX = e.clientX;
    panY = e.clientY;
    container.dirty = true;
  });
  const endPan = (e: PointerEvent) => {
    panning = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  };
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);

  // Zoom around the cursor.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const ns = Math.min(3, Math.max(0.35, camera.scale * Math.exp(-e.deltaY * 0.0015)));
      const wx = (e.offsetX - camera.tx) / camera.scale;
      const wy = (e.offsetY - camera.ty) / camera.scale;
      camera.tx = e.offsetX - wx * ns;
      camera.ty = e.offsetY - wy * ns;
      camera.scale = ns;
      container.dirty = true;
    },
    { passive: false },
  );

  const rootElement = (): ElementNode | null =>
    (container.children.find((c) => c.kind === "element") as ElementNode | undefined) ?? null;

  function loop() {
    if (container.dirty) {
      container.dirty = false;
      const root = rootElement();
      if (root) {
        const { cssWidth, cssHeight } = painter.size();
        layout(root, cssWidth, cssHeight);
        painter.frame(collectRects(root, focusedId, camera), collectTexts(root, camera), collectGlass(root, camera));
        overlay.syncFromScene(collectSemantics(root, camera));
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  addEventListener("resize", () => {
    container.dirty = true;
  });

  createRoot(container).render(createElement(App));
  // eslint-disable-next-line no-console
  console.log("[gpu-ui] booted — React is driving a WebGPU canvas, zero DOM for visuals");
}

// Default: the 10k-node stress demo. `?react` runs the React-reconciler demo.
if (new URLSearchParams(location.search).has("react")) {
  boot();
} else {
  runStress(canvas, a11yHost).catch((err) => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#f88;font:600 18px system-ui">${(err as Error).message}</div>`,
    );
    throw err;
  });
}
