import { createElement } from "react";
import { createRoot } from "./hostConfig";
import { Painter } from "./webgpu";
import { layout } from "./layout";
import { SemanticsOverlay } from "./a11y";
import { collectRects, collectTexts, collectSemantics, collectGlass } from "./collect";
import type { Container, ElementNode } from "./scene";
import { App } from "./App";

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

  const overlay = new SemanticsOverlay(a11yHost, {
    setFocusRing(id) {
      focusedId = id != null ? Number(id) : null;
      container.dirty = true;
    },
  });

  const rootElement = (): ElementNode | null =>
    (container.children.find((c) => c.kind === "element") as ElementNode | undefined) ?? null;

  function loop() {
    if (container.dirty) {
      container.dirty = false;
      const root = rootElement();
      if (root) {
        const { cssWidth, cssHeight } = painter.size();
        layout(root, cssWidth, cssHeight);
        painter.frame(collectRects(root, focusedId), collectTexts(root), collectGlass(root));
        overlay.syncFromScene(collectSemantics(root));
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

boot();
