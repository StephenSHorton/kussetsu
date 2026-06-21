import { useEffect, useState } from "react";
import type { RGBA } from "../core/scene";

// A real app on the framework: a glass chat client. Exercises layout, scrolling,
// refractive glass (header + composer over the messages), selectable bubble text,
// an editable composer (with IME), click handlers, and accessibility — all on the
// GPU with the DOM only carrying semantics + input.

const PAGE: RGBA = [0.04, 0.05, 0.09, 1];
const SIDEBAR: RGBA = [0.07, 0.08, 0.14, 1];
const WHITE: RGBA = [0.95, 0.96, 1, 1];
const MUTED: RGBA = [0.6, 0.65, 0.78, 1];
const ACCENT: RGBA = [0.36, 0.46, 0.97, 1];
const THEM: RGBA = [0.17, 0.19, 0.29, 1];
const ROW_ACTIVE: RGBA = [0.14, 0.17, 0.29, 1];
const GLASS = { refraction: 0.1, tint: 0.05 } as const; // blur/rim/specular = defaults (0 / 16 / 0.05)
const SIDEBAR_W = 300;
const HEADER_H = 64;
const COMPOSER_H = 76;

interface Msg {
  from: "me" | "them";
  text: string;
}
interface Conv {
  id: number;
  name: string;
  color: RGBA;
  preview: string;
  messages: Msg[];
}

const INITIAL: Conv[] = [
  {
    id: 1,
    name: "Ada Lovelace",
    color: [0.36, 0.46, 0.97, 1],
    preview: "Even this text?",
    messages: [
      { from: "them", text: "Have you seen the new renderer?" },
      { from: "me", text: "Yes — every pixel is painted on the GPU. The DOM only carries accessibility and input now." },
      { from: "them", text: "Even this text?" },
      { from: "me", text: "Even this text. It's drawn from a glyph atlas, and you can select it — try dragging across this message." },
      { from: "them", text: "And the glass bars at the top and bottom?" },
      { from: "me", text: "Real refractive glass. Scroll the thread and watch them bend the messages underneath." },
    ],
  },
  {
    id: 2,
    name: "Grace Hopper",
    color: [0.18, 0.71, 0.61, 1],
    preview: "Found the bug.",
    messages: [
      { from: "them", text: "Found the bug. A moth, in the relay." },
      { from: "me", text: "Taped into the logbook?" },
      { from: "them", text: "Naturally. First actual case of debugging being found." },
    ],
  },
  {
    id: 3,
    name: "Alan Turing",
    color: [0.94, 0.56, 0.24, 1],
    preview: "Can machines think?",
    messages: [
      { from: "them", text: "Can machines think?" },
      { from: "me", text: "This one paints a whole UI at 60fps, so — getting there." },
    ],
  },
  {
    id: 4,
    name: "Katherine Johnson",
    color: [0.86, 0.32, 0.56, 1],
    preview: "Re-check the numbers.",
    messages: [
      { from: "them", text: "Re-check the numbers before we commit to the trajectory." },
      { from: "me", text: "Running it now. The composer below is a real editable field — IME works too." },
    ],
  },
];

function Avatar({ color, size }: { color: RGBA; size: number }) {
  return <view style={{ width: size, height: size, radius: size / 2, background: color }} />;
}

export function ChatApp() {
  const [convs, setConvs] = useState<Conv[]>(INITIAL);
  const [activeId, setActiveId] = useState(1);
  const [draft, setDraft] = useState("");
  // Re-render on resize so the absolute glass bars track the viewport.
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick((t) => t + 1);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const active = convs.find((c) => c.id === activeId) ?? convs[0];
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const mainX = SIDEBAR_W;
  const mainW = vw - SIDEBAR_W;

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setConvs((cs) => cs.map((c) => (c.id === activeId ? { ...c, messages: [...c.messages, { from: "me", text }], preview: text } : c)));
    setDraft("");
  };

  return (
    <view style={{ direction: "row", width: vw, height: vh, background: PAGE }}>
      {/* ── Sidebar: conversation list ── */}
      <view style={{ width: SIDEBAR_W, height: vh, background: SIDEBAR, direction: "column" }}>
        <view style={{ width: "stretch", padding: 22, direction: "row", align: "center", gap: 10 }}>
          <text role="heading" level={1} style={{ fontSize: 22, fontWeight: 800, color: WHITE }}>
            Messages
          </text>
        </view>
        <view style={{ grow: 1, width: "stretch", overflow: "scroll", direction: "column", padding: 8, gap: 4 }}>
          {convs.map((c) => (
            <view
              key={c.id}
              role="button"
              ariaLabel={`Open chat with ${c.name}`}
              onActivate={() => setActiveId(c.id)}
              style={{ width: "stretch", height: 66, shrink: 0, direction: "row", align: "center", gap: 12, padding: 12, radius: 14, background: c.id === activeId ? ROW_ACTIVE : SIDEBAR }}
            >
              <Avatar color={c.color} size={42} />
              <view style={{ direction: "column", gap: 3, grow: 1 }}>
                <text style={{ fontSize: 15, fontWeight: 600, color: WHITE }}>{c.name}</text>
                <text style={{ maxWidth: 180, fontSize: 13, color: MUTED }}>{c.preview}</text>
              </view>
            </view>
          ))}
        </view>
      </view>

      {/* ── Main: scrolling message thread ── */}
      <view style={{ grow: 1, height: vh, direction: "column" }}>
        <view style={{ grow: 1, width: "stretch", overflow: "scroll", direction: "column", padding: 24, gap: 12 }}>
          <view style={{ width: "stretch", height: HEADER_H - 8, shrink: 0 }} />
          {active.messages.map((m, i) => (
            <view key={i} style={{ width: "stretch", shrink: 0, direction: "row", justify: m.from === "me" ? "end" : "start" }}>
              <view style={{ direction: "row", padding: 13, radius: 18, background: m.from === "me" ? ACCENT : THEM }}>
                <text selectable style={{ maxWidth: 380, fontSize: 15, color: m.from === "me" ? WHITE : [0.88, 0.91, 0.99, 1] }}>
                  {m.text}
                </text>
              </view>
            </view>
          ))}
          <view style={{ width: "stretch", height: COMPOSER_H, shrink: 0 }} />
        </view>
      </view>

      {/* ── Glass header: refracts the thread; its label sits crisply ON the glass ── */}
      <view glass={GLASS} style={{ absolute: { x: mainX, y: 0 }, width: mainW, height: HEADER_H, radius: 0, direction: "row", align: "center", gap: 12, padding: 24 }}>
        <Avatar color={active.color} size={34} />
        <text style={{ fontSize: 17, fontWeight: 700, color: WHITE }}>{active.name}</text>
      </view>

      {/* ── Glass composer: input + Send sit ON the glass ── */}
      <view glass={GLASS} style={{ absolute: { x: mainX, y: vh - COMPOSER_H }, width: mainW, height: COMPOSER_H, radius: 0, direction: "row", align: "center", gap: 12, padding: 18 }}>
        <view editable value={draft} onChange={setDraft} style={{ grow: 1, height: 40, direction: "row", align: "center", padding: 16, radius: 20, background: [0.12, 0.14, 0.23, 1] }}>
          <text style={{ fontSize: 15, color: draft ? WHITE : MUTED }}>{draft || "Message…"}</text>
        </view>
        <view role="button" ariaLabel="Send message" onActivate={send} style={{ width: 88, height: 40, shrink: 0, direction: "row", align: "center", justify: "center", radius: 20, background: ACCENT }}>
          <text style={{ fontSize: 14, fontWeight: 700, color: WHITE }}>Send</text>
        </view>
      </view>
    </view>
  );
}
