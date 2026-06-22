import { useEffect, useState } from "react";
import type { MaterialSpec, RGBA } from "../core/scene";

// "Beyond CSS" gallery — a showcase of the shader-material primitive (props.material):
// each tile's fill is a custom WGSL fragment shader. Self-generating materials (aurora,
// plasma, holographic) make their own pixels; backdrop materials (ripple, loupe) SAMPLE
// the live scene behind them and bend it — the thing CSS backdrop-filter can't do. Move
// your cursor: the holographic tile shifts, the loupe magnifies, the ripple radiates.
// Every shader is ~10-20 lines; the renderer just runs them. Route: ?fx

const WHITE: RGBA = [0.97, 0.98, 1, 1];
const INK: RGBA = [0.04, 0.05, 0.1, 1];

// ── the materials (WGSL fragment shaders). Each defines `fn material(uv, px) -> vec4f`
//    and may read u.res.w (time), u.ptr.xy (pointer px), u.rect, and sampleBackdrop(px). ──

export const AURORA = `
fn material(uv: vec2f, px: vec2f) -> vec4f {
  let t = u.res.w;
  let p = uv * vec2f(3.0, 2.2);
  let n = fbm(p + vec2f(t * 0.14, t * 0.08));
  let n2 = fbm(p * 1.7 - vec2f(t * 0.1, 0.0));
  let band = smoothstep(0.15, 0.85, n + (1.0 - uv.y) * 0.5);
  var col = hsv2rgb(vec3f(0.46 + 0.22 * n2, 0.75, 0.95)) * band;
  col += hsv2rgb(vec3f(0.82, 0.6, 1.0)) * smoothstep(0.6, 1.0, n2) * band * 0.6;
  col += vec3f(0.02, 0.03, 0.08);
  return vec4f(col, 1.0);
}`;

export const PLASMA = `
fn material(uv: vec2f, px: vec2f) -> vec4f {
  let t = u.res.w;
  let p = uv * 6.0;
  var v = sin(p.x * 1.3 + t);
  v += sin(p.y * 0.9 + t * 1.3);
  v += sin((p.x + p.y) * 0.7 + t * 0.8);
  v += sin(length(uv - 0.5) * 9.0 - t * 2.0);
  let col = hsv2rgb(vec3f(0.58 + 0.42 * sin(v * 1.3), 0.7, 0.98));
  return vec4f(col, 1.0);
}`;

export const HOLOGRAPHIC = `
fn material(uv: vec2f, px: vec2f) -> vec4f {
  let center = u.rect.xy + u.rect.zw * 0.5;
  // Cursor offset RELATIVE TO THIS TILE (normalised by its size, softly clamped) — the foil
  // tilts smoothly with the cursor like a real hologram, instead of racing the spectrum
  // because the offset was scaled in raw screen pixels.
  let tilt = clamp((u.ptr.xy - center) / max(u.rect.z, u.rect.w), vec2f(-1.2), vec2f(1.2));
  let g = (uv.x + uv.y) * 1.5 + (tilt.x + tilt.y) * 0.5 + u.res.w * 0.08;
  var col = hsv2rgb(vec3f(fract(g * 0.5), 0.5, 1.0));
  let sheen = 1.0 - smoothstep(0.0, 0.08, abs(fract(g) - 0.5));
  col += vec3f(1.0) * sheen * 0.3;
  col *= 0.6 + 0.4 * smoothstep(-0.2, 1.2, uv.y + length(tilt) * 0.3);
  return vec4f(col, 1.0);
}`;

export const RIPPLE = `
fn material(uv: vec2f, px: vec2f) -> vec4f {
  let t = u.res.w;
  let d = distance(px, u.ptr.xy);
  let wave = sin(d * 0.09 - t * 5.0) * exp(-d * 0.006);
  let dir = normalize(px - u.ptr.xy + vec2f(0.001, 0.001));
  let amb = (fbm(px * 0.025 + vec2f(0.0, t * 0.5)) - 0.5);
  let c = sampleBackdrop(px + dir * wave * 20.0 + vec2f(amb * 6.0));
  return vec4f(c.rgb + vec3f(wave * 0.15), 1.0);
}`;

export const LOUPE = `
fn material(uv: vec2f, px: vec2f) -> vec4f {
  let R = 96.0;
  let d = distance(px, u.ptr.xy);
  var samplePx = px;
  let k = smoothstep(R, 0.0, d);
  let toC = px - u.ptr.xy;
  samplePx = u.ptr.xy + toC / mix(1.0, 2.1, k); // magnify toward the cursor
  let edge = smoothstep(R + 1.0, R - 1.0, d);
  let rim = smoothstep(R - 10.0, R, d) * smoothstep(R + 2.0, R - 2.0, d);
  let c = sampleBackdrop(samplePx);
  let bg = sampleBackdrop(px);
  let col = mix(bg.rgb, c.rgb + vec3f(rim * 0.4), edge);
  return vec4f(col, 1.0);
}`;

interface Tile { name: string; note: string; spec?: MaterialSpec; glass?: boolean; }
const TILES: Tile[] = [
  { name: "Aurora", note: "procedural · animated", spec: { shader: AURORA, animated: true } },
  { name: "Plasma", note: "procedural · animated", spec: { shader: PLASMA, animated: true } },
  { name: "Holographic", note: "follows your cursor", spec: { shader: HOLOGRAPHIC, animated: true } },
  { name: "Ripple", note: "bends the live backdrop", spec: { shader: RIPPLE, animated: true, backdrop: true } },
  { name: "Loupe", note: "magnifies under cursor", spec: { shader: LOUPE, backdrop: true } },
  { name: "Glass", note: "refraction + dispersion", glass: true },
];

const BANDS: { word: string; sub: string; color: RGBA }[] = [
  { word: "OWN THE PIXELS", sub: "every pixel is WGSL", color: [0.36, 0.4, 0.95, 1] },
  { word: "SHADERS AS MATERIALS", sub: "fn material(uv, px) -> vec4f", color: [0.1, 0.72, 0.66, 1] },
  { word: "SAMPLE THE LIVE SCENE", sub: "ripple · loupe · heat-haze", color: [0.96, 0.45, 0.2, 1] },
  { word: "BEYOND CSS", sub: "backdrop-filter could never", color: [0.86, 0.32, 0.56, 1] },
];

const TILE_W = 240, TILE_H = 176, GAP = 22, COLS = 3;

export function FxGallery() {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = () => tick((t) => t + 1);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const gridW = COLS * TILE_W + (COLS - 1) * GAP;
  const rows = Math.ceil(TILES.length / COLS);
  const gridH = rows * TILE_H + (rows - 1) * GAP;

  return (
    <view style={{ width: vw, height: vh, background: INK }}>
      {/* the colorful backdrop the sampling materials bend (plain rects + text) */}
      <view style={{ absolute: { x: 0, y: 0 }, width: vw, height: vh, direction: "column" }}>
        {BANDS.map((b, i) => (
          <view key={i} style={{ width: "stretch", grow: 1, background: b.color, direction: "column", justify: "center", padding: 40, gap: 6, overflow: "hidden" }}>
            {/* repeated full-width so the ripple/loupe always have detail to bend */}
            <text style={{ fontSize: 40, fontWeight: 800, color: INK }}>{(b.word + "   ").repeat(6)}</text>
            <text style={{ fontSize: 18, fontWeight: 600, color: [0.04, 0.05, 0.1, 0.7] }}>{b.sub}</text>
          </view>
        ))}
      </view>

      {/* the tile grid — each tile's fill is a custom shader (or glass) */}
      <view style={{ absolute: { x: Math.round((vw - gridW) / 2), y: Math.round((vh - gridH) / 2) }, width: gridW, direction: "row", wrap: true, gap: GAP }}>
        {TILES.map((t) => {
          const inner = (
            <view style={{ grow: 1, width: "stretch", direction: "column", justify: "end", padding: 14, gap: 2 }}>
              <text style={{ fontSize: 17, fontWeight: 800, color: WHITE }}>{t.name}</text>
              <text style={{ fontSize: 12, fontWeight: 600, color: [0.85, 0.88, 0.98, 0.85] }}>{t.note}</text>
            </view>
          );
          const style = { width: TILE_W, height: TILE_H, shrink: 0, radius: 18, direction: "column" } as const;
          return t.glass ? (
            <view key={t.name} glass={{ refraction: 0.13, dispersion: 0.07, blur: 4, tint: 0.05, rim: 16 }} style={style}>{inner}</view>
          ) : (
            <view key={t.name} material={t.spec} style={style}>{inner}</view>
          );
        })}
      </view>
    </view>
  );
}
