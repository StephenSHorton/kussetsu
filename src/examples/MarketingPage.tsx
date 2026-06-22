import { useEffect, useMemo, useState } from "react";
import type { GlassSpec, RGBA } from "../core/scene";
import { glassTuning } from "../core/glassTuning";

// Kussetsu's marketing site, built IN Kussetsu — DARK: a black field lit by drifting colorful
// gradient lights (a full-screen WGSL background the glass actually REFRACTS), white type, and
// glass throughout: a fixed frosted nav, feature cards, and one empty pane that glides across
// so you watch the refraction track the light. Route "/" (the capability demo lives at ?demo).

const REPO = "https://github.com/StephenSHorton/kussetsu";
const NAV_H = 66;
const MAXW = 1000; // content max-width — keeps the nav + sections contained, not edge-to-edge
const EDGE = 24; // gutter from the viewport edges

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
// Dark-tinted glass for the code card: resolves dark in the body (code stays readable over the
// moving lamp) while the rim still refracts + disperses the light — frosted-dark glass.
const CODE_GLASS: GlassSpec = { refraction: 0.05, blur: 0, tint: 0.62, tintColor: [0.05, 0.06, 0.13, 1], rim: 13, specular: 0.08, dispersion: 0.05 };

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

// A rotating glass CUBE, ray-traced inside the fragment shader: ray-box intersection, refraction
// through the front+back faces (so it bends the live backdrop = hero + lamp), Fresnel edges,
// chromatic dispersion. Self-contained in one material quad. `backdrop: true` so it can sample
// the scene behind it; `animated: true` for the spin.
export const GLASS_CUBE = `
fn sdRB(p: vec3f, b: f32, r: f32) -> f32 { // rounded-box distance field (soft corners + edges)
  let q = abs(p) - vec3f(b) + vec3f(r);
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
fn nrm(p: vec3f, b: f32, r: f32) -> vec3f {
  let e = vec2f(0.0015, 0.0);
  return normalize(vec3f(
    sdRB(p + e.xyy, b, r) - sdRB(p - e.xyy, b, r),
    sdRB(p + e.yxy, b, r) - sdRB(p - e.yxy, b, r),
    sdRB(p + e.yyx, b, r) - sdRB(p - e.yyx, b, r)));
}
fn rotM(a: f32, c: f32) -> mat3x3<f32> {
  let ca = cos(a); let sa = sin(a); let cb = cos(c); let sb = sin(c);
  return mat3x3<f32>(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca) * mat3x3<f32>(1.0, 0.0, 0.0, 0.0, cb, sb, 0.0, -sb, cb);
}
fn sampleRGB(b: vec2f, d: vec2f) -> vec3f { // dispersion: R/G/B split across the refraction offset
  return vec3f(sampleBackdrop(b + d).r, sampleBackdrop(b).g, sampleBackdrop(b - d).b);
}
fn material(uv: vec2f, px: vec2f) -> vec4f {
  let t = u.res.w * 0.35;
  let q = (uv - 0.5) * 2.15;
  let ro0 = vec3f(q, 2.0);
  let rd0 = vec3f(0.0, 0.0, -1.0);
  let R = rotM(t, t * 0.6);
  let Ri = transpose(R);
  let ro = Ri * ro0;
  let rd = Ri * rd0;
  let B = 0.55; let RAD = 0.20; // half-size + corner radius (well-rounded)
  // raymarch to the front surface
  var tt = 0.0; var hit = false;
  for (var i = 0; i < 48; i = i + 1) {
    let d = sdRB(ro + rd * tt, B, RAD);
    if (d < 0.0008) { hit = true; break; }
    tt = tt + d;
    if (tt > 5.0) { break; }
  }
  if (!hit) { return vec4f(0.0); } // miss → fully transparent
  let p1 = ro + rd * tt;
  let n1 = nrm(p1, B, RAD);
  let rd2 = refract(rd, n1, 1.0 / 1.5);
  // march through the glass to the back surface
  var ti = 0.02;
  for (var i = 0; i < 30; i = i + 1) {
    let d = sdRB(p1 + rd2 * ti, B, RAD);
    if (d > -0.0008) { break; }
    ti = ti + max(-d, 0.012);
    if (ti > 5.0) { break; }
  }
  let p2 = p1 + rd2 * ti;
  let n2 = nrm(p2, B, RAD);
  var dir = refract(rd2, -n2, 1.5);
  if (dot(dir, dir) < 0.01) { dir = reflect(rd2, -n2); } // total internal reflection
  let dv = R * dir;
  // Glass params: baked defaults, or driven LIVE by the tuning panel when it's enabled (u.c0.x).
  // c0=(enabled, refraction, dispersion, tint) c1=(specular, rim, brighten, blur) c2=tintColor.
  let on = u.c0.x > 0.5;
  let strength = u.rect.z * select(0.3, u.c0.y * 3.0, on);
  let dispF = select(0.05, u.c0.z, on);
  let tintA = select(0.05, u.c0.w, on);
  let tintC = select(vec3f(0.72, 0.82, 1.0), u.c2.xyz, on);
  let glintI = select(0.7, u.c1.x * 5.0, on);
  let fresI = select(0.5, u.c1.y / 32.0, on);
  let brite = select(1.04, u.c1.z, on);
  let blurPx = select(0.0, u.c1.w, on);
  let base = px + dv.xy * strength;
  let dsp = dv.xy * strength * dispF;
  var col = sampleRGB(base, dsp);
  if (blurPx > 0.1) { // backdrop blur — average a few taps around the refracted sample
    col += sampleRGB(base + vec2f(blurPx, 0.0), dsp) + sampleRGB(base - vec2f(blurPx, 0.0), dsp)
         + sampleRGB(base + vec2f(0.0, blurPx), dsp) + sampleRGB(base - vec2f(0.0, blurPx), dsp);
    col = col / 5.0;
  }
  col = mix(col, tintC, tintA) * brite;
  let nv = R * n1;
  let fres = pow(1.0 - max(0.0, nv.z), 4.0);
  col += vec3f(0.6, 0.78, 1.0) * fres * fresI; // glowing rounded edges (rim)
  let L = normalize(vec3f(-0.4, 0.7, 0.6));
  col += vec3f(1.0) * pow(max(0.0, dot(reflect(rd0, nv), L)), 28.0) * glintI; // specular glint
  return vec4f(col, 1.0);
}`;

// Live uniforms for the cube — resolved every frame so the glass panel drives it too.
// Packed: c0=(enabled, refraction, dispersion, tint) c1=(specular, rim, brighten, blur) c2=tintColor.
function cubeUniforms(): number[] {
  const p = glassTuning.params;
  return [glassTuning.enabled ? 1 : 0, p.refraction, p.dispersion, p.tint, p.specular, p.rim, p.brighten, p.blur, p.tintColor[0], p.tintColor[1], p.tintColor[2], 0];
}

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
  const w = Math.min(MAXW, vw - EDGE * 2);
  return (
    <view glass={NAV_GLASS} style={{ absolute: { x: Math.round((vw - w) / 2), y: EDGE }, width: w, height: NAV_H, radius: 18, cornerSmoothing: 0.7, direction: "row", align: "center", padding: 20, gap: 4 }}>
      <view style={{ direction: "row", align: "center", gap: 9 }}>
        <text style={{ fontSize: 21, fontWeight: 800, color: INK }}>Kussetsu</text>
        <text style={{ fontSize: 18, fontWeight: 500, color: SLATE }}>屈折</text>
      </view>
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
  const h = Math.max(860, vh);
  const cube = Math.min(600, vw * 0.6);
  const cx = vw / 2;
  const cubeY = 64;
  const cubeMid = cubeY + cube / 2;
  return (
    <view style={{ width: "stretch", height: h }}>
      {/* one big word, wider than the cube so its ends read while the cube refracts the centre */}
      <view style={{ absolute: { x: 0, y: Math.round(cubeMid - 142) }, width: vw, direction: "row", justify: "center" }}>
        <text role="heading" level={1} style={{ fontSize: 240, fontWeight: 800, letterSpacing: 22, color: INK }}>GLASS</text>
      </view>
      {/* a rotating rounded glass cube ray-traced in a shader — overlaps & refracts the headline */}
      <view material={{ shader: GLASS_CUBE, backdrop: true, animated: true, uniforms: cubeUniforms }} style={{ absolute: { x: Math.round(cx - cube / 2), y: cubeY }, width: cube, height: cube }} />
      {/* subhead + CTAs */}
      <view style={{ absolute: { x: 0, y: Math.round(cubeY + cube + 28) }, width: vw, direction: "row", justify: "center" }}>
        <view style={{ width: Math.min(640, vw - 80), direction: "column", align: "center", gap: 24 }}>
          <text style={{ fontSize: 19, fontWeight: 500, color: SLATE }}>Kussetsu renders your React with WebGPU — refraction, shaders, real spring physics — while the DOM stays a clean, invisible layer for accessibility. Glass bending live light, the way CSS never could.</text>
          <view style={{ direction: "row", gap: 14, align: "center" }}>
            <PillButton label="Get started" fill={ACCENT} onActivate={goRepo} />
            <PillButton label="See the live demo" glass onActivate={goDemo} />
          </view>
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
  const cardW = 300, gap = 24;
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

// Syntax-coloured code, rendered as rows of tinted <text> spans (the painter lays inline
// multi-colour text tight via charAdvance). Colours read on the dark glass card.
type CodeKind = "kw" | "str" | "tag" | "fn" | "attr" | "num";
type CodeSeg = { text: string; kind?: CodeKind };
const CODE_BASE: RGBA = [0.74, 0.78, 0.9, 1];
const CODE_COLOR: Record<CodeKind, RGBA> = {
  kw: [0.82, 0.66, 1, 1],
  str: [0.55, 0.86, 0.62, 1],
  tag: [0.5, 0.8, 1, 1],
  fn: [0.98, 0.82, 0.5, 1],
  attr: [0.66, 0.72, 0.88, 1],
  num: [0.96, 0.62, 0.52, 1],
};
// The real API: createGpuRoot(canvas) → root.render(<App/>), authored in <view>/<text>.
const GET_STARTED_CODE: CodeSeg[][] = [
  [{ text: "import ", kind: "kw" }, { text: "{ " }, { text: "createGpuRoot", kind: "fn" }, { text: " } " }, { text: "from ", kind: "kw" }, { text: "\"kussetsu\"", kind: "str" }, { text: ";" }],
  [],
  [{ text: "function ", kind: "kw" }, { text: "App", kind: "fn" }, { text: "() {" }],
  [{ text: "  return ", kind: "kw" }, { text: "(" }],
  [{ text: "    " }, { text: "<view ", kind: "tag" }, { text: "glass", kind: "attr" }, { text: "={{ refraction: " }, { text: "0.1", kind: "num" }, { text: ", dispersion: " }, { text: "0.07", kind: "num" }, { text: " }}" }],
  [{ text: "      " }, { text: "style", kind: "attr" }, { text: "={{ padding: " }, { text: "28", kind: "num" }, { text: ", radius: " }, { text: "22", kind: "num" }, { text: ", gap: " }, { text: "10", kind: "num" }, { text: " }}>" }],
  [{ text: "      " }, { text: "<text ", kind: "tag" }, { text: "style", kind: "attr" }, { text: "={{ fontWeight: " }, { text: "800", kind: "num" }, { text: " }}>" }, { text: "Hello, light.", kind: "str" }, { text: "</text>", kind: "tag" }],
  [{ text: "    " }, { text: "</view>", kind: "tag" }],
  [{ text: "  );" }],
  [{ text: "}" }],
  [],
  [{ text: "const ", kind: "kw" }, { text: "root = " }, { text: "await ", kind: "kw" }, { text: "createGpuRoot", kind: "fn" }, { text: "(canvas);" }],
  [{ text: "root.", }, { text: "render", kind: "fn" }, { text: "(" }, { text: "<App />", kind: "tag" }, { text: ");" }],
];

function GetStarted({ vw }: { vw: number }) {
  const cardW = Math.min(560, vw - EDGE * 2);
  return (
    <view style={{ width: "stretch", height: 760, direction: "column", align: "center", justify: "center", gap: 28 }}>
      <view style={{ width: Math.min(660, vw - EDGE * 2), direction: "column", align: "center", gap: 14 }}>
        <text role="heading" level={2} style={{ fontSize: 44, fontWeight: 800, color: INK }}>Drop it in. Own every pixel.</text>
        <text style={{ maxWidth: 600, fontSize: 18, fontWeight: 500, color: SLATE }}>{`Your real React, painted on WebGPU — hand it a canvas and render the same <view>/<text> you'd write anywhere. Refraction CSS has no syntax for, with the DOM kept invisible for accessibility.`}</text>
      </view>
      {/* install pill */}
      <view glass={CARD_GLASS} style={{ direction: "row", align: "center", gap: 11, padding: 16, radius: 12, cornerSmoothing: 0.6 }}>
        <text style={{ fontSize: 15, fontWeight: 700, color: FAINT }}>$</text>
        <text style={{ fontSize: 15, fontWeight: 700, color: INK }}>npm i kussetsu</text>
      </view>
      {/* dark glass code card — readable, but the rim still refracts the lamp */}
      <view glass={CODE_GLASS} style={{ width: cardW, direction: "column", gap: 2, padding: 26, radius: 20, cornerSmoothing: 0.7 }}>
        {GET_STARTED_CODE.map((line, i) => (
          <view key={i} style={{ direction: "row" }}>
            {line.length === 0 ? (
              <text style={{ fontSize: 14, color: CODE_BASE }}>{" "}</text>
            ) : (
              line.map((seg, j) => (
                <text key={j} style={{ fontSize: 14, fontWeight: 500, color: seg.kind ? CODE_COLOR[seg.kind] : CODE_BASE }}>{seg.text}</text>
              ))
            )}
          </view>
        ))}
      </view>
      {/* CTAs — the Hero pairing */}
      <view style={{ direction: "row", gap: 14, align: "center" }}>
        <PillButton label="Get started" fill={ACCENT} onActivate={goRepo} />
        <PillButton label="See the live demo" glass onActivate={goDemo} />
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
  const getStarted = useMemo(() => <GetStarted vw={vw} />, [vw]);
  const footer = useMemo(() => <Footer vw={vw} />, [vw]);
  const nav = useMemo(() => <Nav vw={vw} />, [vw]);
  return (
    <view style={{ width: vw, height: vh }}>
      {/* transparent — the colored-lights backdrop shows through and the glass refracts it */}
      <view style={{ width: vw, height: vh, overflow: "scroll", direction: "column" }}>
        {hero}
        <PaneSection vw={vw} t={t} />
        {features}
        {getStarted}
        {footer}
      </view>
      {nav}
    </view>
  );
}
