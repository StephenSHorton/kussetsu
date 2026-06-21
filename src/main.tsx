import { createElement } from "react";
import { createRoot } from "./hostConfig";
import { Painter } from "./webgpu";
import { SemanticsOverlay } from "./a11y";
import { collectRects, collectTexts, collectSemantics, collectGlass, collectScrollRegions, collectSelection, collectSelectable, collectEditable, editCaretRect, type ScrollRegion, type Selection, type SelectableRegion, type EditableRegion } from "./collect";
import { hitTest, measureWidth } from "./text";
import type { Camera, Container, ElementNode } from "./scene";
import { App } from "./App";
import { ChatApp } from "./ChatApp";
import { runStress } from "./stress";
import type { ComponentType } from "react";

const canvas = document.getElementById("gpu") as HTMLCanvasElement;
const a11yHost = document.getElementById("a11y") as HTMLElement;

let focusedId: number | null = null;

const container: Container = { kind: "container", canvas, children: [], dirty: true };

async function boot(Component: ComponentType, opts: { camera: boolean } = { camera: true }) {
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

  // Editing (Gap C): a transparent <input> overlaid on an editable field captures
  // keyboard + IME/composition (the browser does IME); the canvas renders the value
  // + caret. This sidesteps "a canvas can't receive composition events".
  let editables: EditableRegion[] = [];
  let editingId: number | null = null;
  let caretOffset = 0;
  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.setAttribute("aria-label", "Edit field");
  Object.assign(editInput.style, {
    position: "absolute",
    display: "none",
    margin: "0",
    padding: "0 8px",
    border: "0",
    background: "transparent",
    color: "transparent",
    caretColor: "transparent", // we paint our own caret on the GPU
    outline: "none",
    boxSizing: "border-box",
    zIndex: "50",
  } as Partial<CSSStyleDeclaration>);
  (document.getElementById("stage") as HTMLElement).appendChild(editInput);

  const positionInput = (r: EditableRegion) => {
    editInput.style.left = `${r.x}px`;
    editInput.style.top = `${r.y}px`;
    editInput.style.width = `${r.w}px`;
    editInput.style.height = `${r.h}px`;
  };
  const caretFromClick = (r: EditableRegion, screenX: number): number => {
    const t = r.textNode;
    if (!t) return r.value.length;
    const localX = (screenX - (t.x * camera.scale + camera.tx)) / camera.scale;
    const s = t.props.style ?? {};
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i <= r.value.length; i++) {
      const d = Math.abs(measureWidth(r.value.slice(0, i), s) - localX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const syncCaret = () => {
    caretOffset = editInput.selectionStart ?? editInput.value.length;
    container.dirty = true;
  };
  editInput.addEventListener("input", () => {
    editables.find((e) => e.id === editingId)?.onChange?.(editInput.value);
    syncCaret();
  });
  editInput.addEventListener("keyup", syncCaret);
  editInput.addEventListener("click", syncCaret);
  editInput.addEventListener("select", syncCaret);
  editInput.addEventListener("blur", () => {
    editingId = null;
    editInput.style.display = "none";
    container.dirty = true;
  });
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
    // Clicking an editable field focuses the hidden <input> (keyboard + IME).
    for (let i = editables.length - 1; i >= 0; i--) {
      const r = editables[i];
      if (e.offsetX >= r.x && e.offsetX <= r.x + r.w && e.offsetY >= r.y && e.offsetY <= r.y + r.h) {
        editingId = r.id;
        editInput.style.display = "block";
        positionInput(r);
        editInput.value = r.value;
        const off = caretFromClick(r, e.offsetX);
        caretOffset = off;
        // Focus AFTER the default mousedown focus-change, or it steals focus back.
        setTimeout(() => {
          editInput.focus();
          editInput.setSelectionRange(off, off);
        }, 0);
        container.dirty = true;
        return;
      }
    }
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
    if (opts.camera) {
      panning = true;
      panX = e.clientX;
      panY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    }
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
      if (!opts.camera) return; // an app shouldn't zoom; only its lists scroll
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
    editables = collectEditable(root, camera);
    const rects = [...collectRects(root, focusedId, camera, scrollY), ...collectSelection(root, selection, camera)];
    if (editingId != null) {
      const r = editables.find((e) => e.id === editingId);
      if (r) {
        positionInput(r); // keep the input over the field as layout moves
        const caret = editCaretRect(r, caretOffset, camera);
        if (caret) rects.push(caret);
      }
    }
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

  createRoot(container).render(createElement(Component));
  // eslint-disable-next-line no-console
  console.log("[gpu-ui] booted — React is driving a WebGPU canvas, zero DOM for visuals");
}

// Default: the glass chat app. `?stress` = 10k-node demo, `?demo` = kitchen sink.
const params = new URLSearchParams(location.search);
if (params.has("stress")) {
  runStress(canvas, a11yHost).catch((err) => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#f88;font:600 18px system-ui">${(err as Error).message}</div>`,
    );
    throw err;
  });
} else if (params.has("demo")) {
  boot(App, { camera: true });
} else {
  boot(ChatApp, { camera: false });
}
