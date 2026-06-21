import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import type { RGBA } from "../core/scene";
import { ChatApp } from "./ChatApp";
import { FxGallery } from "./FxGallery";
import { MorphDemo } from "./MorphDemo";
import { CommandMenuPanel } from "./CommandMenuDemo";
import { CompatDemo } from "./compat";

// One app, all the demos — a tabbed showcase. The floating glass tab strip is itself
// kussetsu (a glass <view> with role="button" tabs), refracting the demo behind it. Each
// tab swaps the full-screen demo; the active one mounts fresh (so the ⌘K controller and
// animation loops set up / tear down cleanly).

const WHITE: RGBA = [0.97, 0.98, 1, 1];
const MUTED: RGBA = [0.72, 0.76, 0.88, 1];
const TAB_ON: RGBA = [0.36, 0.42, 0.72, 0.85];

const TABS: { id: string; label: string; C: ComponentType }[] = [
  { id: "chat", label: "Chat", C: ChatApp },
  { id: "fx", label: "Glass FX", C: FxGallery },
  { id: "spring", label: "Springs", C: MorphDemo },
  { id: "menu", label: "⌘K Menu", C: CommandMenuPanel },
  { id: "migrate", label: "Migrate", C: CompatDemo },
];
const BAR_W = 560;

export function Showcase() {
  const [tab, setTab] = useState("chat");
  const [, redraw] = useState(0);
  useEffect(() => {
    const h = () => redraw((t) => t + 1);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const Active = TABS.find((t) => t.id === tab)!.C;

  return (
    <view style={{ width: vw, height: vh, background: [0.03, 0.04, 0.08, 1] }}>
      {/* the active demo, full-screen; key forces a fresh mount on tab switch */}
      <Active key={tab} />

      {/* floating glass tab strip (real kussetsu, refracting the demo behind it) */}
      <view
        glass={{ refraction: 0.1, dispersion: 0.04, blur: 8, tint: 0.08, tintColor: [0.8, 0.84, 1, 1], rim: 14 }}
        style={{ absolute: { x: Math.round((vw - BAR_W) / 2), y: 14 }, width: BAR_W, height: 46, radius: 16, cornerSmoothing: 0.6, direction: "row", align: "center", justify: "center", gap: 4, padding: 5 }}
      >
        {TABS.map((t) => (
          <view
            key={t.id}
            role="button"
            ariaLabel={`${t.label} demo`}
            onActivate={() => setTab(t.id)}
            style={{ grow: 1, height: 36, direction: "row", align: "center", justify: "center", radius: 11, cornerSmoothing: 0.6, background: t.id === tab ? TAB_ON : [0, 0, 0, 0] }}
          >
            <text style={{ fontSize: 13.5, fontWeight: 700, color: t.id === tab ? WHITE : MUTED }}>{t.label}</text>
          </view>
        ))}
      </view>
    </view>
  );
}
