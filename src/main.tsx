import { createElement } from "react";
import { createRoot } from "./hostConfig";
import { Painter } from "./webgpu";
import { SemanticsOverlay } from "./a11y";
import { collectRects, collectTexts, collectSemantics, collectGlass, collectForeground, collectScrollRegions, collectSelection, collectSelectable, collectEditable, editCaretRect, type ScrollRegion, type Selection, type SelectableRegion, type EditableRegion } from "./collect";
import { hitTest, measureWidth } from "./text";
import { glassTuning } from "./glassTuning";
import type { Camera, Container, ElementNode, RGBA } from "./scene";
import { App } from "./App";
import { ChatApp } from "./ChatApp";
import { runStress } from "./stress";
import type { ComponentType } from "react";

const canvas = document.getElementById("gpu") as HTMLCanvasElement;
const a11yHost = document.getElementById("a11y") as HTMLElement;

let focusedId: number | null = null;

const container: Container = { kind: "container", canvas, children: [], dirty: true };

// Live glass slider panel (DOM overlay) — like the old Kussetsu controls, but it
// drives the WGSL params. While the panel is OPEN, glassTuning.enabled overrides
// every glass panel so you can dial the whole look at once.
const rgbaToHex = (c: RGBA) => "#" + [0, 1, 2].map((i) => Math.round(c[i] * 255).toString(16).padStart(2, "0")).join("");
const hexToRgba = (h: string): RGBA => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, 1];

function buildGlassPanel(onRender: () => void): HTMLElement {
  const tp = glassTuning.params;
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "absolute",
    top: "12px",
    right: "12px",
    zIndex: "60",
    width: "212px",
    background: "rgba(10,12,20,0.86)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    color: "#cdd3e6",
    font: "12px/1.4 system-ui,-apple-system,sans-serif",
    boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
    overflow: "hidden",
    userSelect: "none",
  } as Partial<CSSStyleDeclaration>);

  const header = document.createElement("button");
  Object.assign(header.style, {
    all: "unset",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: "700",
    color: "#eef1f8",
  } as Partial<CSSStyleDeclaration>);
  header.innerHTML = `<span>✦ Glass controls</span><span class="chev">▸</span>`;

  const body = document.createElement("div");
  Object.assign(body.style, { padding: "2px 12px 12px", display: "none", flexDirection: "column", gap: "11px" } as Partial<CSSStyleDeclaration>);

  let open = false;
  const setOpen = (v: boolean) => {
    open = v;
    body.style.display = v ? "flex" : "none";
    (header.querySelector(".chev") as HTMLElement).textContent = v ? "▾" : "▸";
    if (v) glassTuning.enabled = true; // once opened, tuning persists (even collapsed)
    onRender();
  };
  header.addEventListener("click", () => setOpen(!open));

  const addSlider = (label: string, key: "refraction" | "blur" | "tint" | "rim" | "brighten" | "specular" | "dispersion", min: number, max: number, step: number) => {
    const row = document.createElement("div");
    const top = document.createElement("div");
    Object.assign(top.style, { display: "flex", justifyContent: "space-between", marginBottom: "3px" } as Partial<CSSStyleDeclaration>);
    const val = document.createElement("span");
    val.style.color = "#9fb0ff";
    val.textContent = tp[key].toFixed(step < 1 ? 3 : 0);
    top.innerHTML = `<span>${label}</span>`;
    top.appendChild(val);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(tp[key]);
    Object.assign(input.style, { width: "100%", accentColor: "#6a82ff", cursor: "pointer" } as Partial<CSSStyleDeclaration>);
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      glassTuning.params[key] = v;
      val.textContent = v.toFixed(step < 1 ? 3 : 0);
      onRender();
    });
    row.appendChild(top);
    row.appendChild(input);
    body.appendChild(row);
  };
  addSlider("Refraction", "refraction", 0, 0.4, 0.005);
  addSlider("Dispersion", "dispersion", 0, 0.06, 0.002);
  addSlider("Blur", "blur", 0, 16, 0.5);
  addSlider("Tint", "tint", 0, 0.5, 0.01);
  addSlider("Rim width", "rim", 0, 80, 1);
  addSlider("Specular", "specular", 0, 1.5, 0.05);
  addSlider("Brighten", "brighten", 0.8, 1.4, 0.01);

  const crow = document.createElement("div");
  Object.assign(crow.style, { display: "flex", justifyContent: "space-between", alignItems: "center" } as Partial<CSSStyleDeclaration>);
  crow.innerHTML = `<span>Tint color</span>`;
  const color = document.createElement("input");
  color.type = "color";
  color.value = rgbaToHex(tp.tintColor);
  Object.assign(color.style, { width: "34px", height: "22px", border: "0", background: "none", cursor: "pointer" } as Partial<CSSStyleDeclaration>);
  color.addEventListener("input", () => {
    glassTuning.params.tintColor = hexToRgba(color.value);
    onRender();
  });
  crow.appendChild(color);
  body.appendChild(crow);

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

async function boot(Component: ComponentType, opts: { camera: boolean; pageScroll?: boolean } = { camera: true }) {
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
  let contentBottom = 0; // lowest laid-out pixel — clamps page-scroll
  let viewportH = 0;

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
      if (opts.pageScroll) {
        // Page-scroll mode: wheel moves the whole page vertically (clamped to
        // content height) — a normal scrollable page, not an infinite canvas.
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

  // Live glass tuning panel (top-right). Open it to override + dial every glass panel.
  (document.getElementById("stage") as HTMLElement).appendChild(
    buildGlassPanel(() => {
      container.dirty = true;
    }),
  );
  // Debug hook: tweak glass params from the console (e.g. __glass.params.blur = 10).
  (window as unknown as { __glass?: typeof glassTuning }).__glass = glassTuning;

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
  boot(App, { camera: false, pageScroll: true });
} else {
  boot(ChatApp, { camera: false });
}
