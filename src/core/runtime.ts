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
import { ParticleSystem } from "./particles";
import { SemanticsOverlay } from "./a11y";
import {
  collectRects,
  collectTexts,
  collectSemantics,
  collectGlass,
  collectMaterials,
  collectForeground,
  collectScrollRegions,
  collectSelection,
  collectSelectable,
  selectionToText,
  collectParticles,
  collectPostProcess,
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
  /** Make ALL text drag-selectable + copyable (Cmd/Ctrl+C), like a normal page. Default false. */
  textSelectable?: boolean;
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
  const opts = { camera: true, pageScroll: false, textSelectable: false, ...options };

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
  let lastPointer: [number, number] = [0, 0]; // css px, for shader materials
  let materialsPresent = false;
  let particlesPresent = false;
  const particleSystems = new Map<number, ParticleSystem>(); // persists per emitter node across frames
  let lastSimTime = performance.now();
  let lastScreenPointer: [number, number] | null = null; // for cursor-velocity ("fling") on particles

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
  // Locate the text node + caret offset under a screen point. Exact hit if over a region;
  // otherwise the nearest region by vertical distance (so a drag through gaps still extends
  // the selection to the closest text). Returns null only if there are no selectable texts.
  const locate = (px: number, py: number): { id: number; offset: number } | null => {
    for (let i = selectables.length - 1; i >= 0; i--) {
      const r = selectables[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        return { id: r.id, offset: hitTest(r.node.wrapped!.result, (px - r.x) / r.scale, (py - r.y) / r.scale) };
      }
    }
    let best: SelectableRegion | null = null;
    let bestD = Infinity;
    for (const r of selectables) {
      const d = Math.abs(py - Math.max(r.y, Math.min(py, r.y + r.h)));
      if (d < bestD) { bestD = d; best = r; }
    }
    if (!best) return null;
    const lx = Math.max(0, Math.min(best.w, px - best.x)) / best.scale;
    const ly = Math.max(0, Math.min(best.h - 1, py - best.y)) / best.scale;
    return { id: best.id, offset: hitTest(best.node.wrapped!.result, lx, ly) };
  };

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
    // Pressing on text starts a selection (takes precedence over pan). Only when the press
    // actually lands on a region — a press on empty space clears any selection and falls through.
    if (selectables.length) {
      const overText = selectables.some((r) => e.offsetX >= r.x && e.offsetX <= r.x + r.w && e.offsetY >= r.y && e.offsetY <= r.y + r.h);
      if (overText) {
        const hit = locate(e.offsetX, e.offsetY)!;
        selection = { anchorId: hit.id, anchorOffset: hit.offset, focusId: hit.id, focusOffset: hit.offset };
        selecting = true;
        canvas.setPointerCapture(e.pointerId);
        container.dirty = true;
        return;
      }
      if (selection) { selection = null; container.dirty = true; } // click off text clears the selection
    }
    if (opts.camera) {
      panning = true;
      panX = e.clientX;
      panY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    lastPointer = [e.offsetX, e.offsetY];
    if (materialsPresent) container.dirty = true; // pointer-reactive shaders repaint
    if (selecting && selection) {
      const hit = locate(e.offsetX, e.offsetY);
      if (hit) {
        selection = { ...selection, focusId: hit.id, focusOffset: hit.offset };
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
    // Canvas-relative coords from clientX/Y — NOT e.offsetX/Y, which is relative to the
    // event target. The wheel can fire over an a11y proxy (a transparent <button>) on top
    // of the canvas, and offsetX/Y would then be proxy-relative; clientX/Y - canvasRect is
    // always canvas-relative. (The listener is on `host` so it catches those proxy events.)
    const rect = canvas.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    for (let i = scrollRegions.length - 1; i >= 0; i--) {
      const r = scrollRegions[i];
      if (ox >= r.rect[0] && ox <= r.rect[0] + r.rect[2] && oy >= r.rect[1] && oy <= r.rect[1] + r.rect[3]) {
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
    const wx = (ox - camera.tx) / camera.scale;
    const wy = (oy - camera.ty) / camera.scale;
    camera.tx = ox - wx * ns;
    camera.ty = oy - wy * ns;
    camera.scale = ns;
    container.dirty = true;
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  host.addEventListener("wheel", onWheel, { passive: false }); // on host so it also catches wheel over a11y proxies

  // Cmd/Ctrl+C copies the painted text selection to the real clipboard (the selection is
  // GPU-painted, so the browser's native copy has nothing to grab). Skip while editing a
  // field, so the input's own copy works.
  const onCopy = (e: KeyboardEvent) => {
    if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") || editingId != null || !selection) return;
    const text = selectionToText(selectables, selection);
    if (!text) return;
    e.preventDefault();
    navigator.clipboard?.writeText(text).catch(() => {});
  };
  window.addEventListener("keydown", onCopy);

  const rootElement = (): ElementNode | null =>
    (container.children.find((c) => c.kind === "element") as ElementNode | undefined) ?? null;

  function renderFrame() {
    const root = rootElement();
    if (!root) return;
    const { cssWidth, cssHeight } = painter.size();
    layoutWithYoga(root, cssWidth, cssHeight, opts.textSelectable);
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
    selectables = collectSelectable(root, camera, opts.textSelectable);
    editables = collectEditable(root, camera);
    const fg = collectForeground(root, camera); // glass children, drawn ON the glass
    const rects = [...collectRects(root, focusedId, camera, scrollY), ...collectSelection(selectables, selection)];
    if (editingId != null) {
      const r = editables.find((e) => e.id === editingId);
      if (r) {
        positionInput(r); // keep the input over the field as layout moves
        const caret = editCaretRect(r, caretOffset, camera);
        if (caret) fg.rects.push(caret); // caret on top (composer input sits on glass)
      }
    }
    const materials = collectMaterials(root, camera);
    materialsPresent = materials.length > 0;

    // Particles: CPU-simulate each emitter, persisting state per node id, then concatenate
    // into one instance buffer (world coords; the painter applies the camera + bloom).
    const pNodes = collectParticles(root);
    particlesPresent = pNodes.length > 0;
    let particles: { data: Float32Array; count: number } | undefined;
    if (pNodes.length) {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0, (now - lastSimTime) / 1000)) || 0.016;
      lastSimTime = now;
      const ptr: [number, number] = [(lastPointer[0] - camera.tx) / camera.scale, (lastPointer[1] - camera.ty) / camera.scale];
      // Cursor velocity from the SCREEN cursor (not world), so page scrolling — which moves the
      // world pointer without the mouse moving — doesn't fake a fling. Convert to world (/scale).
      let pvel: [number, number] = [0, 0];
      if (lastScreenPointer) {
        const vx = (lastPointer[0] - lastScreenPointer[0]) / dt / camera.scale;
        const vy = (lastPointer[1] - lastScreenPointer[1]) / dt / camera.scale;
        const mag = Math.hypot(vx, vy);
        const MAX = 5000;
        pvel = mag > MAX ? [(vx / mag) * MAX, (vy / mag) * MAX] : [vx, vy];
      }
      lastScreenPointer = [lastPointer[0], lastPointer[1]];
      const live = new Set<number>();
      let total = 0;
      for (const pn of pNodes) {
        live.add(pn.id);
        let sys = particleSystems.get(pn.id);
        if (!sys) particleSystems.set(pn.id, (sys = new ParticleSystem(pn.spec)));
        sys.update(dt, pn.rect, ptr, pvel, pn.spec, camera);
        total += sys.count;
      }
      for (const id of [...particleSystems.keys()]) if (!live.has(id)) particleSystems.delete(id);
      const data = new Float32Array(total * 8);
      let off = 0;
      for (const pn of pNodes) {
        const sys = particleSystems.get(pn.id)!;
        data.set(sys.inst, off);
        off += sys.count * 8;
      }
      particles = { data, count: total };
    }

    painter.frame(rects, collectTexts(root, camera, scrollY), collectGlass(root, camera), fg, materials, {
      time: performance.now() / 1000,
      pointer: lastPointer,
      particles,
      post: collectPostProcess(root, camera), // a node's postProcess prop → effect masked to its box
    });
    overlay.syncFromScene(collectSemantics(root, camera, scrollY));
    // animated materials + particles drive a continuous repaint loop
    if (materialsPresent && materials.some((m) => m.animated)) container.dirty = true;
    if (particlesPresent) container.dirty = true;
  }

  let rafId = 0;
  let timerId = 0;
  const renderIfDirty = () => {
    if (container.dirty) {
      container.dirty = false;
      renderFrame();
    }
  };
  const rafLoop = () => { renderIfDirty(); rafId = requestAnimationFrame(rafLoop); };
  // Fallback loop: requestAnimationFrame is throttled (and paused for background tabs) when
  // the window isn't OS-focused, which would freeze the canvas even though DOM input + React
  // state still update — so a click would change state but never repaint. A setTimeout loop
  // keeps dirty frames flushing (~5fps unfocused; the browser clamps it to ~1fps in a true
  // background tab) so interactions always repaint. rAF still drives smooth 60fps animation
  // when focused; renderIfDirty() no-ops when nothing changed, so the timer is nearly free.
  const timerLoop = () => { renderIfDirty(); timerId = window.setTimeout(timerLoop, 200); };
  rafId = requestAnimationFrame(rafLoop);
  timerId = window.setTimeout(timerLoop, 200);

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
      clearTimeout(timerId);
      removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPan);
      canvas.removeEventListener("pointercancel", endPan);
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onCopy);
      reactRoot.unmount();
      a11yHost.remove();
      editInput.remove();
    },
  };
}
