import { createElement } from "react";
import { createRoot } from "./hostConfig";
import { Painter } from "./webgpu";
import { SemanticsOverlay } from "./a11y";
import { collectRects, collectTexts, collectSemantics, collectGlass, collectScrollRegions, collectSelection, collectSelectable, type ScrollRegion, type Selection, type SelectableRegion } from "./collect";
import { hitTest } from "./text";
import type { Camera, Container, ElementNode } from "./scene";
import { App } from "./App";
import { runStress } from "./stress";

const canvas = document.getElementById("gpu") as HTMLCanvasElement;
const a11yHost = document.getElementById("a11y") as HTMLElement;

let focusedId: number | null = null;

const container: Container = { kind: "container", canvas, children: [], dirty: true };

async function boot() {
  // Real layout engine (Yoga, WASM). Lazy-imported so the stress route doesn't
  // pull in the WASM. The await also ensures Yoga's WASM is loaded before layout.
  const { layoutWithYoga } = await import("./yogaLayout");

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
  const scrollY = new Map<number, number>(); // node.id -> scroll offset (world px)
  let scrollRegions: ScrollRegion[] = []; // refreshed each frame for wheel routing
  let selection: Selection | null = null;
  let selectables: SelectableRegion[] = [];
  let selecting = false;
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
  const caretAt = (r: SelectableRegion, e: PointerEvent) =>
    hitTest(r.node.wrapped!.result, (e.offsetX - r.x) / r.scale, (e.offsetY - r.y) / r.scale);

  canvas.addEventListener("pointerdown", (e) => {
    // Clicking selectable text starts a selection (takes precedence over pan).
    for (let i = selectables.length - 1; i >= 0; i--) {
      const r = selectables[i];
      if (e.offsetX >= r.x && e.offsetX <= r.x + r.w && e.offsetY >= r.y && e.offsetY <= r.y + r.h) {
        const off = caretAt(r, e);
        selection = { nodeId: r.id, anchor: off, focus: off };
        selecting = true;
        canvas.setPointerCapture(e.pointerId);
        container.dirty = true;
        return;
      }
    }
    panning = true;
    panX = e.clientX;
    panY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (selecting && selection) {
      const r = selectables.find((s) => s.id === selection!.nodeId);
      if (r) {
        selection = { ...selection, focus: caretAt(r, e) };
        container.dirty = true;
      }
      return;
    }
    if (!panning) return;
    camera.tx += e.clientX - panX;
    camera.ty += e.clientY - panY;
    panX = e.clientX;
    panY = e.clientY;
    container.dirty = true;
  });
  const endPan = (e: PointerEvent) => {
    panning = false;
    selecting = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  };
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);

  // Wheel: scroll a region under the cursor if there is one, else zoom.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      for (let i = scrollRegions.length - 1; i >= 0; i--) {
        const r = scrollRegions[i];
        if (e.offsetX >= r.rect[0] && e.offsetX <= r.rect[0] + r.rect[2] && e.offsetY >= r.rect[1] && e.offsetY <= r.rect[1] + r.rect[3]) {
          const cur = scrollY.get(r.id) ?? 0;
          scrollY.set(r.id, Math.min(r.maxScroll, Math.max(0, cur + e.deltaY / camera.scale)));
          container.dirty = true;
          return;
        }
      }
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

  function renderFrame() {
    const root = rootElement();
    if (!root) return;
    const { cssWidth, cssHeight } = painter.size();
    layoutWithYoga(root, cssWidth, cssHeight);
    scrollRegions = collectScrollRegions(root, camera, scrollY);
    selectables = collectSelectable(root, camera);
    const rects = [...collectRects(root, focusedId, camera, scrollY), ...collectSelection(root, selection, camera)];
    painter.frame(rects, collectTexts(root, camera, scrollY), collectGlass(root, camera));
    overlay.syncFromScene(collectSemantics(root, camera, scrollY));
  }
  function loop() {
    if (container.dirty) {
      container.dirty = false;
      renderFrame();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // Force-render hook (rAF is paused in a backgrounded tab; lets verification render).
  (window as unknown as { __frame?: () => void }).__frame = renderFrame;

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
