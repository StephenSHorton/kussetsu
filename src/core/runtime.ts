// The Kussetsu runtime. Hand it a <canvas> (inside a positioned parent), render
// React into it, and you get GPU paint + an invisible-DOM accessibility/input
// overlay + the animation loop for free. This is the public entry point.
//
//   const root = await createGpuRoot(canvas, { camera: false });
//   root.render(<App />);   // App authored with <view>/<text> host elements
//
import type { ReactNode } from "react";
import { createRoot } from "./hostConfig";
import { Painter } from "./webgpu";
import { SemanticsOverlay } from "./a11y";
import {
  collectRects,
  collectTexts,
  collectSemantics,
  collectGlass,
  collectForeground,
  collectScrollRegions,
  collectSelection,
  collectSelectable,
  collectEditable,
  editCaretRect,
  type ScrollRegion,
  type Selection,
  type SelectableRegion,
  type EditableRegion,
} from "./collect";
import { hitTest, measureWidth } from "./text";
import type { Camera, Container, ElementNode } from "./scene";

export interface GpuRootOptions {
  /** Pan by dragging empty space + zoom on the wheel. Default true. */
  camera?: boolean;
  /** Wheel scrolls the whole page vertically (clamped to content). Default false. */
  pageScroll?: boolean;
}

export interface GpuRoot {
  /** Mount/replace the React tree. Author with the `<view>`/`<text>` host elements. */
  render(element: ReactNode): void;
  /** Force a synchronous render now (handy in tests / backgrounded tabs). */
  frame(): void;
  /** Mark dirty; the animation loop renders on the next frame. */
  requestRender(): void;
  /** Tear down: stop the loop, remove the overlay/input, unmount React. */
  destroy(): void;
}

/** Create a Kussetsu root that paints `canvas` on the GPU and bridges a11y + input.
 *  `canvas` must live inside a positioned parent (the overlay is placed over it). */
export async function createGpuRoot(canvas: HTMLCanvasElement, options: GpuRootOptions = {}): Promise<GpuRoot> {
  const opts = { camera: true, pageScroll: false, ...options };

  // Real layout (Yoga, WASM). Dynamic import keeps it out of bundles that lay nothing out.
  const { layoutWithYoga } = await import("./yogaLayout");
  const painter = await Painter.create(canvas);

  const host = canvas.parentElement ?? document.body;
  const container: Container = { kind: "container", canvas, children: [], dirty: true };
  let focusedId: number | null = null;

  // The invisible semantics + input overlay, placed exactly over the canvas.
  const a11yHost = document.createElement("div");
  Object.assign(a11yHost.style, { position: "absolute", inset: "0", pointerEvents: "none" } as Partial<CSSStyleDeclaration>);
  host.appendChild(a11yHost);

  const camera: Camera = { tx: 0, ty: 0, scale: 1 };
  const scrollY = new Map<number, number>(); // node.id -> scroll offset (world px)
  let scrollRegions: ScrollRegion[] = []; // refreshed each frame for wheel routing
  let selection: Selection | null = null;
  let selectables: SelectableRegion[] = [];
  let selecting = false;
  let contentBottom = 0; // lowest laid-out pixel — clamps page-scroll
  let viewportH = 0;

  // Editable text: a transparent <input> overlaid on a field captures keyboard +
  // IME/composition (the browser does IME); the canvas renders the value + caret.
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
  host.appendChild(editInput);

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

  // ── pointer + wheel input: pan / zoom / scroll / select / edit ──
  let panning = false;
  let panX = 0;
  let panY = 0;
  const caretAt = (r: SelectableRegion, e: PointerEvent) =>
    hitTest(r.node.wrapped!.result, (e.offsetX - r.x) / r.scale, (e.offsetY - r.y) / r.scale);

  const onPointerDown = (e: PointerEvent) => {
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
  };
  const onPointerMove = (e: PointerEvent) => {
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
  };
  const endPan = (e: PointerEvent) => {
    panning = false;
    selecting = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  };
  const onWheel = (e: WheelEvent) => {
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
    if (opts.pageScroll) {
      // Page-scroll mode: wheel moves the whole page vertically (clamped to content
      // height) — a normal scrollable page, not an infinite canvas.
      const maxScroll = Math.max(0, contentBottom - viewportH + 24);
      camera.ty = Math.min(0, Math.max(-maxScroll, camera.ty - e.deltaY));
      container.dirty = true;
      return;
    }
    if (!opts.camera) return; // an app shouldn't zoom; only its lists scroll
    const ns = Math.min(3, Math.max(0.35, camera.scale * Math.exp(-e.deltaY * 0.0015)));
    const wx = (e.offsetX - camera.tx) / camera.scale;
    const wy = (e.offsetY - camera.ty) / camera.scale;
    camera.tx = e.offsetX - wx * ns;
    camera.ty = e.offsetY - wy * ns;
    camera.scale = ns;
    container.dirty = true;
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const rootElement = (): ElementNode | null =>
    (container.children.find((c) => c.kind === "element") as ElementNode | undefined) ?? null;

  function renderFrame() {
    const root = rootElement();
    if (!root) return;
    const { cssWidth, cssHeight } = painter.size();
    layoutWithYoga(root, cssWidth, cssHeight);
    viewportH = cssHeight;
    if (opts.pageScroll) {
      contentBottom = 0;
      const measureBottom = (n: ElementNode) => {
        contentBottom = Math.max(contentBottom, n.y + n.h);
        if (n.props.style?.overflow) return; // clipped container — its children don't grow the page
        for (const c of n.children) if (c.kind === "element") measureBottom(c);
      };
      measureBottom(root);
    }
    scrollRegions = collectScrollRegions(root, camera, scrollY);
    selectables = collectSelectable(root, camera);
    editables = collectEditable(root, camera);
    const fg = collectForeground(root, camera); // glass children, drawn ON the glass
    const rects = [...collectRects(root, focusedId, camera, scrollY), ...collectSelection(root, selection, camera)];
    if (editingId != null) {
      const r = editables.find((e) => e.id === editingId);
      if (r) {
        positionInput(r); // keep the input over the field as layout moves
        const caret = editCaretRect(r, caretOffset, camera);
        if (caret) fg.rects.push(caret); // caret on top (composer input sits on glass)
      }
    }
    painter.frame(rects, collectTexts(root, camera, scrollY), collectGlass(root, camera), fg);
    overlay.syncFromScene(collectSemantics(root, camera, scrollY));
  }

  let rafId = 0;
  function loop() {
    if (container.dirty) {
      container.dirty = false;
      renderFrame();
    }
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  const onResize = () => {
    container.dirty = true;
  };
  addEventListener("resize", onResize);

  const reactRoot = createRoot(container);

  return {
    render(element) {
      reactRoot.render(element);
    },
    frame: renderFrame,
    requestRender() {
      container.dirty = true;
    },
    destroy() {
      cancelAnimationFrame(rafId);
      removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPan);
      canvas.removeEventListener("pointercancel", endPan);
      canvas.removeEventListener("wheel", onWheel);
      reactRoot.unmount();
      a11yHost.remove();
      editInput.remove();
    },
  };
}
