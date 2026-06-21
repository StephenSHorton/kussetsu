import { useEffect, useState } from "react";
import type { RGBA } from "../core/scene";

// kussetsu/compat demo — the CARD below is authored in PLAIN React: <div>/<h2>/<p>/
// <input>/<button> with className (a Tailwind subset) + inline style, NOT a single line
// of kussetsu vocabulary. The build-time transform (src/compat) rewrites it into
// <view>/<text> + a mapped style; it then renders on the same WebGPU pipeline as the
// hand-authored kussetsu shell + glass panel around it. Migrated HTML and the owned
// vocabulary, coexisting in one tree.
//
// Try it: open http://localhost:5280/?compat — type in the field, click the button.
// Then uncomment a line in BROKEN below and watch the build refuse it with a file:line.

const PAGE: RGBA = [0.03, 0.04, 0.08, 1];
const GLASS_TEXT: RGBA = [0.88, 0.92, 1, 1];

function MigratedCard() {
  const [name, setName] = useState("Ada Lovelace");
  const [count, setCount] = useState(0);
  return (
    // ── everything in here is ordinary HTML/Tailwind, transformed at build time ──
    <div className="flex-col p-6 rounded-2xl bg-slate-800" style={{ width: 380, gap: 16 }}>
      <div className="flex-row items-center gap-3">
        {/* no <img> (no texture pipeline yet) — a plain styled div is the avatar */}
        <div className="rounded-full bg-indigo-500" style={{ width: 48, height: 48 }} />
        <div className="flex-col gap-1">
          <h2 className="text-xl font-bold text-white">{name}</h2>
          <p className="text-sm text-slate-400" style={{ maxWidth: 280 }}>
            Migrated from plain JSX — no kussetsu vocabulary.
          </p>
        </div>
      </div>

      <input
        className="rounded-lg bg-slate-900 text-white"
        style={{ height: 42, padding: 12, fontSize: 15 }}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button
        className="flex-row items-center justify-center rounded-lg bg-indigo-600 text-white"
        style={{ height: 44, fontSize: 15, fontWeight: 700 }}
        onClick={() => setCount((c) => c + 1)}
      >
        Clicked {count} times
      </button>

      {/* —— BROKEN (uncomment one to see compat REFUSE it at build time) ——
      <img src="avatar.png" />
      <div style={{ boxShadow: "0 4px 12px rgba(0,0,0,.4)" }} />
      <div className="shadow-lg" />
      <div className="m-4" />
      <div style={{ background: someColor }} />
      <span onMouseEnter={() => {}}>hover me</span>
      */}
    </div>
  );
}

export function CompatDemo() {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = () => tick((t) => t + 1);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // The SHELL + glass are hand-authored kussetsu (<view>/<text> + glass={{…}}) — they
  // pass through the transform untouched and sit in the same tree as the migrated card.
  return (
    <view style={{ width: vw, height: vh, direction: "column", align: "center", justify: "center", gap: 22, background: PAGE }}>
      <MigratedCard />
      <view glass={{ refraction: 0.12, dispersion: 0.05, tint: 0.04 }} style={{ width: 380, height: 70, radius: 18, direction: "row", align: "center", justify: "center", padding: 16 }}>
        <text style={{ fontSize: 14, fontWeight: 600, color: GLASS_TEXT }}>…and this glass panel is native kussetsu vocabulary</text>
      </view>
    </view>
  );
}
