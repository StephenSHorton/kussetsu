import { useState } from "react";
import type { RGBA } from "./scene";

const WHITE: RGBA = [0.96, 0.97, 1, 1];
const MUTED: RGBA = [0.62, 0.68, 0.82, 1];
const PAGE: RGBA = [0.03, 0.04, 0.07, 1];

// Colorful "node" cards — the busy backdrop the glass refracts.
const NODES: { label: string; color: RGBA }[] = [
  { label: "Source", color: [0.36, 0.42, 0.95, 1] },
  { label: "Transform", color: [0.16, 0.71, 0.62, 1] },
  { label: "Filter", color: [0.94, 0.56, 0.22, 1] },
  { label: "Join", color: [0.86, 0.3, 0.55, 1] },
  { label: "Aggregate", color: [0.46, 0.36, 0.86, 1] },
  { label: "Sink", color: [0.28, 0.63, 0.92, 1] },
];

function NodeCard({ label, color }: { label: string; color: RGBA }) {
  return (
    <view style={{ width: 200, height: 130, radius: 18, background: color, direction: "column", justify: "end", padding: 16 }}>
      <text style={{ fontSize: 18, fontWeight: 700, color: WHITE }}>{label}</text>
    </view>
  );
}

export function App() {
  // Glass panel position in WORLD coords; dragged via the invisible overlay.
  const [pos, setPos] = useState({ x: 150, y: 205 });

  return (
    <view style={{ direction: "column", padding: 56, gap: 26, background: PAGE }}>
      <view style={{ direction: "column", gap: 8 }}>
        <text role="heading" level={1} style={{ fontSize: 32, fontWeight: 800, color: WHITE }}>
          Glass on a framebuffer we own
        </text>
        <text role="paragraph" style={{ fontSize: 16, color: MUTED }}>
          Drag the glass over the nodes · scroll to zoom · drag the background to pan.
        </text>
      </view>

      <view style={{ direction: "row", gap: 18 }}>
        {NODES.slice(0, 3).map((n, i) => (
          <NodeCard key={i} label={n.label} color={n.color} />
        ))}
      </view>
      <view style={{ direction: "row", gap: 18 }}>
        {NODES.slice(3).map((n, i) => (
          <NodeCard key={i} label={n.label} color={n.color} />
        ))}
      </view>

      {/* Real flexbox (Yoga): a wrapping chip row — the hand-rolled engine could
          NOT wrap. Constrained to 640px so chips flow onto multiple lines. */}
      <view style={{ direction: "row", wrap: true, gap: 10, width: 640 }}>
        {["map", "filter", "reduce", "window", "join", "split", "merge", "dedupe", "sort", "limit", "batch", "retry", "flatMap", "scan", "throttle"].map((t, i) => (
          <view key={i} style={{ direction: "row", padding: 11, radius: 10, background: [0.15, 0.17, 0.25, 1] }}>
            <text style={{ fontSize: 14, fontWeight: 600, color: [0.78, 0.84, 0.96, 1] }}>{t}</text>
          </view>
        ))}
      </view>

      {/* Draggable refractive glass panel — grab it and shove it over the graph. */}
      <view
        glass={{ refraction: 0.13, frost: 5, tint: 0.07, rim: 30 }}
        draggable
        ariaLabel="Draggable glass panel"
        onDrag={(dx, dy) => setPos((p) => ({ x: p.x + dx, y: p.y + dy }))}
        style={{ absolute: pos, width: 300, height: 210, radius: 28 }}
      />
    </view>
  );
}
