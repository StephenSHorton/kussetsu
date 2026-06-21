import { useState } from "react";
import type { RGBA } from "./scene";

const WHITE: RGBA = [0.96, 0.97, 1, 1];
const MUTED: RGBA = [0.62, 0.68, 0.82, 1];
const PAGE: RGBA = [0.03, 0.04, 0.07, 1];
const GLASS = { refraction: 0.13, frost: 5, tint: 0.07, rim: 30 } as const;

interface GNode {
  id: number;
  x: number;
  y: number;
  label: string;
  color: RGBA;
}

const INITIAL_NODES: GNode[] = [
  { id: 1, x: 60, y: 132, label: "Source", color: [0.36, 0.42, 0.95, 1] },
  { id: 2, x: 250, y: 132, label: "Transform", color: [0.16, 0.71, 0.62, 1] },
  { id: 3, x: 440, y: 132, label: "Filter", color: [0.94, 0.56, 0.22, 1] },
  { id: 4, x: 60, y: 300, label: "Join", color: [0.86, 0.3, 0.55, 1] },
  { id: 5, x: 250, y: 300, label: "Aggregate", color: [0.46, 0.36, 0.86, 1] },
  { id: 6, x: 440, y: 300, label: "Sink", color: [0.28, 0.63, 0.92, 1] },
];

const CHIPS = ["map", "filter", "reduce", "window", "join", "split", "merge", "dedupe", "sort", "limit", "batch", "retry", "flatMap", "scan", "throttle"];

export function App() {
  const [nodes, setNodes] = useState<GNode[]>(INITIAL_NODES);
  const [glassA, setGlassA] = useState({ x: 150, y: 188 });
  const [glassB, setGlassB] = useState({ x: 300, y: 256 });
  const [field, setField] = useState("Edit me — type or use IME");

  const moveNode = (id: number, dx: number, dy: number) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)));

  return (
    <view style={{ direction: "column", padding: 56, gap: 24, background: PAGE }}>
      <view style={{ direction: "column", gap: 8 }}>
        <text role="heading" level={1} style={{ fontSize: 30, fontWeight: 800, color: WHITE }}>
          GPU-rendered node editor
        </text>
        <text role="paragraph" style={{ fontSize: 15, color: MUTED }}>
          Drag the nodes. Drag the two glass panels over each other — the top refracts the bottom (glass-over-glass).
        </text>
      </view>

      {/* Reserves the editor area the absolute nodes + glass occupy. */}
      <view style={{ width: "stretch", height: 360 }} />

      {/* Real flexbox (Yoga): a wrapping chip row. */}
      <view style={{ direction: "row", wrap: true, gap: 10, width: 640 }}>
        {CHIPS.map((t, i) => (
          <view key={i} style={{ direction: "row", padding: 10, radius: 10, background: [0.15, 0.17, 0.25, 1] }}>
            <text style={{ fontSize: 13, fontWeight: 600, color: [0.78, 0.84, 0.96, 1] }}>{t}</text>
          </view>
        ))}
      </view>

      {/* Selectable + wrapping text (A): click and drag across it to select. */}
      <view style={{ width: 440, padding: 18, radius: 14, background: [0.08, 0.1, 0.16, 1] }}>
        <text selectable role="paragraph" style={{ width: "stretch", fontSize: 16, fontWeight: 400, color: [0.82, 0.87, 0.97, 1] }}>
          {"This paragraph is GPU-painted and wraps via Intl.Segmenter. Click and drag across it to select — the highlight and caret come from per-character positions measured on the fly. Real text, on a canvas we own."}
        </text>
      </view>

      {/* Editable field (C): click to focus a transparent <input>; type / IME. */}
      <view editable value={field} onChange={setField} style={{ width: 440, height: 46, direction: "row", align: "center", padding: 14, radius: 12, background: [0.1, 0.12, 0.2, 1] }}>
        <text style={{ fontSize: 16, color: [0.92, 0.95, 1, 1] }}>{field}</text>
      </view>

      {/* Scrolling + clipping: a fixed-height list. */}
      <view style={{ width: 380, height: 200, overflow: "scroll", padding: 12, gap: 8, radius: 14, background: [0.07, 0.09, 0.15, 1] }}>
        {Array.from({ length: 24 }, (_, i) => (
          <view key={i} style={{ width: "stretch", height: 40, shrink: 0, direction: "row", align: "center", padding: 12, radius: 9, background: [0.14, 0.16, 0.25, 1] }}>
            <text style={{ fontSize: 14, fontWeight: 600, color: [0.84, 0.89, 1, 1] }}>{`Row ${i + 1} — scroll me`}</text>
          </view>
        ))}
      </view>

      {/* Draggable nodes (absolute, over the editor area). */}
      {nodes.map((n) => (
        <view
          key={n.id}
          draggable
          ariaLabel={n.label}
          onDrag={(dx, dy) => moveNode(n.id, dx, dy)}
          style={{ absolute: { x: n.x, y: n.y }, width: 150, height: 92, radius: 14, background: n.color, direction: "column", justify: "end", padding: 14 }}
        >
          <text style={{ fontSize: 15, fontWeight: 700, color: WHITE }}>{n.label}</text>
        </view>
      ))}

      {/* Two draggable glass panels — overlap => glass-over-glass (B refracts A). */}
      <view glass={GLASS} draggable ariaLabel="Glass panel A" onDrag={(dx, dy) => setGlassA((p) => ({ x: p.x + dx, y: p.y + dy }))} style={{ absolute: glassA, width: 230, height: 155, radius: 24 }} />
      <view glass={GLASS} draggable ariaLabel="Glass panel B" onDrag={(dx, dy) => setGlassB((p) => ({ x: p.x + dx, y: p.y + dy }))} style={{ absolute: glassB, width: 230, height: 155, radius: 24 }} />
    </view>
  );
}
