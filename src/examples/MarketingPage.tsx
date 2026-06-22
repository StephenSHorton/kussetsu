import { useEffect, useMemo, useState } from "react";
import type { GlassSpec, RGBA } from "../core/scene";

// Kussetsu's marketing site, built IN Kussetsu — DARK: a black field lit by drifting colorful
// gradient lights (a full-screen WGSL background the glass actually REFRACTS), white type, and
// glass throughout: a fixed frosted nav, feature cards, and one empty pane that glides across
// so you watch the refraction track the light. Route "/" (the capability demo lives at ?demo).

const REPO = "https://github.com/StephenSHorton/kussetsu";
const NAV_H = 66;

const INK: RGBA = [0.98, 0.98, 1, 1]; // headings (white)
const SLATE: RGBA = [0.76, 0.79, 0.89, 1]; // body
const FAINT: RGBA = [0.56, 0.6, 0.72, 1];
const ACCENT: RGBA = [0.55, 0.56, 1, 1]; // bright indigo
const WHITE: RGBA = [1, 1, 1, 1];

// Glass on a dark, colorful field: nearly clear (blur 2) so it refracts the light crisply;
// the white rim + sheen + chromatic dispersion all read on dark.
const COOL: RGBA = [0.86, 0.9, 1, 1];
const NAV_GLASS: GlassSpec = { refraction: 0.06, blur: 0, tint: 0.06, tintColor: COOL, rim: 14, specular: 0.1, dispersion: 0.05 };
const CARD_GLASS: GlassSpec = { refraction: 0.09, blur: 0, tint: 0.07, tintColor: COOL, rim: 16, specular: 0.1, dispersion: 0.06 };
const CTA_GLASS: GlassSpec = { refraction: 0.1, blur: 0, tint: 0.05, tintColor: COOL, rim: 16, specular: 0.16, dispersion: 0.07 };
const PANE_GLASS: GlassSpec = { refraction: 0.12, blur: 0, tint: 0.05, tintColor: COOL, rim: 18, specular: 0.14, dispersion: 0.09 };

// Lamp effect (à la Aceternity): thin bright tubes + soft glow CONES on deep navy. Several lamps
// spaced down the page that SCROLL WITH IT (u.c0.x = page scroll, world Y → screen). Small,
// spread, dim. Rendered INTO the backdrop so glass refracts the light.
export const BG_LIGHTS = `
fn material(uv: vec2f, px: vec2f) -> vec4f {
  let asp = u.res.x / max(u.res.y, 1.0);
  let p = vec2f(uv.x * asp, uv.y);
  let cx = 0.5 * asp;
  let scroll = u.c0.x;
  let vh = max(u.res.y, 1.0);
  let halfW = 0.20 * asp; // smaller tube
  var c = vec3f(0.012, 0.016, 0.035); // deep navy room
  for (var i = 0; i < 4; i = i + 1) {
    let worldY = 360.0 + f32(i) * 740.0;   // lamps down the page, moving up as you scroll
    let ly = (worldY - scroll) / vh;
    let col = hsv2rgb(vec3f(fract(0.55 + f32(i) * 0.13), 0.72, 1.0)); // cyan → blue → violet → magenta
    // glow cone — spread out + dim
    let dx = (p.x - cx) / (halfW * 2.2);
    let dyB = max(0.0, p.y - ly) / 0.62;
    let dyA = max(0.0, ly - p.y) / 0.13;
    c += col * exp(-(dx * dx + dyB * dyB + dyA * dyA)) * 0.5;
    // the thin tube
    let dl = (p.y - ly) / 0.004;
    let xMask = smoothstep(halfW, halfW * 0.78, abs(p.x - cx));
    c += (col * 0.5 + vec3f(0.28)) * xMask / (1.0 + dl * dl);
  }
  return vec4f(c, 1.0);
}`;

function goDemo() {
  window.location.search = "?demo";
}
function goRepo() {
  window.open(REPO, "_blank", "noopener");
}

function NavLink({ label, onActivate }: { label: string; onActivate: () => void }) {
  return (
    <view role="button" ariaLabel={label} onActivate={onActivate} style={{ height: 36, direction: "row", align: "center", justify: "center", padding: 12, radius: 9, cornerSmoothing: 0.6 }}>
      <text style={{ fontSize: 15, fontWeight: 600, color: SLATE }}>{label}</text>
    </view>
  );
}

function Nav({ vw }: { vw: number }) {
  return (
    <view glass={NAV_GLASS} style={{ absolute: { x: 0, y: 0 }, width: vw, height: NAV_H, direction: "row", align: "center", padding: 26, gap: 4 }}>
      <text style={{ fontSize: 21, fontWeight: 800, color: INK }}>Kussetsu</text>
      <view style={{ grow: 1 }} />
      <view style={{ direction: "row", align: "center", gap: 6 }}>
        <NavLink label="Demo" onActivate={goDemo} />
        <NavLink label="GitHub" onActivate={goRepo} />
        <view role="button" ariaLabel="Get started" onActivate={goRepo} style={{ height: 38, direction: "row", align: "center", justify: "center", padding: 18, radius: 11, cornerSmoothing: 0.6, background: ACCENT }}>
          <text style={{ fontSize: 15, fontWeight: 700, color: WHITE }}>Get started</text>
        </view>
      </view>
    </view>
  );
}

function PillButton({ label, glass, fill, onActivate }: { label: string; glass?: boolean; fill?: RGBA; onActivate: () => void }) {
  const base = { height: 52, shrink: 0, direction: "row", align: "center", justify: "center", padding: 28, radius: 14, cornerSmoothing: 0.6 } as const;
  const color = fill ? WHITE : INK;
  const inner = <text style={{ fontSize: 16, fontWeight: 700, color }}>{label}</text>;
  return glass ? (
    <view role="button" ariaLabel={label} onActivate={onActivate} glass={CTA_GLASS} style={base}>{inner}</view>
  ) : (
    <view role="button" ariaLabel={label} onActivate={onActivate} style={{ ...base, background: fill ?? ACCENT }}>{inner}</view>
  );
}

function SectionHeading({ vw, title, sub }: { vw: number; title: string; sub: string }) {
  return (
    <view style={{ width: Math.min(760, vw - 80), direction: "column", align: "center", gap: 10, padding: 28 }}>
      <text role="heading" level={2} style={{ fontSize: 42, fontWeight: 800, color: INK }}>{title}</text>
      <text style={{ maxWidth: 620, fontSize: 18, fontWeight: 500, color: SLATE }}>{sub}</text>
    </view>
  );
}

function Hero({ vw, vh }: { vw: number; vh: number }) {
  const h = Math.max(640, vh);
  return (
    <view style={{ width: "stretch", height: h, direction: "column", align: "center", justify: "center" }}>
      <view style={{ width: Math.min(880, vw - 80), direction: "column", align: "center", gap: 26 }}>
        <text role="heading" level={1} style={{ fontSize: 70, fontWeight: 800, color: INK }}>Interfaces, painted on the GPU.</text>
        <text style={{ maxWidth: 660, fontSize: 20, fontWeight: 500, color: SLATE }}>
          Kussetsu renders your React with WebGPU — refraction, shaders, real spring physics — while the DOM stays a clean, invisible layer for accessibility. The whole page is the proof: glass bending live light, the way CSS never could.
        </text>
        <view style={{ direction: "row", gap: 14, align: "center" }}>
          <PillButton label="Get started" fill={ACCENT} onActivate={goRepo} />
          <PillButton label="See the live demo" glass onActivate={goDemo} />
        </view>
      </view>
    </view>
  );
}

// ── One empty glass pane gliding across in a loop — pure refraction tracking the moving light ──
function PaneSection({ vw, t }: { vw: number; t: number }) {
  const h = 560;
  const paneW = 440, paneH = 132;
  const headY = 230; // heading top
  const paneY = headY - 34; // pane centered on the heading line → it glides OVER the words
  const span = vw + paneW + 140;
  const x = (((t * 90) % span) + span) % span - paneW - 70; // smooth left→right loop
  return (
    <view style={{ width: "stretch", height: h, direction: "column", align: "center", overflow: "hidden" }}>
      <view style={{ absolute: { x: 0, y: headY }, width: vw, direction: "row", justify: "center" }}>
        <text role="heading" level={2} style={{ fontSize: 50, fontWeight: 800, color: INK }}>Real UI, rendered in glass</text>
      </view>
      <view style={{ absolute: { x: 0, y: 360 }, width: vw, direction: "row", justify: "center" }}>
        <text style={{ maxWidth: 600, fontSize: 18, fontWeight: 500, color: SLATE }}>An empty pane glides across the words — watch the type refract and its chromatic edge shift as it passes. Nothing inside it; it's all the lens.</text>
      </view>
      <view glass={PANE_GLASS} style={{ absolute: { x, y: paneY }, width: paneW, height: paneH, radius: 22, cornerSmoothing: 0.7 }} />
    </view>
  );
}

interface Feature { title: string; body: string; color: RGBA; }
const FEATURES: Feature[] = [
  { title: "Own the renderer", body: "A custom React reconciler paints every pixel on WebGPU. No DOM nodes to fight, no compositor to beg.", color: [0.4, 0.44, 0.96, 1] },
  { title: "Beyond CSS", body: "Refraction, chromatic dispersion, per-element WGSL shaders, GPU particles. Effects CSS has no syntax for.", color: [0.1, 0.78, 0.62, 1] },
  { title: "Accessible by design", body: "An invisible DOM mirrors every interactive node — real roles, focus, find-in-page, screen readers. The GPU is just the paint.", color: [1, 0.46, 0.42, 1] },
];

function Features({ vw }: { vw: number }) {
  const cardW = 320, gap = 26;
  const gridW = FEATURES.length * cardW + (FEATURES.length - 1) * gap;
  const x0 = Math.round((vw - gridW) / 2);
  return (
    <view style={{ width: "stretch", height: 540, direction: "column", align: "center", justify: "center" }}>
      <view style={{ absolute: { x: x0, y: 120 }, width: gridW, direction: "row", gap }}>
        {FEATURES.map((f) => (
          <view key={f.title} glass={CARD_GLASS} style={{ width: cardW, height: 300, shrink: 0, radius: 22, cornerSmoothing: 0.6, direction: "column", padding: 28, gap: 12, justify: "end" }}>
            <view style={{ width: 44, height: 44, radius: 13, cornerSmoothing: 0.6, background: f.color }} />
            <text role="heading" level={3} style={{ fontSize: 22, fontWeight: 800, color: INK }}>{f.title}</text>
            <text style={{ fontSize: 15, fontWeight: 500, color: SLATE }}>{f.body}</text>
          </view>
        ))}
      </view>
    </view>
  );
}

function Footer({ vw }: { vw: number }) {
  return (
    <view style={{ width: "stretch", height: 200, direction: "column", align: "center", justify: "center", gap: 10 }}>
      <text style={{ fontSize: 16, fontWeight: 700, color: SLATE }}>Real React · a custom reconciler · WebGPU · an invisible, accessible DOM</text>
      <text style={{ fontSize: 13, color: FAINT }}>This page is built in Kussetsu — every pixel is WGSL output on one canvas.</text>
      <view style={{ direction: "row", gap: 8, align: "center" }}>
        <NavLink label="GitHub" onActivate={goRepo} />
        <NavLink label="Live demo" onActivate={goDemo} />
      </view>
    </view>
  );
}

export function MarketingPage() {
  const [, force] = useState(0);
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => { setT(now / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const onResize = () => force((x) => x + 1);
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 860;
  // Static sections memoized so the per-frame tick only reconciles the gliding pane.
  const hero = useMemo(() => <Hero vw={vw} vh={vh} />, [vw, vh]);
  const features = useMemo(() => <Features vw={vw} />, [vw]);
  const footer = useMemo(() => <Footer vw={vw} />, [vw]);
  const nav = useMemo(() => <Nav vw={vw} />, [vw]);
  return (
    <view style={{ width: vw, height: vh }}>
      {/* transparent — the colored-lights backdrop shows through and the glass refracts it */}
      <view style={{ width: vw, height: vh, overflow: "scroll", direction: "column" }}>
        {hero}
        <PaneSection vw={vw} t={t} />
        {features}
        {footer}
      </view>
      {nav}
    </view>
  );
}
