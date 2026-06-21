// 10,000-node stress demo. The headline the validation memo wants proven:
// "React Flow, but fast at 10k nodes AND still accessible." Every node is a GPU
// rect (ONE instanced draw, camera in-shader); labels + DOM a11y proxies are
// VIRTUALIZED to what's on-screen and big enough to read — so zoomed out it's
// 10k rects with zero DOM, and zoomed in only ~visible nodes get a proxy.
import { FLOATS_PER_RECT, Painter, type GlassPanel, type TextItem } from "../core/webgpu";
import { SemanticsOverlay, type SemNode } from "../core/a11y";
import type { RGBA } from "../core/scene";
const COUNT = 10000;
const COLS = 125;
const GAP_X = 160;
const GAP_Y = 132;
const NODE_W = 120;
const NODE_H = 84;
const NODE_RADIUS = 10;
const LABEL_CAP = 220; // max labels/proxies built per frame (virtualization bound)
const MIN_LABEL_SCREEN_W = 50; // below this on-screen width, no labels (illegible)

const PALETTE: RGBA[] = [
  [0.36, 0.42, 0.95, 1],
  [0.16, 0.71, 0.62, 1],
  [0.94, 0.56, 0.22, 1],
  [0.86, 0.3, 0.55, 1],
  [0.46, 0.36, 0.86, 1],
  [0.28, 0.63, 0.92, 1],
];

interface GNode {
  x: number;
  y: number;
  label: string;
}

export async function runStress(canvas: HTMLCanvasElement) {
  const painter = await Painter.create(canvas);

  // Invisible semantics overlay, placed over the canvas (self-contained example).
  const a11yHost = document.createElement("div");
  Object.assign(a11yHost.style, { position: "absolute", inset: "0", pointerEvents: "none" } as Partial<CSSStyleDeclaration>);
  (canvas.parentElement ?? document.body).appendChild(a11yHost);

  // Build nodes + the static WORLD-space instance buffer (uploaded once).
  const nodes: GNode[] = [];
  const instances = new Float32Array(COUNT * FLOATS_PER_RECT);
  for (let i = 0; i < COUNT; i++) {
    const c = i % COLS;
    const r = (i / COLS) | 0;
    const x = c * GAP_X;
    const y = r * GAP_Y;
    nodes.push({ x, y, label: `Node ${i + 1}` });
    const col = PALETTE[(r + c) % PALETTE.length];
    const o = i * FLOATS_PER_RECT;
    instances[o] = x;
    instances[o + 1] = y;
    instances[o + 2] = NODE_W;
    instances[o + 3] = NODE_H;
    instances[o + 4] = NODE_RADIUS;
    instances[o + 8] = col[0];
    instances[o + 9] = col[1];
    instances[o + 10] = col[2];
    instances[o + 11] = col[3];
  }
  painter.setGraphNodes(instances, COUNT);

  const camera = { tx: 40, ty: 96, scale: 0.62 };

  // Screen-fixed, draggable glass lens (content flows under it as you pan).
  const lens = { x: 0, y: 0, w: 300, h: 210 };
  let lensInit = false;

  // ── pan / zoom on the canvas (empty space falls through the overlay) ──
  let panning = false;
  let px = 0;
  let py = 0;
  canvas.addEventListener("pointerdown", (e) => {
    panning = true;
    px = e.clientX;
    py = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!panning) return;
    camera.tx += e.clientX - px;
    camera.ty += e.clientY - py;
    px = e.clientX;
    py = e.clientY;
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
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const ns = Math.min(2.5, Math.max(0.05, camera.scale * Math.exp(-e.deltaY * 0.0015)));
      const r = canvas.getBoundingClientRect();
      const ox = e.clientX - r.left;
      const oy = e.clientY - r.top;
      const wx = (ox - camera.tx) / camera.scale;
      const wy = (oy - camera.ty) / camera.scale;
      camera.tx = ox - wx * ns;
      camera.ty = oy - wy * ns;
      camera.scale = ns;
    },
    { passive: false },
  );

  // Lens drag is in SCREEN space (it's screen-fixed) -> getScale() = 1.
  const overlay = new SemanticsOverlay(a11yHost, { setFocusRing() {} }, () => 1);

  // ── HUD (screen-fixed app chrome; the 10k content is all GPU) ──
  const hud = document.createElement("div");
  Object.assign(hud.style, {
    position: "fixed",
    left: "16px",
    top: "14px",
    zIndex: "40",
    pointerEvents: "none",
    color: "#eaeefb",
    font: "600 14px system-ui, -apple-system, sans-serif",
    lineHeight: "1.55",
    textShadow: "0 1px 8px rgba(0,0,0,.75)",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(hud);

  let frames = 0;
  let lastT = performance.now();
  let fps = 0;
  let lastVisible = 0;
  let lastLabelled = 0;

  // One frame of work: cull -> labels/a11y -> GPU draw -> overlay sync.
  function renderOnce() {
    const r = canvas.getBoundingClientRect();
    const vpW = r.width;
    const vpH = r.height;
    if (!lensInit) {
      lens.x = vpW - lens.w - 64;
      lens.y = vpH * 0.5 - lens.h / 2;
      lensInit = true;
    }

    const s = camera.scale;
    const sw = NODE_W * s;
    const sh = NODE_H * s;
    const labelsOn = sw >= MIN_LABEL_SCREEN_W;

    const texts: TextItem[] = [];
    const sem: SemNode[] = [];
    let visible = 0;
    for (let i = 0; i < COUNT; i++) {
      const n = nodes[i];
      const sx = n.x * s + camera.tx;
      const sy = n.y * s + camera.ty;
      if (sx + sw < 0 || sy + sh < 0 || sx > vpW || sy > vpH) continue;
      visible++;
      if (labelsOn && texts.length < LABEL_CAP) {
        texts.push({ x: sx + 11, y: sy + sh - 11, text: n.label, size: Math.min(16, Math.max(9, 13 * s)), weight: 600, color: [1, 1, 1, 1] });
        sem.push({ id: `n${i}`, label: n.label, rect: { x: sx, y: sy, width: sw, height: sh }, focusable: true });
      }
    }

    const glass: GlassPanel[] = [
      { x: lens.x, y: lens.y, w: lens.w, h: lens.h, radius: 28, refraction: 0.13, blur: 0, tint: 0.06, tintColor: [0.82, 0.87, 1, 1], rim: 16, brighten: 1.03, specular: 0.05, dispersion: 0.025 },
    ];
    sem.push({
      id: "lens",
      label: "Draggable glass lens",
      rect: { x: lens.x, y: lens.y, width: lens.w, height: lens.h },
      focusable: true,
      draggable: true,
      onDrag: (dx, dy) => {
        lens.x += dx;
        lens.y += dy;
      },
    });

    painter.frameGraph(camera, texts, glass);
    overlay.syncFromScene(sem);
    lastVisible = visible;
    lastLabelled = texts.length;
  }

  function loop() {
    renderOnce();
    frames++;
    const now = performance.now();
    if (now - lastT >= 300) {
      fps = Math.round(frames / ((now - lastT) / 1000));
      frames = 0;
      lastT = now;
      hud.innerHTML =
        `<div style="font-size:16px">${COUNT.toLocaleString()} nodes · <span style="color:#7CF2A0">${fps} fps</span></div>` +
        `<div style="opacity:.72;font-weight:500">${lastVisible.toLocaleString()} on-screen · ${lastLabelled} labelled &amp; screen-reader accessible</div>` +
        `<div style="opacity:.55;font-weight:500;margin-top:4px">scroll to zoom · drag background to pan · drag the glass · ⌘F finds any node</div>`;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // rAF-independent benchmark (works even in a backgrounded tab): run the full
  // per-frame work N times synchronously and await GPU completion -> real ms/frame.
  (window as { __bench?: (n?: number) => Promise<unknown> }).__bench = async (n = 180) => {
    // warm up
    for (let i = 0; i < 10; i++) renderOnce();
    await painter.device.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) renderOnce();
    await painter.device.queue.onSubmittedWorkDone();
    const ms = (performance.now() - t0) / n;
    return { frames: n, msPerFrame: +ms.toFixed(3), estFps: Math.round(1000 / ms), onScreen: lastVisible, labelled: lastLabelled, scale: +camera.scale.toFixed(3) };
  };
}
