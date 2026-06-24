// The Kussetsu runtime. Hand it a <canvas> (inside a positioned parent), render
// React into it, and you get GPU paint + an invisible-DOM accessibility/input
// overlay + the animation loop for free. This is the public entry point.
//
//   const root = await createGpuRoot(canvas, { camera: false });
//   root.render(<App />);   // App authored with <view>/<text> host elements
//
import { createElement, type ReactNode } from "react";
import { createRoot } from "./hostConfig";
import { KussetsuContext, type KussetsuBridge } from "./context";
import { Painter } from "./webgpu";
import { ParticleSystem } from "./particles";
import { SemanticsOverlay } from "./a11y";
import {
  collectRects,
  collectShadows,
  collectImages,
  collectVectors,
  collectOverlays,
  collectOpacityGroups,
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
import { glassTuning, GLASS_DEFAULTS, type GlassParams } from "./glassTuning";
import type { Camera, Container, ElementNode } from "./scene";

export interface GpuRootOptions {
  /** Pan by dragging empty space + zoom on the wheel. Default true. */
  camera?: boolean;
  /** Min / max camera zoom (scale), applied to the wheel, the zoom helpers, and `setCamera`.
   *  Defaults: `minZoom` 0.35, `maxZoom` 3. */
  minZoom?: number;
  maxZoom?: number;
  /** Wheel scrolls the whole page vertically (clamped to content). Default false. */
  pageScroll?: boolean;
  /** Make ALL text drag-selectable + copyable (Cmd/Ctrl+C), like a normal page. Default false. */
  textSelectable?: boolean;
  /** Full-screen WGSL background shader (`fn material(uv,px)->vec4f`) rendered into the backdrop,
   *  so glass refracts it. Same template/helpers as props.material. */
  background?: string;
  /** Called if the WebGPU device is lost (GPU crash/reset, sleep/wake, TDR) AND auto-recovery
   *  fails. Kussetsu first tries to re-acquire the device and rebuild GPU resources in place
   *  (the React tree is untouched); this fires only if that gives up, so the app can prompt a
   *  reload. Not called for a normal `destroy()`. */
  onDeviceLost?: (info: { reason: string; message: string }) => void;
  /** Called after a lost device is successfully re-acquired and the scene repainted in place
   *  (no reload needed). */
  onDeviceRestored?: () => void;
  /** Called with uncaptured GPU errors (validation/out-of-memory). Advisory; the loop continues. */
  onError?: (error: unknown) => void;
  /** Show a small dev perf overlay (fps · frame-ms · draw counts) in the corner. Default false.
   *  Since a single opaque canvas hides DevTools' element/perf affordances, this puts them back. */
  debug?: boolean;
}

export interface GpuRoot {
  /** Mount/replace the React tree. Author with the `<View>`/`<Text>` components. */
  render(element: ReactNode): void;
  /** Force a synchronous render now (handy in tests / backgrounded tabs). */
  frame(): void;
  /** Mark dirty; the animation loop renders on the next frame. */
  requestRender(): void;
  /** The live pan/zoom camera (a copy — mutate via `setCamera`). */
  getCamera(): Camera;
  /** Pan/zoom the view. Partial — pass just `{ scale }` or `{ tx, ty }`. `scale` is clamped to
   *  [minZoom, maxZoom]. Repaints. */
  setCamera(camera: Partial<Camera>): void;
  /** Recenter + reset zoom to the identity transform. */
  resetCamera(): void;
  /** Zoom to an absolute scale (clamped to [minZoom, maxZoom]) keeping `anchor` (canvas CSS px) fixed —
   *  defaults to the viewport center. Repaints. */
  zoomTo(scale: number, anchor?: { x: number; y: number }): void;
  /** Step the zoom in / out about the viewport center (clamped). Repaints. */
  zoomIn(): void;
  zoomOut(): void;
  /** Re-measure the canvas + repaint (the `ResizeObserver` does this automatically;
   *  call it after a synchronous layout change you know the observer will miss). */
  resize(): void;
  /** The id of the topmost node at a canvas-relative point (px), or null. */
  hitTest(x: number, y: number): number | null;
  /** The underlying `<canvas>` (e.g. to `toBlob()` it yourself after a `frame()`). */
  getCanvas(): HTMLCanvasElement;
  /** Override every glass panel in THIS root with one shared param set (partial — merged over
   *  `GLASS_DEFAULTS`), or `null` to clear and use each panel's own `glass` spec. Root-scoped —
   *  prefer this over the process-wide `glassTuning` global. Repaints. */
  setGlassOverride(params: Partial<GlassParams> | null): void;
  /** Tear down: stop the loop, remove the overlay/input, unmount React. */
  destroy(): void;
}

/** The imperative controls a component gets from `useGpuRoot()` — the `GpuRoot` minus the
 *  lifecycle methods (`render` / `destroy`), which a component shouldn't call on its own tree. */
export type GpuControls = Omit<GpuRoot, "render" | "destroy">;

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
  let glassOverride: GlassParams | null = null; // root-scoped glass override (setGlassOverride)

  // Dev perf overlay (opts.debug): a small DOM readout of fps / frame-ms / draw counts, since a
  // single opaque canvas hides DevTools' element + perf panels. renderFrame accumulates into these;
  // a timer snapshots them ~2x/sec.
  let debugEl: HTMLElement | null = null;
  let dbgFrames = 0;
  let dbgMs = 0;
  let dbgRects = 0, dbgGlass = 0, dbgMat = 0, dbgPart = 0;
  let dbgTimer = 0;
  if (opts.debug) {
    debugEl = document.createElement("div");
    Object.assign(debugEl.style, {
      position: "absolute", top: "8px", left: "8px", zIndex: "100", pointerEvents: "none",
      font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
      color: "#9ef0c0", background: "rgba(0,0,0,0.62)", padding: "5px 8px", borderRadius: "6px",
      whiteSpace: "pre", letterSpacing: "0.02em",
    } as Partial<CSSStyleDeclaration>);
    host.appendChild(debugEl);
    let dbgLast = performance.now();
    dbgTimer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = (now - dbgLast) / 1000; // real elapsed — robust if the timer is throttled
      dbgLast = now;
      const fps = elapsed > 0 ? Math.round(dbgFrames / elapsed) : 0;
      const ms = dbgFrames ? dbgMs / dbgFrames : 0;
      debugEl!.textContent = `kussetsu · ${fps} fps · ${ms.toFixed(1)} ms\n${dbgRects} rect · ${dbgGlass} glass · ${dbgMat} mat · ${dbgPart} particle`;
      dbgFrames = 0;
      dbgMs = 0;
    }, 500);
  }

  // A material shader's compile failure is detected asynchronously; when the painter flags one,
  // repaint so the frame that already drew the (invalid) pipeline recovers.
  painter.onInvalidate = () => { container.dirty = true; };
  painter.onImageLoaded = () => { container.dirty = true; }; // repaint when an async image finishes loading
  painter.onVectorLoaded = () => { container.dirty = true; }; // repaint when an async SVG vector finishes loading

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
  // Zoom limits + helpers. zoomAbout keeps the anchor (canvas CSS px) fixed while scaling — the same
  // math the wheel uses — so a button/keyboard zoom doesn't make the view jump.
  const minZoom = options.minZoom ?? 0.35;
  const maxZoom = options.maxZoom ?? 3;
  const ZOOM_STEP = 1.25;
  const clampScale = (s: number) => (Number.isFinite(s) ? Math.min(maxZoom, Math.max(minZoom, s)) : camera.scale); // ignore NaN/∞
  const zoomAbout = (targetScale: number, ax: number, ay: number) => {
    const ns = clampScale(targetScale);
    const wx = (ax - camera.tx) / camera.scale;
    const wy = (ay - camera.ty) / camera.scale;
    camera.tx = ax - wx * ns;
    camera.ty = ay - wy * ns;
    camera.scale = ns;
    container.dirty = true;
  };
  const zoomTo = (scale: number, anchor?: { x: number; y: number }) =>
    zoomAbout(scale, anchor?.x ?? canvas.clientWidth / 2, anchor?.y ?? canvas.clientHeight / 2);
  const zoomIn = () => zoomTo(camera.scale * ZOOM_STEP);
  const zoomOut = () => zoomTo(camera.scale / ZOOM_STEP);
  const resetCam = () => {
    camera.tx = 0;
    camera.ty = 0;
    camera.scale = 1;
    container.dirty = true;
  };
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
    zoomAbout(camera.scale * Math.exp(-e.deltaY * 0.0015), ox, oy); // zoom toward the cursor, clamped
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

  // Cmd/Ctrl + =/+ zoom in · −/_ zoom out · 0 reset — only when the pan/zoom camera is enabled and not
  // editing a field. preventDefault stops the browser's own page zoom. Zooms about the viewport center.
  const onKeyZoom = (e: KeyboardEvent) => {
    if (!opts.camera || !(e.metaKey || e.ctrlKey) || editingId != null) return;
    const k = e.key;
    if (k === "=" || k === "+") { e.preventDefault(); zoomIn(); }
    else if (k === "-" || k === "_") { e.preventDefault(); zoomOut(); }
    else if (k === "0") { e.preventDefault(); resetCam(); }
  };
  window.addEventListener("keydown", onKeyZoom);

  const rootElement = (): ElementNode | null =>
    (container.children.find((c) => c.kind === "element") as ElementNode | undefined) ?? null;

  // useFrame callbacks (run once per rAF tick, below) + useViewport subscribers (notified on resize).
  const frameCallbacks = new Set<(dt: number) => void>();
  const viewportSubs = new Set<() => void>();
  let lastFrameTs = 0;

  function renderFrame() {
    if (stopped) return; // device lost / torn down — don't touch a dead GPU (also guards frame())
    const root = rootElement();
    if (!root) return;
    const t0 = debugEl ? performance.now() : 0; // perf overlay timing
    const { cssWidth, cssHeight } = painter.size();
    layoutWithYoga(root, cssWidth, cssHeight, opts.textSelectable);
    viewportH = cssHeight;
    if (opts.pageScroll) {
      contentBottom = 0;
      const measureBottom = (n: ElementNode) => {
        contentBottom = Math.max(contentBottom, n.y + n.h);
        if (n.props.style?.overflow) return; // clipped container — its children don't grow the page
        for (const c of n.children) if (c.kind === "element" && !c.hidden) measureBottom(c);
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
        if (caret) fg.rest.rects.push(caret); // caret on top, crisp (final foreground pass)
      } else {
        // The edited field was suspended/hidden (<Suspense> fallback or <Activity mode="hidden">)
        // while focused, so it dropped out of `editables`. The transparent <input> is a DOM sibling
        // of the canvas, outside React's tree — the browser never blurred it, so it would keep
        // capturing keystrokes/IME, trap keyboard + AT focus on a ghost field, and (via editingId)
        // keep the root's copy handler disabled. Release it through the blur handler (single source
        // of truth: clears editingId + hides the input); defensively clear if it wasn't focused.
        editInput.blur();
        if (editingId != null) {
          editInput.style.display = "none";
          editingId = null;
          container.dirty = true;
        }
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

    // Glass override: this root's own (setGlassOverride) wins; the process-wide glassTuning is a fallback.
    const glass = collectGlass(root, camera, scrollY, glassOverride ?? (glassTuning.enabled ? glassTuning.params : null));
    painter.frame(rects, collectTexts(root, camera, scrollY), glass, fg, materials, {
      time: performance.now() / 1000,
      pointer: lastPointer,
      particles,
      post: collectPostProcess(root, camera, scrollY), // a node's postProcess prop → effect masked to its box
      bgScroll: Math.max(0, ...scrollY.values()), // page scroll → the background shader scrolls with it
    }, collectShadows(root, camera, scrollY), collectOpacityGroups(root, camera, scrollY), collectImages(root, camera, scrollY), collectOverlays(root, focusedId, camera, scrollY), collectVectors(root, camera, scrollY)); // shadows behind; opacity offscreen; images+vectors under glass; overlays (zIndex) on top
    overlay.syncFromScene(collectSemantics(root, camera, scrollY));
    // animated materials + particles drive a continuous repaint loop
    if (materialsPresent && materials.some((m) => m.animated)) container.dirty = true;
    if (particlesPresent) container.dirty = true;
    if (opts.background) container.dirty = true; // animated background shader
    if (debugEl) {
      dbgFrames++;
      dbgMs += performance.now() - t0;
      dbgRects = rects.length; dbgGlass = glass.length; dbgMat = materials.length; dbgPart = particles?.count ?? 0;
    }
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
  // useFrame runs ONCE per animation frame (the rAF cadence) — not inside renderFrame, which the
  // fallback timer below also reaches (that would double-tick callbacks, and let the ~5fps timer
  // drive animation with an erratic dt when the tab is backgrounded). dt is clamped so a
  // backgrounded-then-refocused tab / sleep-wake can't deliver a multi-second delta that teleports
  // a `pos += vel * dt` animation — matching the particle sim's clamp.
  const tickFrameCallbacks = () => {
    if (!frameCallbacks.size) { lastFrameTs = 0; return; }
    const now = performance.now();
    const dt = Math.min(0.1, lastFrameTs ? (now - lastFrameTs) / 1000 : 1 / 60);
    lastFrameTs = now;
    for (const cb of frameCallbacks) cb(dt);
    container.dirty = true; // animation → repaint this frame (rafLoop's renderIfDirty clears it)
  };
  const rafLoop = () => { if (stopped) return; tickFrameCallbacks(); renderIfDirty(); rafId = requestAnimationFrame(rafLoop); };
  // Fallback loop: requestAnimationFrame is throttled (and paused for background tabs) when
  // the window isn't OS-focused, which would freeze the canvas even though DOM input + React
  // state still update — so a click would change state but never repaint. A setTimeout loop
  // keeps dirty frames flushing (~5fps unfocused; the browser clamps it to ~1fps in a true
  // background tab) so interactions always repaint. rAF still drives smooth 60fps animation
  // when focused; renderIfDirty() no-ops when nothing changed, so the timer is nearly free.
  const timerLoop = () => { if (stopped) return; renderIfDirty(); timerId = window.setTimeout(timerLoop, 200); };
  rafId = requestAnimationFrame(rafLoop);
  timerId = window.setTimeout(timerLoop, 200);

  // WebGPU device loss (GPU crash/reset, sleep/wake, TDR) is otherwise a silent permanent freeze.
  // RECOVER in place: stop the loops, re-acquire the device + rebuild GPU resources (the React tree
  // is intact), then resume + repaint — no reload. Only if recovery FAILS do we give up and call
  // onDeviceLost. Both the async device.lost (Painter.attachDeviceHandlers) and a synchronous
  // mid-frame GPU throw (Painter.frame) route through painter.onDeviceError; "destroyed" (our own
  // teardown) is filtered out in the Painter, so this never fires for destroy().
  let torndown = false;
  let recovering = false;
  let recoveries = 0;
  const MAX_RECOVERIES = 8; // backstop against a pathological loss → recover → loss loop
  painter.onDeviceError = async (info) => {
    if (torndown || recovering) return;
    stopped = true;
    cancelAnimationFrame(rafId);
    clearTimeout(timerId);
    recovering = true;
    const ok = recoveries++ < MAX_RECOVERIES && (await painter.recover());
    recovering = false;
    if (torndown) return; // destroyed mid-recovery
    if (ok) {
      stopped = false;
      container.dirty = true; // repaint the (intact) scene with the rebuilt GPU resources
      rafId = requestAnimationFrame(rafLoop);
      timerId = window.setTimeout(timerLoop, 200);
      console.info("[kussetsu] WebGPU device recovered");
      opts.onDeviceRestored?.();
    } else {
      opts.onDeviceLost?.(info); // gave up — the app should prompt a reload
    }
  };
  if (opts.onError) {
    painter.device.addEventListener("uncapturederror", (e) => {
      opts.onError!((e as GPUUncapturedErrorEvent).error);
    });
  }

  const notifyResize = () => {
    container.dirty = true;
    viewportSubs.forEach((cb) => cb()); // useViewport
  };
  const onResize = notifyResize;
  addEventListener("resize", onResize); // viewport / DPR / zoom changes
  // Element-level resizes (a resizable panel, collapsing sidebar, animated modal) don't fire
  // window 'resize', so without this the framebuffer goes stale until some unrelated repaint.
  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(notifyResize) : null;
  resizeObserver?.observe(canvas);

  const reactRoot = createRoot(container);

  const rootApi: GpuRoot = {
    render(element) {
      // Wrap the tree in the bridge so useFrame / useViewport / useGpuRoot work inside it.
      reactRoot.render(createElement(KussetsuContext.Provider, { value: bridge }, element));
    },
    frame: renderFrame,
    requestRender() {
      container.dirty = true;
    },
    getCamera() {
      return { tx: camera.tx, ty: camera.ty, scale: camera.scale };
    },
    setCamera(next) {
      if (next.tx != null) camera.tx = next.tx;
      if (next.ty != null) camera.ty = next.ty;
      if (next.scale != null) camera.scale = clampScale(next.scale);
      container.dirty = true;
    },
    resetCamera: resetCam,
    zoomTo,
    zoomIn,
    zoomOut,
    resize() {
      container.dirty = true; // renderFrame re-reads the canvas size via painter.size()
    },
    hitTest(x, y) {
      const root = rootElement();
      if (!root) return null;
      let hit: number | null = null;
      let bestLayer = -Infinity; // higher = on top: overlays (zIndex) beat normal content; within a layer, deepest-last wins
      const OVERLAY = 1e9; // any overlay outranks all normal content, regardless of its numeric zIndex
      const walk = (n: ElementNode, scrollOff: number, layer: number) => {
        const z = n.props.style?.zIndex;
        const isZ = z != null;
        const eff = isZ ? 0 : scrollOff; // an overlay escapes ancestor scroll (painted at sy=0) — match paint
        const lay = isZ ? OVERLAY + z : layer;
        const sx = n.x * camera.scale + camera.tx;
        const sy = (n.y - eff) * camera.scale + camera.ty;
        const sw = n.w * camera.scale;
        const sh = n.h * camera.scale;
        if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh && lay >= bestLayer) { hit = n.id; bestLayer = lay; }
        const childScroll = n.props.style?.overflow === "scroll" ? eff + (scrollY.get(n.id) ?? 0) : eff;
        for (const c of n.children) if (c.kind === "element" && !c.hidden) walk(c, childScroll, lay);
      };
      walk(root, 0, 0);
      return hit;
    },
    getCanvas() {
      return canvas;
    },
    setGlassOverride(params) {
      glassOverride = params ? { ...GLASS_DEFAULTS, ...params, tintColor: [...(params.tintColor ?? GLASS_DEFAULTS.tintColor)] } : null;
      container.dirty = true;
    },
    destroy() {
      stopped = true;
      torndown = true; // suppress the device.lost handler if teardown destroys the device
      cancelAnimationFrame(rafId);
      cancelInertia();
      clearTimeout(timerId);
      clearInterval(dbgTimer);
      debugEl?.remove();
      resizeObserver?.disconnect();
      removeEventListener("resize", onResize);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", endPan);
      host.removeEventListener("pointercancel", endPan);
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onCopy);
      window.removeEventListener("keydown", onKeyZoom);
      frameCallbacks.clear();
      viewportSubs.clear();
      reactRoot.unmount();
      a11yHost.remove();
      editInput.remove();
      painter.destroy(); // release the GPUDevice + glyph atlas + all textures/buffers/pipelines
    },
  };

  // The bridge handed to hooks via context. `rootApi` is captured here (defined above); the
  // provider in rootApi.render references it, and render only runs after this is assigned.
  const bridge: KussetsuBridge = {
    root: rootApi,
    onFrame(cb) {
      frameCallbacks.add(cb);
      container.dirty = true; // kick the loop so the callback starts running
      return () => {
        frameCallbacks.delete(cb);
      };
    },
    getViewport() {
      const r = canvas.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    },
    subscribeViewport(cb) {
      viewportSubs.add(cb);
      return () => {
        viewportSubs.delete(cb);
      };
    },
  };

  return rootApi;
}
