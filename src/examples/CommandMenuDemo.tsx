import { useEffect, useMemo, useRef, useState } from "react";
import { createGpuRoot } from "../core/runtime";
import { createCommandMenu, type CommandItem, type CommandMenuController } from "../core/commandMenu";
import type { RGBA } from "../core/scene";

// "Impossible in CSS" demo — a ⌘K glass command palette floating over a LIVE, scrolling
// feed, refracting and dispersing the content moving behind it (CSS backdrop-filter can't
// refract, can't disperse, and can't reach across stacking contexts). The menu is fully
// keyboard- and screen-reader-accessible: a real hidden ARIA combobox/listbox drives it
// (src/core/commandMenu.ts), the GPU paints the glass. Press ⌘K (or Ctrl+K).

const WHITE: RGBA = [0.97, 0.98, 1, 1];
const MUTED: RGBA = [0.62, 0.67, 0.8, 1];
const FAINT: RGBA = [0.5, 0.55, 0.7, 1];
const ACCENT: RGBA = [0.45, 0.55, 1, 1];
const ACTIVE_BG: RGBA = [0.5, 0.6, 1, 0.22];

// A bright, saturated feed so the refraction + dispersion are unmistakable.
const HUES: RGBA[] = [
  [0.36, 0.4, 0.95, 1], [0.1, 0.72, 0.66, 1], [0.98, 0.65, 0.13, 1], [0.96, 0.3, 0.46, 1],
  [0.6, 0.35, 0.95, 1], [0.13, 0.78, 0.45, 1], [0.22, 0.62, 0.97, 1], [0.98, 0.45, 0.2, 1],
  [0.95, 0.36, 0.74, 1], [0.2, 0.7, 0.9, 1],
];
const NAMES = ["Ada", "Grace", "Alan", "Katherine", "Linus", "Margaret", "Dennis", "Barbara", "Edsger", "Radia"];
const BODIES = [
  "Shipped the GPU compositor — every pixel is WGSL now.",
  "The glass actually refracts the live feed behind it. Look.",
  "Ran the 10k-node bench: ~3ms a frame, still accessible.",
  "Backdrop-filter could never. Dispersion on the rim is the tell.",
  "Press ⌘K and watch it bend the world underneath.",
  "Focus, arrows, screen reader — all real, all in the hidden DOM.",
  "Owning the framebuffer means the popover-over-anything problem vanishes.",
  "No portal escapes to document.body here. It's all one canvas.",
];

interface Post { name: string; color: RGBA; body: string; h: number; }
const POSTS: Post[] = HUES.map((color, i) => ({ name: NAMES[i], color, body: BODIES[i % BODIES.length], h: 132 + (i % 3) * 26 }));
const GAP = 18;
const COL_W = 760;
const COLUMN_H = POSTS.reduce((s, p) => s + p.h + GAP, 0);
const SPEED = 46; // px/sec

function Feed({ vw }: { vw: number }) {
  // Two stacked copies so the scroll loops seamlessly; only this node's `absolute.y`
  // animates each frame (the posts are memoized → the reconciler skips them).
  const x = Math.round((vw - COL_W) / 2);
  const col = (key: string) => (
    <view key={key} style={{ width: COL_W, direction: "column", gap: GAP }}>
      {POSTS.map((p, i) => (
        <view key={i} style={{ width: "stretch", height: p.h, shrink: 0, radius: 20, background: p.color, direction: "column", padding: 20, gap: 10 }}>
          <view style={{ direction: "row", align: "center", gap: 12 }}>
            <view style={{ width: 40, height: 40, radius: 20, background: [1, 1, 1, 0.85] }} />
            <text style={{ fontSize: 17, fontWeight: 800, color: [0.05, 0.06, 0.12, 1] }}>{p.name}</text>
          </view>
          <text style={{ maxWidth: COL_W - 40, fontSize: 16, fontWeight: 600, color: [0.04, 0.05, 0.1, 0.92] }}>{p.body}</text>
        </view>
      ))}
    </view>
  );
  return useMemo(
    () => (
      <view style={{ absolute: { x, y: 0 }, direction: "column" }}>
        {col("a")}
        {col("b")}
      </view>
    ),
    [vw],
  );
}

function Field({ query, w, h }: { query: string; w: number; h: number }) {
  return (
    <view style={{ width: "stretch", height: h, shrink: 0, direction: "row", align: "center", gap: 12, padding: 18 }}>
      <text style={{ fontSize: 22, color: ACCENT }}>⌘</text>
      <view style={{ grow: 1 }}>
        <text style={{ fontSize: 20, color: query ? WHITE : FAINT }}>{query || "Type a command or search…"}</text>
      </view>
      <text style={{ fontSize: 12, fontWeight: 700, color: FAINT }}>ESC</text>
    </view>
  );
}

function Row({ item, active, rowH }: { item: CommandItem; active: boolean; rowH: number }) {
  return (
    <view style={{ width: "stretch", height: rowH, shrink: 0, direction: "row", align: "center", gap: 10, padding: 14, radius: 10, background: active ? ACTIVE_BG : [0, 0, 0, 0] }}>
      <view style={{ grow: 1 }}>
        <text style={{ fontSize: 15, fontWeight: active ? 700 : 500, color: active ? WHITE : [0.86, 0.89, 0.98, 1] }}>{item.label}</text>
      </view>
      {item.hint ? <text style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>{item.hint}</text> : null}
    </view>
  );
}

function Scene({ controller, toast }: { controller: CommandMenuController; toast: () => { label: string; at: number } | null }) {
  const [, setT] = useState(0);
  const subRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => { setT(now); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const unsub = controller.subscribe(() => setT((n) => n + 0.0001)); // repaint promptly on menu change too
    return () => { cancelAnimationFrame(raf); unsub(); };
  }, [controller]);

  const now = performance.now();
  const vw = window.innerWidth, vh = window.innerHeight;
  const v = controller.getView();
  const g = controller.geometry();

  // seamless loop: animate the feed container's y by mutating the memoized node is hard,
  // so we wrap the memoized posts in a positioned parent here.
  const offset = -(((now / 1000) * SPEED) % COLUMN_H);

  const rowsH = v.visible.length ? g.pad + v.visible.length * g.rowH + g.pad : 64;
  const panelH = g.fieldH + rowsH;

  const t = toast();
  const showToast = t && now - t.at < 1600;

  return (
    <view style={{ width: vw, height: vh, background: [0.03, 0.04, 0.08, 1] }}>
      {/* LIVE content — the thing the glass bends */}
      <view style={{ absolute: { x: 0, y: offset } }}>
        <Feed vw={vw} />
      </view>

      {/* a persistent hint when the menu is closed */}
      {!v.open ? (
        <view style={{ absolute: { x: Math.round(vw / 2) - 150, y: vh - 70 }, width: 300, height: 44, radius: 22, background: [0.08, 0.1, 0.18, 0.82], direction: "row", align: "center", justify: "center", gap: 8 }}>
          <text style={{ fontSize: 14, fontWeight: 700, color: WHITE }}>⌘K</text>
          <text style={{ fontSize: 14, color: MUTED }}>open the command menu</text>
        </view>
      ) : null}

      {showToast ? (
        <view style={{ absolute: { x: Math.round(vw / 2) - 160, y: 40 }, width: 320, height: 44, radius: 22, background: [0.1, 0.13, 0.24, 0.92], direction: "row", align: "center", justify: "center" }}>
          <text style={{ fontSize: 14, fontWeight: 600, color: WHITE }}>Ran: {t!.label}</text>
        </view>
      ) : null}

      {/* the modal: scrim (dims the feed) + the refracting glass panel */}
      {v.open ? (
        <>
          <view style={{ absolute: { x: 0, y: 0 }, width: vw, height: vh, background: [0.02, 0.03, 0.06, 0.5] }} />
          <view
            glass={{ refraction: 0.14, dispersion: 0.07, blur: 7, tint: 0.06, tintColor: [0.82, 0.86, 1, 1], rim: 18, specular: 0.07 }}
            style={{ absolute: { x: g.x, y: g.y }, width: g.w, height: panelH, radius: 18, direction: "column" }}
          >
            <Field query={v.query} w={g.w} h={g.fieldH} />
            {v.visible.length ? (
              <view style={{ width: "stretch", direction: "column", padding: g.pad }}>
                {v.visible.map((it, r) => (
                  <Row key={it.id} item={it} active={v.windowStart + r === v.activeIndex} rowH={g.rowH} />
                ))}
              </view>
            ) : (
              <view style={{ width: "stretch", height: 64, direction: "row", align: "center", justify: "center" }}>
                <text style={{ fontSize: 15, color: MUTED }}>No matching commands</text>
              </view>
            )}
          </view>
        </>
      ) : null}
    </view>
  );
}

export async function bootCommandMenu(canvas: HTMLCanvasElement): Promise<void> {
  const root = await createGpuRoot(canvas, { camera: false });
  const host = canvas.parentElement!;

  let toastState: { label: string; at: number } | null = null;
  const run = (label: string) => { toastState = { label, at: performance.now() }; root.requestRender(); console.log(`[cmd] ${label}`); };

  const ITEMS: CommandItem[] = [
    { id: "new", label: "New File", hint: "⌘N", onSelect: () => run("New File") },
    { id: "open", label: "Open…", hint: "⌘O", keywords: "file", onSelect: () => run("Open…") },
    { id: "save", label: "Save", hint: "⌘S", onSelect: () => run("Save") },
    { id: "saveas", label: "Save As…", hint: "⇧⌘S", onSelect: () => run("Save As…") },
    { id: "find", label: "Find in Files", hint: "⇧⌘F", keywords: "search grep", onSelect: () => run("Find in Files") },
    { id: "goto", label: "Go to Line…", hint: "⌃G", onSelect: () => run("Go to Line…") },
    { id: "format", label: "Format Document", hint: "⇧⌥F", keywords: "prettier", onSelect: () => run("Format Document") },
    { id: "split", label: "Split Editor", hint: "⌘\\", onSelect: () => run("Split Editor") },
    { id: "theme", label: "Toggle Color Theme", keywords: "dark light", onSelect: () => run("Toggle Color Theme") },
    { id: "sidebar", label: "Toggle Sidebar", hint: "⌘B", onSelect: () => run("Toggle Sidebar") },
    { id: "zoomin", label: "Zoom In", hint: "⌘=", onSelect: () => run("Zoom In") },
    { id: "zoomout", label: "Zoom Out", hint: "⌘-", onSelect: () => run("Zoom Out") },
    { id: "reload", label: "Reload Window", keywords: "refresh", onSelect: () => run("Reload Window") },
    { id: "settings", label: "Open Settings", hint: "⌘,", keywords: "preferences", onSelect: () => run("Open Settings") },
    { id: "palette", label: "Command Palette Help", onSelect: () => run("Command Palette Help") },
  ];

  const controller = createCommandMenu({ host, items: ITEMS, placeholder: "Type a command or search" });
  (window as unknown as { __menu?: CommandMenuController }).__menu = controller;

  root.render(<Scene controller={controller} toast={() => toastState} />);
}
