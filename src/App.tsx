import { useEffect, useState } from "react";
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
  // Animate via React state (proves React drives even the moving glass).
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      setT((performance.now() - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const panelW = 300;
  const panelH = 210;
  // Keep the sweep over the colorful node cards (x ~56–692, two rows).
  const gx = 210 + Math.sin(t * 0.5) * 160;
  const gy = 235 + Math.cos(t * 0.8) * 95;

  return (
    <view style={{ direction: "column", padding: 56, gap: 26, background: PAGE }}>
      <view style={{ direction: "column", gap: 8 }}>
        <text role="heading" level={1} style={{ fontSize: 32, fontWeight: 800, color: WHITE }}>
          Glass on a framebuffer we own
        </text>
        <text role="paragraph" style={{ fontSize: 16, color: MUTED }}>
          The floating panel refracts whatever is behind it — over any node, anywhere. No capture, no compositor limits.
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

      {/* The refractive glass panel — absolutely positioned, swept across the nodes. */}
      <view
        glass={{ refraction: 0.13, frost: 5, tint: 0.07, rim: 30 }}
        style={{ absolute: { x: gx, y: gy }, width: panelW, height: panelH, radius: 28 }}
      />
    </view>
  );
}
