import { useState } from "react";
import { Image, Svg, Text, View } from "../core";

// A filled SVG exercising the analytic vector path: rounded rect (arcs) + circle (arcs) + triangle
// (lines) + a cubic-curve wave + an even-odd square donut. All FILLS — crisp at any zoom.
const TEST_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
      "<rect x='2' y='2' width='96' height='96' rx='16' fill='#1a2030'/>" +
      "<circle cx='30' cy='32' r='18' fill='#ff5c5c'/>" +
      "<polygon points='62,12 86,56 38,56' fill='#00d98b'/>" +
      "<path d='M16 66 C36 92, 78 92, 92 68 L92 90 L16 90 Z' fill='#5c7cff'/>" +
      "<path d='M58 60 h34 v34 h-34 z M66 68 h18 v18 h-18 z' fill='#ffd23f' fill-rule='evenodd'/>" +
      "</svg>",
  );

// Real Lucide-style STROKE icons (fill=none, stroke, round caps/joins) — exercise stroke-to-fill.
const icon = (inner: string) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#e6edf6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${inner}</svg>`,
  );
const ICON_CHECK = icon("<path d='M20 6 9 17l-5-5'/>");
const ICON_HEART = icon("<path d='M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'/>");
const ICON_CIRCLE = icon("<circle cx='12' cy='12' r='9'/>");
const ICON_X = icon("<path d='M18 6 6 18M6 6l12 12'/>");
const ICON_ACTIVITY = icon("<polyline points='22 12 18 12 15 21 9 3 6 12 2 12'/>"); // open polyline (caps, no closing edge)
const ICON_HEART_FADED = // translucent stroke — must NOT double-darken at joins/caps
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#e6edf6' stroke-opacity='0.45' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'/></svg>",
  );

import type { RGBA } from "../core/scene";

// A 2:1 (240×120) data-URI image so cover/contain/fill are visually distinct in a square box.
const DEMO_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff5c5c'/><stop offset='1' stop-color='#5c5cff'/></linearGradient></defs><rect width='240' height='120' fill='url(#g)'/><circle cx='60' cy='60' r='42' fill='#ffffff' fill-opacity='0.85'/><rect x='150' y='28' width='62' height='62' rx='10' fill='#00ff95'/></svg>",
  );

const WHITE: RGBA = [0.96, 0.97, 1, 1];
const MUTED: RGBA = [0.62, 0.68, 0.82, 1];
const PAGE: RGBA = [0.03, 0.04, 0.07, 1];
const GLASS = { refraction: 0.13, tint: 0.06 } as const; // blur/rim/specular = defaults (0 / 16 / 0.05)

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
    <View style={{ direction: "column", padding: 56, gap: 24, background: PAGE }}>
      <View style={{ direction: "column", gap: 8 }}>
        <Text role="heading" level={1} style={{ fontSize: 30, fontWeight: 800, color: WHITE }}>
          GPU-rendered node editor
        </Text>
        <Text role="paragraph" style={{ fontSize: 15, color: MUTED }}>
          Drag the nodes. Drag the two glass panels over each other — the top refracts the bottom (glass-over-glass).
        </Text>
      </View>

      {/* zIndex overlay: authored EARLY in the tree (before the node cards) but lifted to the overlay
          layer, so it paints ON TOP of the absolute node cards below — a top-layer modal/dropdown/tooltip. */}
      <View style={{ absolute: { x: 360, y: 150 }, zIndex: 100, width: 300, height: 150, radius: 16, direction: "column", padding: 20, gap: 8, background: [0.12, 0.14, 0.22, 0.98], border: 1, borderColor: [1, 1, 1, 0.16], boxShadow: { y: 18, blur: 44, color: [0, 0, 0, 0.6] } }}>
        <Text style={{ fontSize: 17, fontWeight: 800, color: WHITE }}>Overlay (zIndex: 100)</Text>
        <Text style={{ fontSize: 13, color: MUTED }}>Authored before the node cards, yet painted above them — a top-layer modal/dropdown/tooltip.</Text>
      </View>

      {/* Reserves the editor area the absolute nodes + glass occupy. */}
      <View style={{ width: "stretch", height: 360 }} />

      {/* GPU-textured images — the same 2:1 source at fit cover · contain (bg shows the letterbox) ·
          fill, then a circular avatar (radius = half the box). Loaded once, cached, clipped on the GPU. */}
      <View style={{ direction: "row", gap: 16, align: "center" }}>
        <Image src={DEMO_IMG} fit="cover" style={{ width: 120, height: 120, radius: 16 }} />
        <Image src={DEMO_IMG} fit="contain" style={{ width: 120, height: 120, radius: 16, background: [0.1, 0.12, 0.2, 1] }} />
        <Image src={DEMO_IMG} fit="fill" style={{ width: 120, height: 120, radius: 16 }} />
        <Image src={DEMO_IMG} fit="cover" style={{ width: 96, height: 96, radius: 48 }} />
      </View>

      {/* Real vector-rendered SVG (analytic GPU fills — crisp at any zoom) at three sizes. */}
      <View style={{ direction: "row", gap: 16, align: "center" }}>
        <Svg src={TEST_SVG} style={{ width: 240, height: 240 }} />
        <Svg src={TEST_SVG} style={{ width: 120, height: 120 }} />
        <Svg src={TEST_SVG} style={{ width: 48, height: 48 }} />
      </View>

      {/* Lucide-style STROKE icons (stroke-to-fill) at 96 + 32px. */}
      <View style={{ direction: "row", gap: 20, align: "center" }}>
        <Svg src={ICON_CHECK} style={{ width: 96, height: 96 }} />
        <Svg src={ICON_HEART} style={{ width: 96, height: 96 }} />
        <Svg src={ICON_CIRCLE} style={{ width: 96, height: 96 }} />
        <Svg src={ICON_X} style={{ width: 96, height: 96 }} />
        <Svg src={ICON_CHECK} style={{ width: 32, height: 32 }} />
        <Svg src={ICON_HEART} style={{ width: 32, height: 32 }} />
        <Svg src={ICON_ACTIVITY} style={{ width: 96, height: 96 }} />
        <Svg src={ICON_HEART_FADED} style={{ width: 96, height: 96 }} />
      </View>

      {/* Real flexbox (Yoga): a wrapping chip row. */}
      <View style={{ direction: "row", wrap: true, gap: 10, width: 640 }}>
        {CHIPS.map((t, i) => (
          <View key={i} style={{ direction: "row", padding: 10, radius: 10, background: [0.15, 0.17, 0.25, 1] }}>
            <Text style={{ fontSize: 13, fontWeight: 600, color: [0.78, 0.84, 0.96, 1] }}>{t}</Text>
          </View>
        ))}
      </View>

      {/* Selectable + wrapping text (A): click and drag across it to select. */}
      <View style={{ width: 440, padding: 18, radius: 14, background: [0.08, 0.1, 0.16, 1], boxShadow: { y: 12, blur: 32, color: [0, 0, 0, 0.55] } }}>
        <Text selectable role="paragraph" style={{ width: "stretch", fontSize: 16, fontWeight: 400, color: [0.82, 0.87, 0.97, 1] }}>
          {"This paragraph is GPU-painted and wraps via Intl.Segmenter. Click and drag across it to select — the highlight and caret come from per-character positions measured on the fly. Real text, on a canvas we own."}
        </Text>
      </View>

      {/* Editable field (C): click to focus a transparent <input>; type / IME. */}
      <View editable value={field} onChange={setField} style={{ width: 440, height: 46, direction: "row", align: "center", padding: 14, radius: 12, background: [0.1, 0.12, 0.2, 1] }}>
        <Text style={{ fontSize: 16, color: [0.92, 0.95, 1, 1] }}>{field}</Text>
      </View>

      {/* Scrolling + clipping: a fixed-height list. */}
      <View style={{ width: 380, height: 200, overflow: "scroll", padding: 12, gap: 8, radius: 14, background: [0.07, 0.09, 0.15, 1] }}>
        {Array.from({ length: 24 }, (_, i) => (
          <View key={i} style={{ width: "stretch", height: 40, shrink: 0, direction: "row", align: "center", padding: 12, radius: 9, background: [0.14, 0.16, 0.25, 1] }}>
            <Text style={{ fontSize: 14, fontWeight: 600, color: [0.84, 0.89, 1, 1] }}>{`Row ${i + 1} — scroll me`}</Text>
          </View>
        ))}
      </View>

      {/* Draggable nodes (absolute, over the editor area). */}
      {nodes.map((n) => (
        <View
          key={n.id}
          draggable
          ariaLabel={n.label}
          onDrag={(dx, dy) => moveNode(n.id, dx, dy)}
          style={{ absolute: { x: n.x, y: n.y }, width: 150, height: 92, radius: 14, background: n.color, direction: "column", justify: "end", padding: 14 }}
        >
          <Text style={{ fontSize: 15, fontWeight: 700, color: WHITE }}>{n.label}</Text>
        </View>
      ))}

      {/* Two draggable glass panels — overlap => glass-over-glass (B refracts A). */}
      <View glass={GLASS} draggable ariaLabel="Glass panel A" onDrag={(dx, dy) => setGlassA((p) => ({ x: p.x + dx, y: p.y + dy }))} style={{ absolute: glassA, width: 230, height: 155, radius: 24 }} />
      <View glass={GLASS} draggable ariaLabel="Glass panel B" onDrag={(dx, dy) => setGlassB((p) => ({ x: p.x + dx, y: p.y + dy }))} style={{ absolute: glassB, width: 230, height: 155, radius: 24 }} />
    </View>
  );
}
