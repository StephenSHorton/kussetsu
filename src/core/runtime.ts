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
  /** Full-screen WGSL background shader (`fn material(uv,px)->vec4f`) rendered into the backdrop,
   *  so glass refracts it. Same template/helpers as props.material. */
  background?: string;
  /** Called if the WebGPU device is lost (GPU crash/reset, sleep/wake, TDR). Kussetsu stops the
   *  render loop so it doesn't paint a dead device; there is no auto-recovery — prompt a reload.
   *  Not called for a normal `destroy()`. */
  onDeviceLost?: (info: { reason: string; message: string }) => void;
  /** Called with uncaptured GPU errors (validation/out-of-memory). Advisory; the loop continues. */
  onError?: (error: unknown) => void;
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
  painter.setBackground(opts.background ?? null);

  const host = canvas.parentElement ?? document.body;
  const container: Container = { kind: "container", canvas, children: [], dirty: true };
  let focusedId: number | null = null;

  // Dev-mode diagnostics for the two silent first-run footguns: a 0-sized canvas paints
  // nothing (we size the framebuffer from the canvas's CSS box), and a non-positioned
  // parent misaligns the invisible a11y/input overlay (placed position:absolute over the
  // canvas). One-time, at mount. The literal `process.env.NODE_ENV` lets an app bundler
  // strip this in production builds (React's pattern); it's untyped in this browser lib.
  // @ts-expect-error `process` is bundler-injected, not typed here.
  const isProd = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production";
  if (!isProd) {
    const r = canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1)
      console.warn(
        `kussetsu: the <canvas> has ~0 CSS size (${Math.round(r.width)}×${Math.round(r.height)}). ` +
          "Kussetsu sizes the framebuffer from the canvas's CSS box, so give it a real width/height in CSS " +
          "(don't set the width/height HTML attributes) — nothing paints until it has a non-zero size.",
      );
    if (getComputedStyle(host).position === "static")
      console.warn(
        "kussetsu: the canvas's parent is position:static. The invisible accessibility/input overlay is " +
          "placed over the canvas with position:absolute, so clicks + focus will misalign. Make the parent " +
          "position:relative (or absolute/fixed).",
      );
  }

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
  // Drag-to-scroll. On touch there are NO wheel events, so a one-finger (or left-button)
  // drag is the only way to scroll — it scrolls the region under it, or the page in
  // pageScroll mode. Velocity is tracked for a light inertia fling on release.
  let scrollDrag: { id: number; lastY: number; lastT: number; vy: number } | null = null;
  let pageDrag: { lastY: number; lastT: number; vy: number } | null = null;
  // A press that *might* become a pan/scroll drag. We don't capture the pointer (or start moving)
  // until it travels past DRAG_THRESH — so a tap that lands on a button still fires its click
  // instead of being eaten as a zero-distance drag.
  let pendingDrag: { kind: "scroll" | "page" | "pan"; id: number; startX: number; startY: number; pointerId: number } | null = null;
  const DRAG_THRESH = 8; // px
  let inertiaRaf = 0;
  const cancelInertia = () => {
    if (inertiaRaf) cancelAnimationFrame(inertiaRaf);
    inertiaRaf = 0;
  };
  // Topmost scroll region under a canvas-relative point that still has room to scroll.
  const scrollRegionAt = (ox: number, oy: number): ScrollRegion | null => {
    for (let i = scrollRegions.length - 1; i >= 0; i--) {
      const r = scrollRegions[i];
      if (r.maxScroll > 0 && ox >= r.rect[0] && ox <= r.rect[0] + r.rect[2] && oy >= r.rect[1] && oy <= r.rect[1] + r.rect[3]) return r;
    }
    return null;
  };
  // Inertia: decay the release velocity (`v` is px per 16 ms), stopping at rest or at an edge.
  // We integrate by ELAPSED time (frames = dt/16), not once-per-rAF, so the fling feels identical
  // at 60 / 90 / 120 Hz — otherwise high-refresh phones (the ones this targets) over-throw ~2×.
  const flingScroll = (id: number, v0: number) => {
    cancelInertia();
    let v = v0;
    if (Math.abs(v) < 0.4) return;
    let lastT = performance.now();
    const step = () => {
      const now = performance.now();
      const f = Math.min(50, now - lastT) / 16; // clamp dt so a tab-stall can't jump the page
      lastT = now;
      const r = scrollRegions.find((s) => s.id === id);
      const max = r ? r.maxScroll : Infinity;
      const cur = scrollY.get(id) ?? 0;
      const next = Math.min(max, Math.max(0, cur + v * f));
      scrollY.set(id, next);
      container.dirty = true;
      v *= Math.pow(0.93, f);
      inertiaRaf = Math.abs(v) > 0.4 && next > 0 && next < max ? requestAnimationFrame(step) : 0;
    };
    inertiaRaf = requestAnimationFrame(step);
  };
  const flingPage = (v0: number) => {
    cancelInertia();
    let v = v0;
    if (Math.abs(v) < 0.4) return;
    let lastT = performance.now();
    const step = () => {
      const now = performance.now();
      const f = Math.min(50, now - lastT) / 16;
      lastT = now;
      const maxScroll = Math.max(0, contentBottom - viewportH + 24);
      const next = Math.min(0, Math.max(-maxScroll, camera.ty + v * f));
      camera.ty = next;
      container.dirty = true;
      v *= Math.pow(0.93, f);
      inertiaRaf = Math.abs(v) > 0.4 && next < 0 && next > -maxScroll ? requestAnimationFrame(step) : 0;
    };
    inertiaRaf = requestAnimationFrame(step);
  };
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

  // Canvas-relative px from clientX/Y. The pointer listeners live on `host` (see registration
  // below) so they ALSO catch presses on the invisible a11y proxies layered over the canvas;
  // e.offsetX/Y would be proxy-relative there, so we always derive from the canvas rect — the
  // same reason onWheel is on host and uses clientX/Y - rect.
  const canvasXY = (e: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  const onPointerDown = (e: PointerEvent) => {
    const [ox, oy] = canvasXY(e);
    // Clicking an editable field focuses the hidden <input> (keyboard + IME).
    for (let i = editables.length - 1; i >= 0; i--) {
      const r = editables[i];
      if (ox >= r.x && ox <= r.x + r.w && oy >= r.y && oy <= r.y + r.h) {
        editingId = r.id;
        editInput.style.display = "block";
        positionInput(r);
        editInput.value = r.value;
        const off = caretFromClick(r, ox);
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
      const overText = selectables.some((r) => ox >= r.x && ox <= r.x + r.w && oy >= r.y && oy <= r.y + r.h);
      if (overText) {
        const hit = locate(ox, oy)!;
        selection = { anchorId: hit.id, anchorOffset: hit.offset, focusId: hit.id, focusOffset: hit.offset };
        selecting = true;
        canvas.setPointerCapture(e.pointerId);
        container.dirty = true;
        return;
      }
      if (selection) { selection = null; container.dirty = true; } // click off text clears the selection
    }
    // Ignore presses on real DOM children that own their own pointer (e.g. the dev glass-tuning
    // panel's sliders) — only the canvas and the a11y proxies over it drive pan/scroll.
    if (e.target !== canvas && !a11yHost.contains(e.target as Node)) return;
    // Otherwise this press MIGHT become a drag: scroll the region under it, scroll the page, or
    // pan the camera. We DON'T capture or move yet — we wait until the pointer travels past
    // DRAG_THRESH (in onPointerMove), so a tap that lands on a button still fires the proxy's
    // click instead of being eaten as a zero-distance drag.
    const sr = scrollRegionAt(ox, oy);
    const kind = sr ? "scroll" : opts.pageScroll ? "page" : opts.camera ? "pan" : null;
    if (kind) pendingDrag = { kind, id: sr ? sr.id : -1, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent) => {
    const [ox, oy] = canvasXY(e);
    lastPointer = [ox, oy];
    if (materialsPresent) container.dirty = true; // pointer-reactive shaders repaint
    if (selecting && selection) {
      const hit = locate(ox, oy);
      if (hit) {
        selection = { ...selection, focusId: hit.id, focusOffset: hit.offset };
        container.dirty = true;
      }
      return;
    }
    // Promote a pending press to an active drag once it crosses the threshold. Capture the
    // pointer to the canvas NOW: subsequent moves/up retarget there, so a drag that began on a
    // button proxy keeps scrolling AND the proxy's click is suppressed (no tap fires).
    if (pendingDrag && !scrollDrag && !pageDrag && !panning) {
      if (Math.hypot(e.clientX - pendingDrag.startX, e.clientY - pendingDrag.startY) <= DRAG_THRESH) return;
      cancelInertia();
      try { canvas.setPointerCapture(pendingDrag.pointerId); } catch { /* synthetic / inactive pointer */ }
      const now = performance.now();
      // Anchor at the CURRENT point (not the press point): the threshold travel is absorbed as
      // touch-slop, and starting lastT=now here avoids a dt≈0 first frame seeding a huge fling.
      if (pendingDrag.kind === "scroll") scrollDrag = { id: pendingDrag.id, lastY: e.clientY, lastT: now, vy: 0 };
      else if (pendingDrag.kind === "page") pageDrag = { lastY: e.clientY, lastT: now, vy: 0 };
      else { panning = true; panX = e.clientX; panY = e.clientY; }
      pendingDrag = null;
      return; // subsequent moves drive the actual scroll/pan with real per-frame deltas
    }
    if (scrollDrag) {
      const now = performance.now();
      const dy = e.clientY - scrollDrag.lastY;
      const r = scrollRegions.find((s) => s.id === scrollDrag!.id);
      const max = r ? r.maxScroll : Infinity;
      const cur = scrollY.get(scrollDrag.id) ?? 0;
      scrollY.set(scrollDrag.id, Math.min(max, Math.max(0, cur - dy / camera.scale)));
      const dt = Math.max(1, now - scrollDrag.lastT);
      scrollDrag.vy = (-dy / camera.scale / dt) * 16; // px per 16ms, for the release fling
      scrollDrag.lastY = e.clientY;
      scrollDrag.lastT = now;
      container.dirty = true;
      return;
    }
    if (pageDrag) {
      const now = performance.now();
      const dy = e.clientY - pageDrag.lastY;
      const maxScroll = Math.max(0, contentBottom - viewportH + 24);
      camera.ty = Math.min(0, Math.max(-maxScroll, camera.ty + dy));
      const dt = Math.max(1, now - pageDrag.lastT);
      pageDrag.vy = (dy / dt) * 16;
      pageDrag.lastY = e.clientY;
      pageDrag.lastT = now;
      container.dirty = true;
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
    pendingDrag = null; // a press that never crossed the threshold was a tap — let the click fire
    // A finger that paused before lifting (drag-to-position) shouldn't fling: drop a stale velocity.
    const STALE_MS = 60;
    if (scrollDrag) { flingScroll(scrollDrag.id, performance.now() - scrollDrag.lastT > STALE_MS ? 0 : scrollDrag.vy); scrollDrag = null; }
    if (pageDrag) { flingPage(performance.now() - pageDrag.lastT > STALE_MS ? 0 : pageDrag.vy); pageDrag = null; }
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
  // All on `host` (not `canvas`) so they also catch presses on the a11y proxies layered over the
  // canvas — otherwise a drag that begins on a button/nav/CTA never reaches us and won't scroll.
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", endPan);
  host.addEventListener("pointercancel", endPan);
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
    if (stopped) return; // device lost / torn down — don't touch a dead GPU (also guards frame())
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
    const fg = collectForeground(root, camera, scrollY); // glass children, drawn ON the glass
    const rects = [...collectRects(root, focusedId, camera, scrollY), ...collectSelection(selectables, selection)];
    if (editingId != null) {
      const r = editables.find((e) => e.id === editingId);
      if (r) {
        positionInput(r); // keep the input over the field as layout moves
        const caret = editCaretRect(r, caretOffset, camera);
        if (caret) fg.rects.push(caret); // caret on top (composer input sits on glass)
      }
    }
    const materials = collectMaterials(root, camera, scrollY);
    materialsPresent = materials.length > 0;

    // Particles: CPU-simulate each emitter, persisting state per node id, then concatenate
    // into one instance buffer (world coords; the painter applies the camera + bloom).
    const pNodes = collectParticles(root, scrollY);
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

    painter.frame(rects, collectTexts(root, camera, scrollY), collectGlass(root, camera, scrollY), fg, materials, {
      time: performance.now() / 1000,
      pointer: lastPointer,
      particles,
      post: collectPostProcess(root, camera, scrollY), // a node's postProcess prop → effect masked to its box
      bgScroll: Math.max(0, ...scrollY.values()), // page scroll → the background shader scrolls with it
    });
    overlay.syncFromScene(collectSemantics(root, camera, scrollY));
    // animated materials + particles drive a continuous repaint loop
    if (materialsPresent && materials.some((m) => m.animated)) container.dirty = true;
    if (particlesPresent) container.dirty = true;
    if (opts.background) container.dirty = true; // animated background shader
  }

  let rafId = 0;
  let timerId = 0;
  let stopped = false; // set on teardown or device loss — halts both loops + painting
  const renderIfDirty = () => {
    if (stopped) return;
    if (container.dirty) {
      container.dirty = false;
      renderFrame();
    }
  };
  const rafLoop = () => { if (stopped) return; renderIfDirty(); rafId = requestAnimationFrame(rafLoop); };
  // Fallback loop: requestAnimationFrame is throttled (and paused for background tabs) when
  // the window isn't OS-focused, which would freeze the canvas even though DOM input + React
  // state still update — so a click would change state but never repaint. A setTimeout loop
  // keeps dirty frames flushing (~5fps unfocused; the browser clamps it to ~1fps in a true
  // background tab) so interactions always repaint. rAF still drives smooth 60fps animation
  // when focused; renderIfDirty() no-ops when nothing changed, so the timer is nearly free.
  const timerLoop = () => { if (stopped) return; renderIfDirty(); timerId = window.setTimeout(timerLoop, 200); };
  rafId = requestAnimationFrame(rafLoop);
  timerId = window.setTimeout(timerLoop, 200);

  // WebGPU device loss (GPU crash/reset, sleep/wake, TDR) is otherwise a silent permanent
  // freeze: React state + the a11y overlay keep updating while the canvas paints nothing, and
  // the loop keeps calling into a dead device. Stop the loops and tell the consumer — there's
  // no auto-recovery, so the app should prompt a reload. Reason "destroyed" is our own teardown,
  // not a loss, so skip it.
  let torndown = false;
  painter.device.lost.then((info) => {
    if (torndown || info.reason === "destroyed") return;
    stopped = true;
    cancelAnimationFrame(rafId);
    clearTimeout(timerId);
    opts.onDeviceLost?.({ reason: String(info.reason), message: info.message });
  });
  if (opts.onError) {
    painter.device.addEventListener("uncapturederror", (e) => {
      opts.onError!((e as GPUUncapturedErrorEvent).error);
    });
  }

  const onResize = () => {
    container.dirty = true;
  };
  addEventListener("resize", onResize); // viewport / DPR / zoom changes
  // Element-level resizes (a resizable panel, collapsing sidebar, animated modal) don't fire
  // window 'resize', so without this the framebuffer goes stale until some unrelated repaint.
  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { container.dirty = true; }) : null;
  resizeObserver?.observe(canvas);

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
      stopped = true;
      torndown = true; // suppress the device.lost handler if teardown destroys the device
      cancelAnimationFrame(rafId);
      cancelInertia();
      clearTimeout(timerId);
      resizeObserver?.disconnect();
      removeEventListener("resize", onResize);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", endPan);
      host.removeEventListener("pointercancel", endPan);
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onCopy);
      reactRoot.unmount();
      a11yHost.remove();
      editInput.remove();
    },
  };
}
