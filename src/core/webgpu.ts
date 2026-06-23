// WebGPU 2D painter. TWO passes now:
//   1) render all non-glass content (rects + text) to an offscreen BACKDROP texture
//   2) blit the backdrop to the canvas, then draw glass panels that SAMPLE the
//      backdrop with refraction/blur/rim — i.e. glass refracts whatever is behind
//      it, anywhere on screen, because we own the whole framebuffer.
import type { RGBA } from "./scene";
import { charAdvance } from "./text";

export type ClipRect = [number, number, number, number]; // x,y,w,h screen px; w<=0 => no clip

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  smoothing?: number; // 0 round … 1 squircle (superellipse corners)
  color: RGBA;
  borderWidth?: number; // stroke width (screen px); 0/undefined = no border
  borderColor?: RGBA; // stroke color (packed as unorm8x4 into the rect's spare instance slot)
  clip?: ClipRect;
}

// A group-opacity batch: a subtree lifted to render offscreen, then composited at `opacity`.
// rects/texts are screen-px (camera applied), rendered at FULL alpha into the scratch texture so
// overlapping children composite correctly; `opacity` is applied once at the composite.
export interface OpacityGroup {
  opacity: number; // 0..1
  rects: Rect[];
  texts: TextItem[];
}

// An overlay layer (style.zIndex): a z-lifted subtree painted ABOVE all normal content, sorted by
// zIndex. Carries its own shadows/rects/images/texts (all SCREEN px — collectOverlays applies the camera).
export interface Overlay {
  zIndex: number;
  shadows: ShadowItem[];
  rects: Rect[];
  images: ImageItem[];
  texts: TextItem[];
}

// A drop shadow instance — all coords/lengths in SCREEN px (collectShadows applies the camera).
export interface ShadowItem {
  x: number; // node box (screen px)
  y: number;
  w: number;
  h: number;
  ox: number; // shadow offset
  oy: number;
  blur: number; // blur radius (>= 0)
  spread: number; // grow/shrink the box before blur
  radius: number; // node corner radius
  color: RGBA;
  clip?: ClipRect;
}

// An image instance — box in SCREEN px (collectImages applies the camera). The painter loads +
// caches the texture per `src`; `fit` controls how it fills the box; clipped to `radius` + `clip`.
export interface ImageItem {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number; // corner radius (screen px)
  smoothing: number; // 0 round … 1 squircle (style.cornerSmoothing)
  src: string; // texture cache key
  fit: "cover" | "contain" | "fill";
  clip?: ClipRect;
}

interface ImageEntry {
  tex: GPUTexture | null;
  bindGroup: GPUBindGroup | null;
  aspect: number;
  loading: boolean;
  failed: boolean; // a broken/non-CORS/decode-failed src: don't re-fetch every frame
  tick: number; // last frame used (LRU)
}
const IMAGE_CACHE_MAX = 64; // evict least-recently-used image textures beyond this (bounds VRAM)

export interface TextItem {
  x: number;
  y: number;
  text: string;
  size: number;
  weight: number;
  color: RGBA;
  clip?: ClipRect;
  tracking?: number; // letter-spacing in display px (added after each glyph)
}

export interface GlassPanel {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  refraction: number; // fraction of panel size the rim bends the backdrop
  blur: number; // backdrop blur radius, CSS px
  tint: number; // 0..1 mix toward tintColor
  tintColor: RGBA;
  rim: number; // rim band width, CSS px
  brighten: number; // overall lightening (1 = none)
  specular: number; // highlight/glint intensity (0 = none)
  dispersion: number; // chromatic split at the rim (0 = none) — the colorful edge
  background: RGBA; // style.background, over-composited at its alpha to occlude the backdrop ([0,0,0,0] = pure glass)
}

// A node filled by a CUSTOM WGSL fragment shader (props.material). The shader source
// defines `fn material(uv, px) -> vec4f` and is wrapped in MATERIAL_HEAD/TAIL below.
export interface MaterialPanel {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  shader: string;
  uniforms: number[]; // up to 16 floats → u.c0..u.c3
  backdrop: boolean;
  animated: boolean;
}

// A batch of particles to draw (built by the runtime's CPU simulation each frame).
export interface ParticleBatch {
  data: Float32Array; // [x,y,size,_][r,g,b,a] per particle, WORLD coords
  count: number;
}

// Optional per-frame extras: animation time + pointer (for shader materials), a particle
// batch, and a post-process effect over the whole composited scene.
export interface FrameInfo {
  time: number;
  pointer: [number, number];
  particles?: ParticleBatch;
  // Post-process effect masked to a SCREEN-px box (rect), so only that region is affected.
  post?: { effect: "bloom"; rect: [number, number, number, number] } | null;
  // Page scroll (px) handed to the background shader as u.c0.x, so it can scroll with content.
  bgScroll?: number;
}

// Glyph atlas: instanced per-glyph quads sampling a packed alpha atlas, tinted by
// a per-instance color. Crisp + reuses each glyph once (vs a texture per string).
const GLYPH_WGSL = /* wgsl */ `
struct VP { size: vec2f };
@group(0) @binding(0) var<uniform> vp: VP;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var atlas: texture_2d<f32>;
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f, @location(2) screenPos: vec2f, @location(3) clip: vec4f };
const Q = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) rect: vec4f, @location(1) uv: vec4f, @location(2) color: vec4f, @location(3) clip: vec4f) -> VSOut {
  let q = Q[vi];
  let px = rect.xy + q*rect.zw;
  let ndc = vec2f(px.x/vp.size.x*2.0-1.0, -(px.y/vp.size.y*2.0-1.0));
  var o: VSOut;
  o.pos = vec4f(ndc,0,1);
  o.uv = vec2f(mix(uv.x, uv.z, q.x), mix(uv.y, uv.w, q.y));
  o.color = color; o.screenPos = px; o.clip = clip;
  return o;
}
fn clipAlpha(p: vec2f, clip: vec4f) -> f32 {
  if (clip.z <= 0.0) { return 1.0; }
  let x1 = clip.x + clip.z; let y1 = clip.y + clip.w;
  let ax = smoothstep(clip.x - 0.5, clip.x + 0.5, p.x) * (1.0 - smoothstep(x1 - 0.5, x1 + 0.5, p.x));
  let ay = smoothstep(clip.y - 0.5, clip.y + 0.5, p.y) * (1.0 - smoothstep(y1 - 0.5, y1 + 0.5, p.y));
  return ax * ay;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  // The atlas stores a single-channel signed distance field (0.5 = glyph edge), so coverage is
  // recovered with a screen-space-derivative smoothstep — crisp at ANY zoom (the SDF interpolates
  // linearly; fwidth narrows the AA band as you zoom in, widens it as you zoom out). fwidth() is
  // called in uniform control flow here (top of fs), so it's always well-defined.
  let d = textureSample(atlas, samp, in.uv).r;
  let aa = max(fwidth(d), 1e-4);
  let cov = smoothstep(0.5 - aa, 0.5 + aa, d);
  let a = cov * in.color.a * clipAlpha(in.screenPos, in.clip);
  return vec4f(in.color.rgb * a, a);
}
`;

// Image quad: a textured rounded rect. Instances are SCREEN px (collectImages applies the camera);
// the texture is premultiplied (uploaded with premultipliedAlpha), so the fragment just scales it by
// coverage (rounded-rect SDF) × clip × fit-mask. `fit` remaps the 0..1 quad UV using the image vs box
// aspect: cover crops, contain letterboxes, fill stretches.
const IMAGE_WGSL = /* wgsl */ `
struct VP { size: vec2f };
@group(0) @binding(0) var<uniform> vp: VP;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f, @location(1) half: vec2f, @location(2) radius: f32, @location(3) smoothing: f32,
  @location(4) screenPos: vec2f, @location(5) clip: vec4f, @location(6) q: vec2f, @location(7) imgAspect: f32, @location(8) fitMode: f32,
};
const QUAD = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) rect: vec4f, @location(1) clip: vec4f, @location(2) params: vec4f) -> VSOut {
  let q = QUAD[vi];
  let px = rect.xy + q*rect.zw;
  let ndc = vec2f(px.x/vp.size.x*2.0-1.0, -(px.y/vp.size.y*2.0-1.0));
  var o: VSOut;
  o.pos = vec4f(ndc,0,1); o.local = (q-0.5)*rect.zw; o.half = rect.zw*0.5;
  o.radius = min(params.x, min(o.half.x, o.half.y)); o.smoothing = params.y;
  o.screenPos = px; o.clip = clip; o.q = q; o.imgAspect = params.z; o.fitMode = params.w;
  return o;
}
fn sdSuperellipse(p: vec2f, b: vec2f, r: f32, n: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  let m = max(q, vec2f(0.0));
  return min(max(q.x, q.y), 0.0) + pow(pow(m.x, n) + pow(m.y, n), 1.0 / n) - r;
}
fn clipAlpha(p: vec2f, clip: vec4f) -> f32 {
  if (clip.z <= 0.0) { return 1.0; }
  let x1 = clip.x + clip.z; let y1 = clip.y + clip.w;
  let ax = smoothstep(clip.x - 0.5, clip.x + 0.5, p.x) * (1.0 - smoothstep(x1 - 0.5, x1 + 0.5, p.x));
  let ay = smoothstep(clip.y - 0.5, clip.y + 0.5, p.y) * (1.0 - smoothstep(y1 - 0.5, y1 + 0.5, p.y));
  return ax * ay;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let boxAspect = in.half.x / in.half.y; // w/h
  var uv = in.q;          // fill (fitMode 0): stretch
  var mask = 1.0;
  var s = vec2f(1.0, 1.0);
  if (in.fitMode > 0.5 && in.fitMode < 1.5) {          // cover — fill the box, crop overflow
    if (in.imgAspect > boxAspect) { s.x = boxAspect / in.imgAspect; } else { s.y = in.imgAspect / boxAspect; }
    uv = (in.q - 0.5) * s + 0.5;
  } else if (in.fitMode >= 1.5) {                       // contain — whole image, letterbox the rest
    if (in.imgAspect > boxAspect) { s.y = boxAspect / in.imgAspect; } else { s.x = in.imgAspect / boxAspect; }
    uv = (in.q - 0.5) / s + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { mask = 0.0; }
  }
  let n = 2.0 + in.smoothing * 3.0;
  let d = sdSuperellipse(in.local, in.half, in.radius, n);
  let aa = fwidth(d);
  let shape = 1.0 - smoothstep(-aa, aa, d);
  let col = textureSample(tex, samp, clamp(uv, vec2f(0.0), vec2f(1.0))); // premultiplied
  let cov = shape * mask * clipAlpha(in.screenPos, in.clip);
  return vec4f(col.rgb * cov, col.a * cov);
}
`;

const PREMUL_BLEND: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

const RECT_WGSL = /* wgsl */ `
// sizePad.xy = viewport CSS px; cam.xy = translate, cam.z = scale.
// Rect instances are WORLD coords; the camera maps world -> screen here, so 10k
// static nodes upload once and pan/zoom only touches this uniform.
struct VP { sizePad: vec4f, cam: vec4f };
@group(0) @binding(0) var<uniform> vp: VP;
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f, @location(1) half: vec2f, @location(2) radius: f32, @location(3) color: vec4f,
  @location(4) screenPos: vec2f, @location(5) clip: vec4f, @location(6) smoothing: f32,
  @location(7) borderW: f32, @location(8) borderCol: vec4f,
};
const QUAD = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) rect: vec4f, @location(1) rad: vec3f, @location(2) color: vec4f, @location(3) clip: vec4f, @location(4) borderCol: vec4f) -> VSOut {
  let q = QUAD[vi];
  let worldPx = rect.xy + q * rect.zw;
  let screenPx = worldPx * vp.cam.z + vp.cam.xy;
  let size = vp.sizePad.xy;
  let ndc = vec2f(screenPx.x/size.x*2.0-1.0, -(screenPx.y/size.y*2.0-1.0));
  var o: VSOut;
  o.pos = vec4f(ndc,0,1); o.local = (q-0.5)*rect.zw; o.half = rect.zw*0.5;
  o.radius = min(rad.x, min(o.half.x, o.half.y)); o.color = color;
  o.smoothing = rad.y; o.borderW = rad.z; o.borderCol = borderCol;
  o.screenPos = screenPx; o.clip = clip;
  return o;
}
fn sdRoundBox(p: vec2f, b: vec2f, r: f32) -> f32 { let q = abs(p)-b+vec2f(r); return length(max(q,vec2f(0.0)))+min(max(q.x,q.y),0.0)-r; }
// Superellipse (squircle) corner: n=2 == round box; higher n == Apple-style continuous corners.
fn sdSuperellipse(p: vec2f, b: vec2f, r: f32, n: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  let m = max(q, vec2f(0.0));
  return min(max(q.x, q.y), 0.0) + pow(pow(m.x, n) + pow(m.y, n), 1.0 / n) - r;
}
// Clip rect alpha (CSS px), ~1px AA. clip.z<=0 => no clip.
fn clipAlpha(p: vec2f, clip: vec4f) -> f32 {
  if (clip.z <= 0.0) { return 1.0; }
  let x1 = clip.x + clip.z; let y1 = clip.y + clip.w;
  let ax = smoothstep(clip.x - 0.5, clip.x + 0.5, p.x) * (1.0 - smoothstep(x1 - 0.5, x1 + 0.5, p.x));
  let ay = smoothstep(clip.y - 0.5, clip.y + 0.5, p.y) * (1.0 - smoothstep(y1 - 0.5, y1 + 0.5, p.y));
  return ax * ay;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let n = 2.0 + in.smoothing * 3.0; // 0 -> round (n=2), 1 -> squircle (n=5)
  let d = sdSuperellipse(in.local, in.half, in.radius, n);
  let aa = fwidth(d);
  let shape = 1.0 - smoothstep(-aa, aa, d);              // inside the outer edge
  // Floor a sub-pixel border to ~1px of AA width so a 1px hairline paints at FULL coverage (the two
  // smoothstep curves would otherwise overlap and dim it). step() keeps borderW==0 at 0 (no fill loss).
  let bw = max(in.borderW, aa * step(0.001, in.borderW));
  let inner = 1.0 - smoothstep(-aa, aa, d + bw);         // inside the inner edge — border peels off the rim
  let ring = clamp(shape - inner, 0.0, 1.0);             // the border band (0 when borderW == 0)
  let clip = clipAlpha(in.screenPos, in.clip);
  let fillA = in.color.a * inner;
  let borderA = in.borderCol.a * ring;
  // fill (inner) and border (ring) are spatially disjoint, so premultiplied colors just add.
  let rgb = in.color.rgb * fillA + in.borderCol.rgb * borderA;
  return vec4f(rgb * clip, (fillA + borderA) * clip);
}
`;

// Drop shadow: one analytic gaussian-blurred rounded rectangle, drawn behind the content.
// No multi-pass blur — the X dimension is integrated analytically (erf), the Y dimension with a
// few samples (Evan Wallace's "Fast Rounded Rectangle Shadows"). Instances are SCREEN px
// (collectShadows applies the camera), so the VS only maps screen px -> NDC.
const SHADOW_WGSL = /* wgsl */ `
struct VP { sizePad: vec4f, cam: vec4f };
@group(0) @binding(0) var<uniform> vp: VP;
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) frag: vec2f,   // screen px
  @location(1) lo: vec2f,     // shadow box lower (screen px)
  @location(2) hi: vec2f,     // shadow box upper (screen px)
  @location(3) sigma: f32,
  @location(4) corner: f32,
  @location(5) color: vec4f,
  @location(6) clip: vec4f,
};
const QUAD = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) box: vec4f, @location(1) sh: vec4f, @location(2) color: vec4f, @location(3) clip: vec4f, @location(4) extra: vec4f) -> VSOut {
  let sigma = max(sh.z * 0.5, 0.0);                 // CSS blur -> gaussian sigma
  let lo = vec2f(box.x + sh.x - sh.w, box.y + sh.y - sh.w);            // box offset by (ox,oy), grown by spread
  let hi = vec2f(box.x + sh.x + box.z + sh.w, box.y + sh.y + box.w + sh.w);
  let margin = sigma * 3.0 + 1.0;                   // quad must cover the blur falloff
  let q = QUAD[vi];
  let p0 = lo - vec2f(margin) ;
  let span = (hi - lo) + vec2f(margin * 2.0);
  let screenPx = p0 + q * span;
  let size = vp.sizePad.xy;
  let ndc = vec2f(screenPx.x / size.x * 2.0 - 1.0, -(screenPx.y / size.y * 2.0 - 1.0));
  var o: VSOut;
  o.pos = vec4f(ndc, 0, 1);
  o.frag = screenPx;
  o.lo = lo; o.hi = hi;
  o.sigma = sigma;
  let half = (hi - lo) * 0.5;
  o.corner = clamp(extra.x + sh.w, 0.0, min(half.x, half.y));          // corner grows with spread
  o.color = color; o.clip = clip;
  return o;
}
fn erf2(x: vec2f) -> vec2f { let s = sign(x); let a = abs(x); var r = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a; r = r * r; return s - s / (r * r); }
fn gaussian(x: f32, sigma: f32) -> f32 { return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066282746310002 * sigma); }
fn boxShadowX(x: f32, y: f32, sigma: f32, corner: f32, halfSize: vec2f) -> f32 {
  let delta = min(halfSize.y - corner - abs(y), 0.0);
  let curved = halfSize.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  let integral = 0.5 + 0.5 * erf2((x + vec2f(-curved, curved)) * (0.7071067811865476 / sigma));
  return integral.y - integral.x;
}
fn roundedBoxShadow(lo: vec2f, hi: vec2f, p0: vec2f, sigma: f32, corner: f32) -> f32 {
  let center = (lo + hi) * 0.5;
  let halfSize = (hi - lo) * 0.5;
  let p = p0 - center;
  let low = p.y - halfSize.y; let high = p.y + halfSize.y;
  let start = clamp(-3.0 * sigma, low, high);
  let end = clamp(3.0 * sigma, low, high);
  let stepY = (end - start) / 4.0;
  var y = start + stepY * 0.5;
  var value = 0.0;
  for (var i = 0; i < 4; i++) { value += boxShadowX(p.x, p.y - y, sigma, corner, halfSize) * gaussian(y, sigma) * stepY; y += stepY; }
  return value;
}
fn sdRoundBox(p: vec2f, b: vec2f, r: f32) -> f32 { let q = abs(p) - b + vec2f(r); return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r; }
fn clipAlpha(p: vec2f, clip: vec4f) -> f32 {
  if (clip.z <= 0.0) { return 1.0; }
  let x1 = clip.x + clip.z; let y1 = clip.y + clip.w;
  let ax = smoothstep(clip.x - 0.5, clip.x + 0.5, p.x) * (1.0 - smoothstep(x1 - 0.5, x1 + 0.5, p.x));
  let ay = smoothstep(clip.y - 0.5, clip.y + 0.5, p.y) * (1.0 - smoothstep(y1 - 0.5, y1 + 0.5, p.y));
  return ax * ay;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  // Both coverages are computed in UNIFORM control flow (fwidth is illegal inside a branch on a
  // varying), then selected — sharp rounded-rect for ~no blur, the analytic gaussian otherwise.
  let center = (in.lo + in.hi) * 0.5;
  let halfSize = (in.hi - in.lo) * 0.5;
  let d = sdRoundBox(in.frag - center, halfSize, in.corner);
  let aa = max(fwidth(d), 1e-4);
  let sharp = 1.0 - smoothstep(-aa, aa, d);
  let blurred = clamp(roundedBoxShadow(in.lo, in.hi, in.frag, max(in.sigma, 0.5), in.corner), 0.0, 1.0); // max() keeps gaussian finite when unused
  let a = select(blurred, sharp, in.sigma < 0.5);
  let alpha = in.color.a * a * clipAlpha(in.frag, in.clip);
  return vec4f(in.color.rgb * alpha, alpha);         // premultiplied
}
`;

// Fullscreen blit of the backdrop texture onto the canvas (replace).
const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  var o: VSOut; o.pos = vec4f(p[vi],0,1);
  o.uv = vec2f((p[vi].x+1.0)*0.5, (1.0-p[vi].y)*0.5);
  return o;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f { return textureSample(tex, samp, in.uv); }
`;

// Composite an offscreen (premultiplied) texture over the target, scaled by a uniform alpha.
// Used for GROUP OPACITY: a subtree renders at full alpha into a scratch texture, then this
// fades the whole result by `u.x` (premultiplied → scaling the vec4 is correct) with PREMUL blend.
const ALPHA_BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: vec4f; // u.x = group opacity
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  var o: VSOut; o.pos = vec4f(p[vi],0,1);
  o.uv = vec2f((p[vi].x+1.0)*0.5, (1.0-p[vi].y)*0.5);
  return o;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f { return textureSample(tex, samp, in.uv) * u.x; }
`;

// Refractive glass: samples the backdrop in SCREEN space, bends it at the rim.
const GLASS_WGSL = /* wgsl */ `
struct GU {
  rect: vec4f,   // x,y,w,h  CSS px
  fbvp: vec4f,   // fb.x, fb.y (physical px),  vp.x, vp.y (CSS px)
  params: vec4f, // refraction, blur, tint, rim
  tint: vec4f,   // rgba
  misc: vec4f,   // dpr, radius, brighten, specular
  params2: vec4f,// dispersion, _, _, _
  bg: vec4f,     // panel background rgba (straight alpha) — over-composited to occlude the backdrop
};
@group(0) @binding(0) var<uniform> u: GU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var backdrop: texture_2d<f32>;

struct VSOut { @builtin(position) pos: vec4f, @location(0) local: vec2f, @location(1) half: vec2f };
const QUAD = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  let q = QUAD[vi];
  let px = u.rect.xy + q*u.rect.zw;
  let clip = vec2f(px.x/u.fbvp.z*2.0-1.0, -(px.y/u.fbvp.w*2.0-1.0));
  var o: VSOut; o.pos = vec4f(clip,0,1); o.local = (q-0.5)*u.rect.zw; o.half = u.rect.zw*0.5; return o;
}
fn sdRoundBox(p: vec2f, b: vec2f, r: f32) -> f32 { let q = abs(p)-b+vec2f(r); return length(max(q,vec2f(0.0)))+min(max(q.x,q.y),0.0)-r; }

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let half = in.half;
  let radius = min(u.misc.y, min(half.x, half.y));
  let d = sdRoundBox(in.local, half, radius);
  let aa = max(fwidth(d), 0.0001);
  let shape = 1.0 - smoothstep(-aa, aa, d);

  let fb = u.fbvp.xy;
  let dpr = u.misc.x;
  let screenUV = in.pos.xy / fb;

  // SDF gradient -> outward normal
  let e = 1.0;
  let nx = sdRoundBox(in.local+vec2f(e,0.0), half, radius) - sdRoundBox(in.local-vec2f(e,0.0), half, radius);
  let ny = sdRoundBox(in.local+vec2f(0.0,e), half, radius) - sdRoundBox(in.local-vec2f(0.0,e), half, radius);
  var n = vec2f(nx, ny); n = n / max(length(n), 1e-4);

  let refraction = u.params.x;
  let blurAmt = u.params.y;
  let tintAmt = u.params.z;
  let rim = u.params.w;
  let edge = smoothstep(rim, 0.0, -d); // 1 at rim, 0 in interior

  // refraction: displace the backdrop sample (CSS px -> framebuffer px -> UV)
  let offCss = n * edge * refraction * (half.x + half.y);
  let suv = screenUV + offCss * dpr / fb;

  var col: vec3f;
  if (blurAmt > 0.001) {
    // Dense 9x9 Gaussian (81 taps) over +/- radius — uniformly fuzzy like CSS
    // blur(), instead of the discrete "ghost copies" a sparse kernel produces.
    // textureSampleLevel keeps sampling valid inside the loop (no derivatives).
    let R = blurAmt * dpr / fb; // blur radius in UV (per-axis, aspect-correct)
    var sum = vec3f(0.0);
    var wsum = 0.0;
    for (var j = -4; j <= 4; j = j + 1) {
      for (var i = -4; i <= 4; i = i + 1) {
        let fi = f32(i) / 4.0;
        let fj = f32(j) / 4.0;
        let w = exp(-2.5 * (fi * fi + fj * fj));
        sum = sum + textureSampleLevel(backdrop, samp, suv + vec2f(fi, fj) * R, 0.0).rgb * w;
        wsum = wsum + w;
      }
    }
    col = sum / wsum;
  } else {
    col = textureSampleLevel(backdrop, samp, suv, 0.0).rgb;
  }

  // dispersion: chromatic split at the rim — red sampled outward, blue inward
  // along the normal, so the edge fringes color like a real glass edge. Fades as
  // blur builds (a blurred backdrop shouldn't carry a crisp colored fringe).
  let disp = u.params2.x;
  if (disp > 0.0001) {
    let dispUV = n * (edge * disp * (half.x + half.y)) * dpr / fb;
    let caF = edge * (1.0 - clamp(blurAmt / 12.0, 0.0, 1.0));
    col.r = mix(col.r, textureSampleLevel(backdrop, samp, suv + dispUV, 0.0).r, caF);
    col.b = mix(col.b, textureSampleLevel(backdrop, samp, suv - dispUV, 0.0).b, caF);
  }

  col = mix(col, u.tint.rgb, tintAmt);
  col = mix(col, u.bg.rgb, u.bg.a); // panel background over the refracted sample at its alpha (occludes when opaque)
  col *= u.misc.z; // brighten (live-tunable)

  // thin rim edge — keeps the glass shape readable, always on
  let rimHi = smoothstep(2.0, 0.0, abs(d));
  col += vec3f(1.0) * rimHi * 0.12;

  // specular: a Blinn-Phong glint where the beveled rim faces a top-left light,
  // plus a soft top sheen so the body catches light. Scaled by the slider.
  let spec = u.misc.w;
  let N = normalize(vec3f(n * edge, 0.55)); // flat in the interior, tilts out at the bevel
  let L = normalize(vec3f(-0.4, -0.8, 0.5));
  let H = normalize(L + vec3f(0.0, 0.0, 1.0));
  let glint = pow(max(dot(N, H), 0.0), 12.0) * edge;
  let ty = in.local.y / half.y * 0.5 + 0.5; // 0 top, 1 bottom
  let sheen = smoothstep(0.45, 0.0, ty);
  col += vec3f(1.0) * (glint * 1.3 + sheen * 0.16) * spec;

  let a = shape;
  return vec4f(col * a, a);
}
`;

// Shader-material template. The author shader is injected between HEAD and TAIL and must
// define `fn material(uv: vec2f, px: vec2f) -> vec4f` (uv 0..1 in the element; px = screen
// css px). It can read `u` (u.res.w=time, u.res.xy=viewport, u.ptr.xy=pointer, u.ptr.z=radius,
// u.c0..u.c3=custom uniforms, u.rect=element rect) and use sampleBackdrop()/noise/fbm helpers.
const MATERIAL_HEAD = /* wgsl */ `
struct MU { rect: vec4f, res: vec4f, ptr: vec4f, c0: vec4f, c1: vec4f, c2: vec4f, c3: vec4f };
@group(0) @binding(0) var<uniform> u: MU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var backdrop: texture_2d<f32>;
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) px: vec2f };
const QUAD = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  let q = QUAD[vi];
  let p = u.rect.xy + q * u.rect.zw;
  let ndc = vec2f(p.x / u.res.x * 2.0 - 1.0, -(p.y / u.res.y * 2.0 - 1.0));
  var o: VSOut; o.pos = vec4f(ndc, 0.0, 1.0); o.uv = q; o.px = p; return o;
}
fn sdRoundBox(p: vec2f, b: vec2f, r: f32) -> f32 { let q = abs(p)-b+vec2f(r); return length(max(q,vec2f(0.0)))+min(max(q.x,q.y),0.0)-r; }
fn sampleBackdrop(cssPx: vec2f) -> vec4f { return textureSampleLevel(backdrop, samp, cssPx / u.res.xy, 0.0); }
fn hash21(p0: vec2f) -> f32 { let p = fract(p0 * vec2f(123.34, 345.45)); let q = p + dot(p, p + 34.345); return fract(q.x * q.y); }
fn noise2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let w = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2f(1,0)), w.x), mix(hash21(i+vec2f(0,1)), hash21(i+vec2f(1,1)), w.x), w.y);
}
fn fbm(p0: vec2f) -> f32 { var p=p0; var a=0.5; var v=0.0; for (var i=0; i<5; i=i+1) { v=v+a*noise2(p); p=p*2.02; a=a*0.5; } return v; }
fn hsv2rgb(c: vec3f) -> vec3f { let p = abs(fract(c.xxx + vec3f(0.0,2.0/3.0,1.0/3.0))*6.0 - 3.0); return c.z * mix(vec3f(1.0), clamp(p-1.0,vec3f(0.0),vec3f(1.0)), c.y); }
`;
const MATERIAL_TAIL = /* wgsl */ `
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let half = u.rect.zw * 0.5;
  let local = (in.uv - 0.5) * u.rect.zw;
  let radius = min(u.ptr.z, min(half.x, half.y));
  let d = sdRoundBox(local, half, radius);
  let aa = max(fwidth(d), 0.0001);
  let shape = 1.0 - smoothstep(-aa, aa, d);
  let c = material(in.uv, in.px);
  let a = clamp(c.a, 0.0, 1.0) * shape;
  return vec4f(c.rgb * a, a);
}
`;

// Dev only — gates the user-visible magenta error fill. Relies on an app bundler replacing
// the literal `process.env.NODE_ENV` (Vite/Next/webpack/esbuild all do). Fails SAFE: an
// unbundled / no-replacement load throws and we stay `false` (skip the fill) rather than
// flash magenta at real users.
let DEV = false;
try {
  // @ts-expect-error `process` is bundler-injected, not typed in this browser lib.
  DEV = process.env.NODE_ENV !== "production";
} catch {
  /* no bundler replacement (raw ESM/CDN) — leave DEV false so prod users never see the fill */
}

// Drawn in place of a material whose shader failed to compile — magenta diagonal stripes,
// a clear "broken shader here" marker (dev only; in production a bad material is skipped).
const ERROR_MATERIAL = /* wgsl */ `fn material(uv: vec2f, px: vec2f) -> vec4f {
  let stripe = step(0.5, fract((px.x + px.y) * 0.04));
  return vec4f(mix(vec3f(0.55, 0.0, 0.35), vec3f(1.0, 0.15, 0.6), stripe), 0.8);
}`;

// Additive blend — particles ADD light, so overlaps brighten into glow (which bloom blooms).
const ADD_BLEND: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
};

// Instanced particle sprites. Positions are WORLD coords (so the field scrolls/zooms with
// the page via the same camera as rects); the fragment is a soft radial falloff.
// Instance: [x,y,size,_][r,g,b,a].
const PARTICLE_WGSL = /* wgsl */ `
struct VP { res: vec2f, pad: vec2f, cam: vec4f };
@group(0) @binding(0) var<uniform> vp: VP;
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f };
const Q = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) posSize: vec4f, @location(1) color: vec4f) -> VSOut {
  let q = Q[vi];
  let world = posSize.xy + (q - vec2f(0.5)) * posSize.z;
  let screen = world * vp.cam.z + vp.cam.xy;
  let ndc = vec2f(screen.x / vp.res.x * 2.0 - 1.0, -(screen.y / vp.res.y * 2.0 - 1.0));
  var o: VSOut; o.pos = vec4f(ndc, 0.0, 1.0); o.uv = q; o.color = color; return o;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv - vec2f(0.5)) * 2.0;
  let a = pow(max(0.0, 1.0 - d), 1.7) * in.color.a; // soft radial sprite
  return vec4f(in.color.rgb * a, a); // premultiplied (additive blend)
}
`;

// Bloom pass 1: extract bright pixels of the scene + box-blur, into a quarter-res target.
const BLOOM_EXTRACT_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var scene: texture_2d<f32>;
struct BU { texel: vec2f, threshold: f32, spread: f32 };
@group(0) @binding(2) var<uniform> u: BU;
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  var o: VSOut; o.pos = vec4f(p[vi],0,1); o.uv = vec2f((p[vi].x+1.0)*0.5, (1.0-p[vi].y)*0.5); return o;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var sum = vec3f(0.0); var wsum = 0.0;
  for (var j = -3; j <= 3; j = j + 1) {
    for (var i = -3; i <= 3; i = i + 1) {
      let off = vec2f(f32(i), f32(j)) * u.texel * u.spread;
      let c = textureSampleLevel(scene, samp, in.uv + off, 0.0).rgb;
      let b = max(c - vec3f(u.threshold), vec3f(0.0)) / max(1.0 - u.threshold, 0.05);
      let w = exp(-0.4 * f32(i * i + j * j));
      sum = sum + b * w; wsum = wsum + w;
    }
  }
  return vec4f(sum / wsum, 1.0);
}
`;

// Bloom pass 2: scene + upsampled(blurred bright) -> canvas. Bilinear upsample smooths the
// quarter-res bloom for free. Additive composite.
const BLOOM_COMPOSITE_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
struct CU { intensity: f32, pad: f32, rect: vec4f }; // rect = x,y,w,h in FRAMEBUFFER px
@group(0) @binding(3) var<uniform> u: CU;
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  var o: VSOut; o.pos = vec4f(p[vi],0,1); o.uv = vec2f((p[vi].x+1.0)*0.5, (1.0-p[vi].y)*0.5); return o;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let base = textureSampleLevel(scene, samp, in.uv, 0.0).rgb;
  let bloom = textureSampleLevel(bloomTex, samp, in.uv, 0.0).rgb;
  // Mask the bloom to the region's box (soft-edged), so the rest of the page is an exact
  // 1:1 copy of the scene — untouched.
  let p = in.pos.xy;
  let m = 28.0;
  let ax = smoothstep(u.rect.x - m, u.rect.x + m, p.x) * (1.0 - smoothstep(u.rect.x + u.rect.z - m, u.rect.x + u.rect.z + m, p.x));
  let ay = smoothstep(u.rect.y - m, u.rect.y + m, p.y) * (1.0 - smoothstep(u.rect.y + u.rect.w - m, u.rect.y + u.rect.w + m, p.y));
  return vec4f(base + bloom * u.intensity * ax * ay, 1.0);
}
`;

// [x,y,w,h][radius,_,_,_][r,g,b,a][clipX,clipY,clipW,clipH]
export const FLOATS_PER_RECT = 16;
const RECT_STRIDE = FLOATS_PER_RECT * 4;
const FLOATS_PER_SHADOW = 20; // box(4) + params(4) + color(4) + clip(4) + extra(4)
const SHADOW_STRIDE = FLOATS_PER_SHADOW * 4;
const clamp255 = (c: number) => Math.max(0, Math.min(255, Math.round(c * 255))); // 0..1 channel → 0..255 byte

// Glyph atlas: glyphs are rasterized once at a BASE size (supersampled) and scaled
// per display size. Crisp for UI text; only soft when zoomed past BASE.
const GLYPH_BASE = 44; // CSS px the atlas glyph is measured at
const GLYPH_SS = 2; // atlas supersample
const GLYPH_PAD = 4; // CSS px padding around each glyph cell — also the SDF spread room (overhang)
const SDF_SPREAD = GLYPH_PAD * GLYPH_SS; // SDF encodes a half-range of ±SDF_SPREAD/2 atlas px (the
// byte saturates at ±spread/2 around the edge); kept ≤ the GLYPH_PAD padding so the field never truncates.
// Rasterization base for a given DISPLAY size. Small text shares the 44px atlas entry (cheap);
// large text (big headings) gets its OWN higher-res entry, bucketed to 32px steps, so it isn't
// the 44px sprite upscaled ~5× (which softens/pixelates). Capped at 256 so a few huge glyphs
// can't blow the shared atlas budget.
function glyphBaseFor(size: number): number {
  return size <= GLYPH_BASE ? GLYPH_BASE : Math.min(256, Math.ceil(size / 32) * 32);
}

// Single-channel signed-distance-field generation (after mapbox/tiny-sdf, ISC). Turns a rasterized
// coverage-alpha glyph into an SDF so text stays crisp at ANY zoom: the exact Euclidean distance
// transform (Felzenszwalb & Huttenlocher) gives each texel its distance to the glyph edge, encoded
// so 0.5 = edge, >0.5 inside, <0.5 outside. The shader recovers a sharp edge via smoothstep(fwidth).
const SDF_INF = 1e20;
function edt1d(grid: Float64Array, offset: number, stride: number, length: number, f: Float64Array, v: Int16Array, z: Float64Array) {
  v[0] = 0;
  z[0] = -SDF_INF;
  z[1] = SDF_INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = SDF_INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const dq = q - r;
    grid[offset + q * stride] = f[r] + dq * dq;
  }
}
function edt(grid: Float64Array, w: number, h: number, f: Float64Array, v: Int16Array, z: Float64Array) {
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}
// rgba = canvas pixels (alpha = coverage). Returns one SDF byte per texel (edge ≈ 128).
function glyphSDF(rgba: Uint8ClampedArray, w: number, h: number, spread: number): Uint8Array {
  const size = w * h;
  const outer = new Float64Array(size);
  const inner = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const a = rgba[i * 4 + 3] / 255; // coverage of this texel
    outer[i] = a === 1 ? 0 : a === 0 ? SDF_INF : Math.max(0, 0.5 - a) ** 2;
    inner[i] = a === 1 ? SDF_INF : a === 0 ? 0 : Math.max(0, a - 0.5) ** 2;
  }
  const len = Math.max(w, h);
  const f = new Float64Array(len);
  const z = new Float64Array(len + 1);
  const v = new Int16Array(len);
  edt(outer, w, h, f, v, z);
  edt(inner, w, h, f, v, z);
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]); // signed px distance: + outside, − inside
    out[i] = Math.max(0, Math.min(255, Math.round(255 - 255 * (d / spread + 0.5)))); // edge → ~128 (0.5)
  }
  return out;
}
// One shared atlas for every (weight, glyph) pair. A real multi-weight UI burns through
// the 1024² budget fast — each weight is a distinct entry — and overflow glyphs render
// blank. 2048² (~4× the slots) covers realistic multi-weight UIs; on overflow getGlyph
// warns ONCE (fail loud, never a mystery blank). A true fix for unbounded text would page
// or evict the atlas.
const ATLAS_SIZE = 2048;
const FLOATS_PER_GLYPH = 16; // [x,y,w,h][u0,v0,u1,v1][r,g,b,a][clip]
const GLYPH_STRIDE = FLOATS_PER_GLYPH * 4;

interface GlyphEntry {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  cellW: number; // CSS px (BASE scale)
  cellH: number;
  advance: number;
}


export class Painter {
  device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private canvas: HTMLCanvasElement;

  private rectPipeline!: GPURenderPipeline;
  private shadowPipeline!: GPURenderPipeline;
  private imagePipeline!: GPURenderPipeline;
  // Image texture cache, one entry per `src`. `loading` guards single-fetch; `failed` stops a broken
  // src from re-fetching every frame; `tick` is the last frame it was used (for LRU eviction).
  private images = new Map<string, ImageEntry>();
  private imageTick = 0; // bumped each drawImages; entry.tick records last use for LRU eviction
  private blitPipeline!: GPURenderPipeline;
  private alphaBlitPipeline!: GPURenderPipeline; // composite an offscreen subtree at a group opacity
  private opacityTex: GPUTexture | null = null; // reused full-screen scratch for group-opacity batches
  private opacityView: GPUTextureView | null = null;
  private glassPipeline!: GPURenderPipeline;
  private vpBuffer!: GPUBuffer;
  private rectVpBindGroup!: GPUBindGroup;
  private shadowVpBindGroup!: GPUBindGroup;
  private sampler!: GPUSampler;

  // Two backdrop textures: ping-pong so each glass panel refracts the accumulated
  // result (base + previously-drawn glass) = glass-over-glass.
  private backdropTex: GPUTexture | null = null;
  private backdropTex2: GPUTexture | null = null;
  private backdropView: GPUTextureView | null = null;
  private backdropView2: GPUTextureView | null = null;
  private backdropW = 0;
  private backdropH = 0;

  private glassBuffers: GPUBuffer[] = [];

  // Bulk node graph: WORLD-space instances uploaded once; camera applied in-shader.
  private nodeBuffer: GPUBuffer | null = null;
  private nodeCount = 0;
  private nodeCap = 0;

  // Glyph atlas (Gap B): glyphs rasterized once into a packed alpha atlas.
  private glyphPipeline!: GPURenderPipeline;
  private atlasTex!: GPUTexture;
  private atlasBindGroup!: GPUBindGroup;
  private glyph2d!: CanvasRenderingContext2D;
  private glyphCache = new Map<string, GlyphEntry>();
  private packX = 1;
  private packY = 1;
  private packRowH = 0;
  private warnedAtlasFull = false; // fail-loud guard: warn once when the atlas overflows
  private glyphScratch = new Float32Array(0);
  private pendingBuffers: GPUBuffer[] = []; // transient per-pass buffers, freed after submit

  // Shader materials: one pipeline cached per unique shader source; pooled uniform buffers.
  // An EXPLICIT bind-group layout (not "auto") so every material pipeline keeps all three
  // bindings even when a shader doesn't sample the backdrop (auto-layout would strip them).
  private materialPipelines = new Map<string, GPURenderPipeline>();
  private materialBuffers: GPUBuffer[] = [];
  private materialBGL!: GPUBindGroupLayout;
  private materialPL!: GPUPipelineLayout;
  private warnedUniforms = new Set<string>(); // shaders we've already warned about (>16 uniform floats)
  private badShaders = new Set<string>(); // shaders that failed to compile — skipped/error-filled, never drawn
  /** Set by the runtime: called when a shader is newly flagged bad, so the (async) detection
   *  can trigger a repaint and the frame recovers instead of staying blank. */
  onInvalidate?: () => void;

  /** Set by the runtime: called when an image finishes loading (async), so the frame repaints and
   *  the now-ready texture is drawn instead of staying blank until the next unrelated repaint. */
  onImageLoaded?: () => void;

  /** True once the GPUDevice is lost OR this Painter is destroyed. Frames become no-ops so a
   *  lost / unconfigured context never throws out of the render loop. */
  private lost = false;
  /** Set by the runtime: called if a frame throws because the device was lost mid-frame (before
   *  the async device.lost handler runs), so the runtime can stop the loop + notify the app. */
  onDeviceError?: (info: { reason: string; message: string }) => void;

  // A full-screen background shader rendered INTO the backdrop (pass 0) so glass refracts it.
  private bgShader: string | null = null;
  private bgBuffer!: GPUBuffer;

  // Particles: one instanced additive draw for the whole field (shares the rect camera).
  private particlePipeline!: GPURenderPipeline;
  private particleVpBindGroup!: GPUBindGroup;

  // Post-process: the whole scene composites into sceneTex, then bloom extracts bright
  // pixels into a quarter-res brightTex and adds them back over the canvas.
  private sceneTex: GPUTexture | null = null;
  private sceneView: GPUTextureView | null = null;
  private brightTex: GPUTexture | null = null;
  private brightView: GPUTextureView | null = null;
  private brightW = 0;
  private brightH = 0;
  private bloomExtractPipeline!: GPURenderPipeline;
  private bloomCompositePipeline!: GPURenderPipeline;
  private bloomExtractU!: GPUBuffer;
  private bloomCompositeU!: GPUBuffer;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  static async create(canvas: HTMLCanvasElement): Promise<Painter> {
    if (!navigator.gpu) throw new Error("WebGPU not supported (navigator.gpu is undefined)");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No GPUAdapter");
    const p = new Painter(canvas);
    const device = await adapter.requestDevice();
    Painter.assertCapable(device); // before committing — fails clean to the WebGPU fallback
    p.device = device;
    p.attachDeviceHandlers();
    p.context = canvas.getContext("webgpu") as GPUCanvasContext;
    p.format = navigator.gpu.getPreferredCanvasFormat();
    p.context.configure({ device: p.device, format: p.format, alphaMode: "premultiplied" });
    p.build();
    p.resize();
    return p;
  }

  // Wire the current device's loss + uncaptured-error handlers. Re-run after recover() re-acquires
  // a device. A loss routes to onDeviceError (the runtime attempts recovery); "destroyed" is our
  // own teardown, not a loss, so it's ignored.
  private attachDeviceHandlers() {
    this.device.lost.then((info) => {
      if (info.reason === "destroyed") return;
      this.lost = true; // stop painting on the dead device until recovery rebuilds
      console.error("WebGPU device lost:", info.reason, info.message);
      this.onDeviceError?.({ reason: String(info.reason), message: info.message });
    });
    this.device.addEventListener("uncapturederror", (e) => console.error("[webgpu uncaptured]", (e as GPUUncapturedErrorEvent).error.message));
  }

  // Fail CLEANLY on a GPU that can't back the fixed-size glyph atlas. WebGPU guarantees
  // maxTextureDimension2D >= 8192, so this never trips on a compliant device — but a constrained
  // or under-reporting adapter would otherwise crash with an uncaught validation error mid-build
  // when createTexture([ATLAS_SIZE, ATLAS_SIZE]) runs. Validate a freshly-acquired device BEFORE
  // committing it to this.device, and destroy the incapable one so it isn't leaked. Throwing routes
  // to the WebGPU fallback: create() rejects → <GpuCanvas> shows its fallback; recover() catches →
  // gives up → onDeviceLost. (Canvas-sized render targets are separately clamped to it in resize().)
  private static assertCapable(device: GPUDevice) {
    const max = device.limits.maxTextureDimension2D;
    if (max < ATLAS_SIZE) {
      device.destroy();
      throw new Error(`[kussetsu] WebGPU device unsupported: maxTextureDimension2D=${max} < ${ATLAS_SIZE} required for the glyph atlas.`);
    }
  }

  /** Re-acquire the GPU device and rebuild ALL device-owned resources on the same canvas after a
   *  loss. The scene tree (React state) is untouched — only GPU resources died — so the runtime
   *  just resumes its loop + repaints. Returns false if re-acquisition fails (caller gives up). */
  async recover(): Promise<boolean> {
    try {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      const device = await adapter.requestDevice();
      Painter.assertCapable(device); // throws (destroying the incapable device) → caught below → onDeviceLost
      this.device = device;
      this.lost = false;
      this.attachDeviceHandlers();
      this.context.configure({ device: this.device, format: this.format, alphaMode: "premultiplied" });
      // Drop every cache/handle tied to the dead device, then rebuild from scratch.
      this.glyphCache.clear();
      for (const e of this.images.values()) e.tex?.destroy();
      this.images.clear(); // images re-fetch on the next frame (drawImages re-kicks the loads)
      this.packX = 1;
      this.packY = 1;
      this.packRowH = 0;
      this.warnedAtlasFull = false;
      this.materialPipelines.clear();
      this.badShaders.clear();
      this.warnedUniforms.clear();
      this.glassBuffers.length = 0;
      this.materialBuffers.length = 0;
      this.pendingBuffers.length = 0;
      this.nodeBuffer = null;
      this.nodeCount = 0;
      this.nodeCap = 0;
      this.backdropTex = null; // force ensureBackdrop (via resize) to rebuild every render target
      this.backdropW = 0;
      this.backdropH = 0;
      this.build();
      this.resize();
      return true;
    } catch (e) {
      console.error("[gpu-renderer] device recovery failed:", e instanceof Error ? e.message : e);
      return false;
    }
  }

  private build() {
    const { device, format } = this;
    const rectModule = device.createShaderModule({ code: RECT_WGSL });
    this.rectPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: rectModule,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: RECT_STRIDE,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" }, // rect
              { shaderLocation: 1, offset: 16, format: "float32x3" }, // radius, cornerSmoothing, borderWidth
              { shaderLocation: 4, offset: 28, format: "unorm8x4" }, // borderColor (4 bytes, in the spare float slot 7)
              { shaderLocation: 2, offset: 32, format: "float32x4" }, // color
              { shaderLocation: 3, offset: 48, format: "float32x4" }, // clip
            ],
          },
        ],
      },
      fragment: { module: rectModule, entryPoint: "fs", targets: [{ format, blend: PREMUL_BLEND }] },
      primitive: { topology: "triangle-list" },
    });

    const shadowModule = device.createShaderModule({ code: SHADOW_WGSL });
    this.shadowPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shadowModule,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: SHADOW_STRIDE,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" }, // box (x,y,w,h)
              { shaderLocation: 1, offset: 16, format: "float32x4" }, // ox, oy, blur, spread
              { shaderLocation: 2, offset: 32, format: "float32x4" }, // color
              { shaderLocation: 3, offset: 48, format: "float32x4" }, // clip
              { shaderLocation: 4, offset: 64, format: "float32x4" }, // extra: radius, _, _, _
            ],
          },
        ],
      },
      fragment: { module: shadowModule, entryPoint: "fs", targets: [{ format, blend: PREMUL_BLEND }] },
      primitive: { topology: "triangle-list" },
    });

    const imageModule = device.createShaderModule({ code: IMAGE_WGSL });
    this.imagePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: imageModule,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: 48, // [x,y,w,h] [clip x,y,w,h] [radius, smoothing, imgAspect, fitMode]
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" }, // rect (screen px)
              { shaderLocation: 1, offset: 16, format: "float32x4" }, // clip
              { shaderLocation: 2, offset: 32, format: "float32x4" }, // params
            ],
          },
        ],
      },
      fragment: { module: imageModule, entryPoint: "fs", targets: [{ format, blend: PREMUL_BLEND }] },
      primitive: { topology: "triangle-list" },
    });

    const blitModule = device.createShaderModule({ code: BLIT_WGSL });
    this.blitPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: blitModule, entryPoint: "vs" },
      fragment: { module: blitModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });

    const alphaBlitModule = device.createShaderModule({ code: ALPHA_BLIT_WGSL });
    this.alphaBlitPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: alphaBlitModule, entryPoint: "vs" },
      fragment: { module: alphaBlitModule, entryPoint: "fs", targets: [{ format, blend: PREMUL_BLEND }] },
      primitive: { topology: "triangle-list" },
    });

    const glassModule = device.createShaderModule({ code: GLASS_WGSL });
    this.glassPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: glassModule, entryPoint: "vs" },
      fragment: { module: glassModule, entryPoint: "fs", targets: [{ format, blend: PREMUL_BLEND }] },
      primitive: { topology: "triangle-list" },
    });

    this.vpBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.rectVpBindGroup = device.createBindGroup({
      layout: this.rectPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.vpBuffer } }],
    });
    this.shadowVpBindGroup = device.createBindGroup({
      layout: this.shadowPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.vpBuffer } }],
    });
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

    // Fixed layout for all shader materials (uniform + sampler + backdrop texture).
    this.materialBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });
    this.materialPL = device.createPipelineLayout({ bindGroupLayouts: [this.materialBGL] });

    // --- Gap B: glyph atlas pipeline + texture ---
    const glyphModule = device.createShaderModule({ code: GLYPH_WGSL });
    this.glyphPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: glyphModule,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: GLYPH_STRIDE,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" }, // rect
              { shaderLocation: 1, offset: 16, format: "float32x4" }, // uv
              { shaderLocation: 2, offset: 32, format: "float32x4" }, // color
              { shaderLocation: 3, offset: 48, format: "float32x4" }, // clip
            ],
          },
        ],
      },
      fragment: { module: glyphModule, entryPoint: "fs", targets: [{ format, blend: PREMUL_BLEND }] },
      primitive: { topology: "triangle-list" },
    });
    this.atlasTex = device.createTexture({
      size: [ATLAS_SIZE, ATLAS_SIZE],
      format: "r8unorm", // single channel — the atlas only carries the SDF (¼ the VRAM of rgba8). The
      // shader samples `.r`. No RENDER_ATTACHMENT: glyphs upload via writeTexture, never render-to-atlas.
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.atlasBindGroup = device.createBindGroup({
      layout: this.glyphPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.vpBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.atlasTex.createView() },
      ],
    });
    this.glyph2d = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;

    // --- Particles: instanced additive sprites, sharing the rect camera (vpBuffer) ---
    const particleModule = device.createShaderModule({ code: PARTICLE_WGSL });
    this.particlePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: particleModule,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: 32,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" }, // x,y,size,_
              { shaderLocation: 1, offset: 16, format: "float32x4" }, // r,g,b,a
            ],
          },
        ],
      },
      fragment: { module: particleModule, entryPoint: "fs", targets: [{ format, blend: ADD_BLEND }] },
      primitive: { topology: "triangle-list" },
    });
    this.particleVpBindGroup = device.createBindGroup({
      layout: this.particlePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.vpBuffer } }],
    });

    // --- Post-process bloom: extract+blur then additive composite ---
    const exModule = device.createShaderModule({ code: BLOOM_EXTRACT_WGSL });
    this.bloomExtractPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: exModule, entryPoint: "vs" },
      fragment: { module: exModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    const coModule = device.createShaderModule({ code: BLOOM_COMPOSITE_WGSL });
    this.bloomCompositePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: coModule, entryPoint: "vs" },
      fragment: { module: coModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    this.bloomExtractU = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // 32 bytes: CU's `pad: vec3f` forces 16-byte alignment, so the struct rounds up to 32.
    this.bloomCompositeU = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bgBuffer = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); // background-shader MU
  }

  size(): { cssWidth: number; cssHeight: number } {
    return this.resize();
  }
  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const max = this.device.limits.maxTextureDimension2D;
    this.canvas.width = Math.min(cssWidth * dpr, max);
    this.canvas.height = Math.min(cssHeight * dpr, max);
    return { cssWidth, cssHeight };
  }

  private ensureBackdrop(w: number, h: number) {
    if (this.backdropTex && this.backdropW === w && this.backdropH === h) return;
    this.backdropTex?.destroy();
    this.backdropTex2?.destroy();
    const make = () =>
      this.device.createTexture({
        size: [w, h],
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    this.backdropTex = make();
    this.backdropTex2 = make();
    this.backdropView = this.backdropTex.createView();
    this.backdropView2 = this.backdropTex2.createView();
    this.backdropW = w;
    this.backdropH = h;
    // Post-process targets: full-res scene + quarter-res bloom.
    this.sceneTex?.destroy();
    this.sceneTex = make();
    this.sceneView = this.sceneTex.createView();
    this.opacityTex?.destroy();
    this.opacityTex = make(); // full-screen scratch reused by each group-opacity batch
    this.opacityView = this.opacityTex.createView();
    const bw = (this.brightW = Math.max(1, Math.floor(w / 4)));
    const bh = (this.brightH = Math.max(1, Math.floor(h / 4)));
    this.brightTex?.destroy();
    this.brightTex = this.device.createTexture({ size: [bw, bh], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.brightView = this.brightTex.createView();
  }

  // Composite glass over the backdrop with ping-pong, so each panel refracts the
  // accumulated result (glass-over-glass). Builds glass uniforms + bind groups.
  private compositeGlass(encoder: GPUCommandEncoder, glass: GlassPanel[], fbw: number, fbh: number, cssWidth: number, cssHeight: number, dpr: number, target: GPUTextureView) {
    const canvasView = target;
    const clear = { r: 0, g: 0, b: 0, a: 0 };

    while (this.glassBuffers.length < glass.length) {
      this.glassBuffers.push(this.device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    }
    glass.forEach((g, i) => {
      const u = new Float32Array(28);
      u[0] = g.x; u[1] = g.y; u[2] = g.w; u[3] = g.h;
      u[4] = fbw; u[5] = fbh; u[6] = cssWidth; u[7] = cssHeight;
      u[8] = g.refraction; u[9] = g.blur; u[10] = g.tint; u[11] = g.rim;
      u[12] = g.tintColor[0]; u[13] = g.tintColor[1]; u[14] = g.tintColor[2]; u[15] = g.tintColor[3];
      u[16] = dpr; u[17] = g.radius; u[18] = g.brighten; u[19] = g.specular;
      u[20] = g.dispersion;
      u[24] = g.background[0]; u[25] = g.background[1]; u[26] = g.background[2]; u[27] = g.background[3]; // bg vec4f at offset 96
      this.device.queue.writeBuffer(this.glassBuffers[i], 0, u);
    });

    const blitBG = (view: GPUTextureView) =>
      this.device.createBindGroup({ layout: this.blitPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: view }] });
    const glassBG = (i: number, view: GPUTextureView) =>
      this.device.createBindGroup({ layout: this.glassPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.glassBuffers[i] } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: view }] });

    if (glass.length === 0) {
      const p = encoder.beginRenderPass({ colorAttachments: [{ view: canvasView, clearValue: clear, loadOp: "clear", storeOp: "store" }] });
      p.setPipeline(this.blitPipeline);
      p.setBindGroup(0, blitBG(this.backdropView!));
      p.draw(3);
      p.end();
      return;
    }

    let srcView = this.backdropView!;
    let dstView = this.backdropView2!;
    for (let i = 0; i < glass.length; i++) {
      const last = i === glass.length - 1;
      const target = last ? canvasView : dstView; // last panel renders straight to the canvas
      const p = encoder.beginRenderPass({ colorAttachments: [{ view: target, clearValue: clear, loadOp: "clear", storeOp: "store" }] });
      p.setPipeline(this.blitPipeline);
      p.setBindGroup(0, blitBG(srcView)); // copy accumulated backdrop
      p.draw(3);
      p.setPipeline(this.glassPipeline);
      p.setBindGroup(0, glassBG(i, srcView)); // refract it
      p.draw(6);
      p.end();
      if (!last) {
        const t = srcView;
        srcView = dstView;
        dstView = t;
      }
    }
  }

  // --- Gap B: glyph atlas ---
  private getGlyph(char: string, weight: number, base: number): GlyphEntry {
    const key = `${weight}|${base}|${char}`;
    const cached = this.glyphCache.get(key);
    if (cached) return cached;
    const font = `${weight} ${base}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    this.glyph2d.font = font;
    const advance = this.glyph2d.measureText(char).width;
    const cellW = Math.max(1, Math.ceil(advance) + GLYPH_PAD * 2);
    const cellH = Math.ceil(base * 1.3);
    const aw = cellW * GLYPH_SS;
    const ah = cellH * GLYPH_SS;
    if (this.packX + aw > ATLAS_SIZE) {
      this.packX = 1;
      this.packY += this.packRowH + 1;
      this.packRowH = 0;
    }
    const atlasFull = this.packY + ah > ATLAS_SIZE;
    if (atlasFull && !this.warnedAtlasFull) {
      // FAIL LOUD (once): the cardinal sin is a silent blank box. A full atlas means subsequent
      // glyphs render invisible (advance-only) — surface it so it's debuggable, not mysterious.
      this.warnedAtlasFull = true;
      console.warn(
        `[kussetsu] glyph atlas (${ATLAS_SIZE}×${ATLAS_SIZE}) is full — further glyphs will render BLANK. ` +
          `Likely too many distinct (font-weight, font-size) combinations or a very large character set ` +
          `(e.g. CJK). Reduce weight/size variety; a paging/eviction atlas is tracked as future work.`,
      );
    }
    if (atlasFull || char === " " || advance <= 0) {
      // atlas full, whitespace, or zero-width: cache an empty entry (advance only). The atlas-full
      // case has already warned above; whitespace/zero-width are intentionally blank.
      const e: GlyphEntry = { u0: 0, v0: 0, u1: 0, v1: 0, cellW, cellH, advance };
      this.glyphCache.set(key, e);
      return e;
    }
    const px = this.packX;
    const py = this.packY;
    this.packX += aw + 1;
    this.packRowH = Math.max(this.packRowH, ah);
    const off = document.createElement("canvas");
    off.width = aw;
    off.height = ah;
    const o = off.getContext("2d")!;
    o.scale(GLYPH_SS, GLYPH_SS);
    o.font = font;
    o.fillStyle = "#fff"; // white alpha mask; tinted per-instance in the shader
    o.textBaseline = "alphabetic";
    o.fillText(char, GLYPH_PAD, Math.round(base * 0.98));
    // Convert the rasterized coverage to an SDF and upload that (one byte/texel → the alpha channel),
    // so the glyph stays crisp at any zoom (see GLYPH_WGSL.fs). writeTexture (not copyExternalImage)
    // because we're uploading a computed byte buffer, not the canvas pixels.
    const sdf = glyphSDF(o.getImageData(0, 0, aw, ah).data, aw, ah, SDF_SPREAD);
    this.device.queue.writeTexture({ texture: this.atlasTex, origin: { x: px, y: py } }, sdf, { bytesPerRow: aw, rowsPerImage: ah }, [aw, ah]);
    const entry: GlyphEntry = { u0: px / ATLAS_SIZE, v0: py / ATLAS_SIZE, u1: (px + aw) / ATLAS_SIZE, v1: (py + ah) / ATLAS_SIZE, cellW, cellH, advance };
    this.glyphCache.set(key, entry);
    return entry;
  }

  private drawGlyphs(pass: GPURenderPassEncoder, texts: TextItem[]) {
    let total = 0;
    for (const t of texts) total += t.text.length;
    if (total === 0) return;
    const need = total * FLOATS_PER_GLYPH;
    if (this.glyphScratch.length < need) this.glyphScratch = new Float32Array(Math.ceil(need * 1.3));
    const data = this.glyphScratch;
    let n = 0;
    for (const t of texts) {
      const base = glyphBaseFor(t.size);
      const scale = t.size / base;
      const cl = t.clip;
      let penX = 0; // display px — advance by the SAME measurement layout uses (charAdvance)
      for (const ch of t.text) {
        const e = this.getGlyph(ch, t.weight, base);
        if (e.u1 > e.u0) {
          const o = n * FLOATS_PER_GLYPH;
          // The sprite cell sits GLYPH_PAD (atlas px) left of the pen; the pen itself is the
          // display-size advance sum, matching the text node's measured box.
          data[o] = t.x + penX - GLYPH_PAD * scale;
          data[o + 1] = t.y;
          data[o + 2] = e.cellW * scale;
          data[o + 3] = e.cellH * scale;
          data[o + 4] = e.u0; data[o + 5] = e.v0; data[o + 6] = e.u1; data[o + 7] = e.v1;
          data[o + 8] = t.color[0]; data[o + 9] = t.color[1]; data[o + 10] = t.color[2]; data[o + 11] = t.color[3];
          data[o + 12] = cl ? cl[0] : 0; data[o + 13] = cl ? cl[1] : 0; data[o + 14] = cl ? cl[2] : 0; data[o + 15] = cl ? cl[3] : 0;
          n++;
        }
        penX += charAdvance(ch, t.weight, t.size) + (t.tracking ?? 0);
      }
    }
    if (n === 0) return;
    // A fresh buffer per call: this runs in BOTH pass 1 (backdrop) and pass 3
    // (foreground) of one frame; a shared buffer's second writeBuffer would clobber
    // the first before the command buffer executes. Freed after submit.
    const buf = this.device.createBuffer({ size: n * GLYPH_STRIDE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(buf, 0, data, 0, n * FLOATS_PER_GLYPH);
    pass.setPipeline(this.glyphPipeline);
    pass.setBindGroup(0, this.atlasBindGroup);
    pass.setVertexBuffer(0, buf);
    pass.draw(6, n);
    this.pendingBuffers.push(buf);
  }

  private uploadRects(rects: Rect[]): GPUBuffer | null {
    if (!rects.length) return null;
    const buf = this.device.createBuffer({ size: rects.length * RECT_STRIDE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const data = new Float32Array(rects.length * FLOATS_PER_RECT);
    const bytes = new Uint8Array(data.buffer); // for the unorm8x4 border color packed into float slot 7
    rects.forEach((r, i) => {
      const o = i * FLOATS_PER_RECT;
      data[o] = r.x; data[o + 1] = r.y; data[o + 2] = r.w; data[o + 3] = r.h;
      data[o + 4] = r.radius; data[o + 5] = r.smoothing ?? 0; data[o + 6] = r.borderWidth ?? 0;
      if (r.borderWidth && r.borderColor) {
        const bo = (o + 7) * 4; // float slot 7 → its 4 bytes = the unorm8x4 attribute (x=r..w=a)
        bytes[bo] = clamp255(r.borderColor[0]); bytes[bo + 1] = clamp255(r.borderColor[1]);
        bytes[bo + 2] = clamp255(r.borderColor[2]); bytes[bo + 3] = clamp255(r.borderColor[3]);
      }
      data[o + 8] = r.color[0]; data[o + 9] = r.color[1]; data[o + 10] = r.color[2]; data[o + 11] = r.color[3];
      if (r.clip) { data[o + 12] = r.clip[0]; data[o + 13] = r.clip[1]; data[o + 14] = r.clip[2]; data[o + 15] = r.clip[3]; }
    });
    this.device.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  // Kick off an async load for `src` (once per src). On success: upload a PREMULTIPLIED texture,
  // build its bind group (vp + sampler + texture), record the aspect ratio (for `fit`), and repaint
  // via onImageLoaded. A fetch/decode failure logs once and leaves the image undrawn.
  private loadImage(src: string, entry: ImageEntry) {
    entry.loading = true;
    const dev = this.device; // snapshot: a device-loss → recover() swaps this.device mid-load
    void (async () => {
      try {
        // Load via an <img> (not fetch+blob) so SVG sources decode too — createImageBitmap(blob)
        // can't decode SVG, but an <img> rasterizes it. crossOrigin lets us texture CORS-enabled
        // remote images (same-origin + data URIs are unaffected; non-CORS remotes fail → caught).
        const el = new globalThis.Image();
        el.crossOrigin = "anonymous";
        el.src = src;
        await el.decode();
        const bitmap = await createImageBitmap(el, { premultiplyAlpha: "premultiply" });
        // Bail if the device was lost/replaced or this cache entry was evicted/cleared while we
        // awaited — otherwise we'd allocate a texture on the new device into a detached entry (leak).
        if (this.lost || this.device !== dev || this.images.get(src) !== entry) {
          bitmap.close();
          entry.loading = false;
          return;
        }
        const iw = bitmap.width;
        const ih = bitmap.height; // capture BEFORE close() — a closed ImageBitmap reports 0×0
        const tex = this.device.createTexture({
          size: [iw, ih],
          format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: tex, premultipliedAlpha: true }, [iw, ih]);
        bitmap.close();
        entry.tex = tex;
        entry.aspect = iw / Math.max(1, ih);
        entry.bindGroup = this.device.createBindGroup({
          layout: this.imagePipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: this.vpBuffer } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: tex.createView() }],
        });
        entry.loading = false;
        this.onImageLoaded?.(); // repaint now that the texture is ready
      } catch (e) {
        entry.loading = false;
        entry.failed = true; // don't re-fetch a broken/non-CORS/undecodable src every frame
        console.error(`[kussetsu] failed to load image: ${src}`, e instanceof Error ? e.message : e);
      }
    })();
  }

  // Draw images as textured rounded quads. Groups by src (one bind group / texture); kicks off loads
  // for not-yet-cached srcs and draws only the ready ones this frame (the rest appear on the repaint
  // that loadImage triggers). One shared instance buffer, one draw per texture (firstInstance offset).
  private drawImages(pass: GPURenderPassEncoder, images: ImageItem[]) {
    if (!images.length) return;
    const groups = new Map<string, ImageItem[]>();
    for (const img of images) {
      let g = groups.get(img.src);
      if (!g) groups.set(img.src, (g = []));
      g.push(img);
    }
    const tick = this.imageTick; // bumped once per frame in frameImpl (drawImages runs >1×: main + overlays)
    const ready: { bindGroup: GPUBindGroup; aspect: number; items: ImageItem[] }[] = [];
    let total = 0;
    for (const [src, items] of groups) {
      let entry = this.images.get(src);
      if (!entry) this.images.set(src, (entry = { tex: null, bindGroup: null, aspect: 1, loading: false, failed: false, tick }));
      entry.tick = tick; // mark used this frame (LRU)
      if (!entry.bindGroup && !entry.loading && !entry.failed) this.loadImage(src, entry);
      if (entry.bindGroup) {
        ready.push({ bindGroup: entry.bindGroup, aspect: entry.aspect, items });
        total += items.length;
      }
    }
    if (!total) return;
    const buf = this.device.createBuffer({ size: total * 48, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const data = new Float32Array(total * 12);
    let i = 0;
    for (const { aspect, items } of ready) {
      for (const img of items) {
        const o = i++ * 12;
        data[o] = img.x; data[o + 1] = img.y; data[o + 2] = img.w; data[o + 3] = img.h;
        if (img.clip) { data[o + 4] = img.clip[0]; data[o + 5] = img.clip[1]; data[o + 6] = img.clip[2]; data[o + 7] = img.clip[3]; }
        data[o + 8] = img.radius; data[o + 9] = img.smoothing; data[o + 10] = aspect;
        data[o + 11] = img.fit === "cover" ? 1 : img.fit === "contain" ? 2 : 0;
      }
    }
    this.device.queue.writeBuffer(buf, 0, data);
    pass.setPipeline(this.imagePipeline);
    pass.setVertexBuffer(0, buf);
    let off = 0;
    for (const { bindGroup, items } of ready) {
      pass.setBindGroup(0, bindGroup);
      pass.draw(6, items.length, 0, off);
      off += items.length;
    }
    this.pendingBuffers.push(buf);
  }

  // Bound the image-texture cache: beyond IMAGE_CACHE_MAX, destroy the least-recently-used entries
  // NOT used this frame, so swapping through many distinct srcs (a carousel, dynamic/cache-busted
  // avatar URLs) doesn't leak one texture per URL. Entries used this frame (or mid-load) are kept;
  // an evicted src simply re-loads (async) if it reappears.
  private evictImages(currentTick: number) {
    if (this.images.size <= IMAGE_CACHE_MAX) return;
    const evictable = [...this.images.entries()].filter(([, e]) => e.tick !== currentTick && !e.loading).sort((a, b) => a[1].tick - b[1].tick);
    let over = this.images.size - IMAGE_CACHE_MAX;
    for (const [src, e] of evictable) {
      if (over <= 0) break;
      e.tex?.destroy();
      this.images.delete(src);
      over--;
    }
  }

  // Draw overlay layers (style.zIndex) on top of the scene, in the pre-sorted ascending-z order
  // (last = topmost). Each overlay paints into `view` (loadOp 'load'): shadows behind, then rects,
  // glyphs, and images. Screen-space (collectOverlays applied the camera), so the identity-camera
  // vp bind groups apply. Per-overlay buffers are freed after submit (pendingBuffers).
  private drawOverlays(encoder: GPUCommandEncoder, view: GPUTextureView, overlays: Overlay[]) {
    for (const ov of overlays) {
      const shadowBuf = ov.shadows.length ? this.uploadShadows(ov.shadows) : null;
      const rectBuf = this.uploadRects(ov.rects);
      const p = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: "load", storeOp: "store" }] });
      if (shadowBuf) {
        p.setPipeline(this.shadowPipeline);
        p.setBindGroup(0, this.shadowVpBindGroup);
        p.setVertexBuffer(0, shadowBuf);
        p.draw(6, ov.shadows.length);
      }
      if (rectBuf) {
        p.setPipeline(this.rectPipeline);
        p.setBindGroup(0, this.rectVpBindGroup);
        p.setVertexBuffer(0, rectBuf);
        p.draw(6, ov.rects.length);
      }
      this.drawGlyphs(p, ov.texts);
      this.drawImages(p, ov.images);
      p.end();
      if (shadowBuf) this.pendingBuffers.push(shadowBuf);
      if (rectBuf) this.pendingBuffers.push(rectBuf);
    }
  }

  private uploadShadows(shadows: ShadowItem[]): GPUBuffer | null {
    if (!shadows.length) return null;
    const buf = this.device.createBuffer({ size: shadows.length * SHADOW_STRIDE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const data = new Float32Array(shadows.length * FLOATS_PER_SHADOW);
    shadows.forEach((s, i) => {
      const o = i * FLOATS_PER_SHADOW;
      data[o] = s.x; data[o + 1] = s.y; data[o + 2] = s.w; data[o + 3] = s.h;
      data[o + 4] = s.ox; data[o + 5] = s.oy; data[o + 6] = s.blur; data[o + 7] = s.spread;
      data[o + 8] = s.color[0]; data[o + 9] = s.color[1]; data[o + 10] = s.color[2]; data[o + 11] = s.color[3];
      if (s.clip) { data[o + 12] = s.clip[0]; data[o + 13] = s.clip[1]; data[o + 14] = s.clip[2]; data[o + 15] = s.clip[3]; }
      data[o + 16] = s.radius; // extra.x
    });
    this.device.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  private getMaterialPipeline(shader: string): GPURenderPipeline {
    let p = this.materialPipelines.get(shader);
    if (p) return p;
    const module = this.device.createShaderModule({ code: MATERIAL_HEAD + shader + MATERIAL_TAIL });
    // Map any compile error back to the AUTHOR's source (subtract the wrapper's line count),
    // so a typo points at your shader line instead of a blank tile + a line in generated code.
    module.getCompilationInfo?.().then((wgsl) => {
      const errs = wgsl.messages.filter((m) => m.type === "error");
      if (!errs.length) return;
      const head = MATERIAL_HEAD.split("\n").length - 1;
      console.error(
        "[kussetsu] material shader failed to compile — it must define " +
          "`fn material(uv: vec2f, px: vec2f) -> vec4f`:\n" +
          errs.map((m) => `  line ${Math.max(1, m.lineNum - head)}: ${m.message}`).join("\n"),
      );
      // Flag it so drawMaterials never binds this (invalid) pipeline — one bad shader would
      // otherwise invalidate the whole command buffer and blank the entire frame. The detection
      // is async (one-shot per unique shader: getCompilationInfo runs only on the cache miss
      // above), so the first frame already drew the invalid pipeline — nudge a repaint to recover
      // it. (This catches shader-MODULE compile errors, which dominate the wrapped `fn material`
      // surface; a pipeline-creation failure for a non-compile reason isn't covered yet.)
      this.badShaders.add(shader);
      this.onInvalidate?.();
    }).catch(() => {});
    p = this.device.createRenderPipeline({
      layout: this.materialPL,
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: this.format, blend: PREMUL_BLEND }] },
      primitive: { topology: "triangle-list" },
    });
    this.materialPipelines.set(shader, p);
    return p;
  }

  // Draw custom-shader material quads onto the canvas (after glass, before foreground),
  // each with standard uniforms (rect, viewport, dpr, time, pointer) + the backdrop texture.
  private drawMaterials(encoder: GPUCommandEncoder, materials: MaterialPanel[], cssW: number, cssH: number, dpr: number, time: number, pointer: [number, number], target: GPUTextureView) {
    while (this.materialBuffers.length < materials.length) {
      this.materialBuffers.push(this.device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    }
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: "load", storeOp: "store" }] });
    materials.forEach((m, i) => {
      // A shader that failed to compile would invalidate the whole command buffer (blanking
      // every sibling). Skip it in production; in dev, paint the magenta error fill instead so
      // you can see WHICH material is broken (the console already says which line).
      const bad = this.badShaders.has(m.shader);
      if (bad && !DEV) return;
      const buf = this.materialBuffers[i];
      const a = new Float32Array(32);
      a[0] = m.x; a[1] = m.y; a[2] = m.w; a[3] = m.h;
      a[4] = cssW; a[5] = cssH; a[6] = dpr; a[7] = time;
      a[8] = pointer[0]; a[9] = pointer[1]; a[10] = m.radius; a[11] = 0;
      if (!bad) {
        if (m.uniforms.length > 16 && !this.warnedUniforms.has(m.shader)) {
          this.warnedUniforms.add(m.shader);
          console.warn(`[kussetsu] material 'uniforms' has ${m.uniforms.length} floats; only the first 16 (u.c0..u.c3) are uploaded — the rest are ignored.`);
        }
        for (let k = 0; k < 16; k++) a[12 + k] = m.uniforms[k] ?? 0;
      }
      this.device.queue.writeBuffer(buf, 0, a);
      const pipeline = this.getMaterialPipeline(bad ? ERROR_MATERIAL : m.shader);
      const bg = this.device.createBindGroup({
        layout: this.materialBGL,
        entries: [{ binding: 0, resource: { buffer: buf } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: this.backdropView! }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.draw(6);
    });
    pass.end();
  }

  // One instanced additive draw for the whole particle field (into an existing pass).
  private drawParticles(pass: GPURenderPassEncoder, batch: ParticleBatch) {
    const floats = batch.count * 8;
    const buf = this.device.createBuffer({ size: floats * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(buf, 0, batch.data, 0, floats);
    pass.setPipeline(this.particlePipeline);
    pass.setBindGroup(0, this.particleVpBindGroup);
    pass.setVertexBuffer(0, buf);
    pass.draw(6, batch.count);
    this.pendingBuffers.push(buf);
  }

  // Bloom post-process: extract+blur the scene's bright pixels to a quarter-res texture,
  // then add them back over the canvas. Two passes, one small texture.
  private bloom(encoder: GPUCommandEncoder, canvasView: GPUTextureView, fbw: number, fbh: number, rectFb: [number, number, number, number]) {
    const THRESHOLD = 0.6, SPREAD = 2.2, INTENSITY = 1.2;
    this.device.queue.writeBuffer(this.bloomExtractU, 0, new Float32Array([1 / fbw, 1 / fbh, THRESHOLD, SPREAD]));
    const exBG = this.device.createBindGroup({
      layout: this.bloomExtractPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: this.sceneView! }, { binding: 2, resource: { buffer: this.bloomExtractU } }],
    });
    const pe = encoder.beginRenderPass({ colorAttachments: [{ view: this.brightView!, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }] });
    pe.setPipeline(this.bloomExtractPipeline);
    pe.setBindGroup(0, exBG);
    pe.draw(3);
    pe.end();

    this.device.queue.writeBuffer(this.bloomCompositeU, 0, new Float32Array([INTENSITY, 0, 0, 0, rectFb[0], rectFb[1], rectFb[2], rectFb[3]]));
    const coBG = this.device.createBindGroup({
      layout: this.bloomCompositePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: this.sceneView! }, { binding: 2, resource: this.brightView! }, { binding: 3, resource: { buffer: this.bloomCompositeU } }],
    });
    const pc = encoder.beginRenderPass({ colorAttachments: [{ view: canvasView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
    pc.setPipeline(this.bloomCompositePipeline);
    pc.setBindGroup(0, coBG);
    pc.draw(3);
    pc.end();
  }

  /** Set a full-screen background shader (a `fn material(uv,px)->vec4f`, same template as
   *  props.material) rendered into the backdrop, so glass + everything composites over it. */
  setBackground(shader: string | null) {
    this.bgShader = shader;
  }

  // Public frame entry: a no-op once the device is lost, and a synchronous GPU throw mid-frame
  // (device lost before the async device.lost handler fires) is caught and routed to
  // onDeviceError instead of escaping the render loop / rAF callback.
  frame(rects: Rect[], texts: TextItem[], glass: GlassPanel[], fg?: { rects: Rect[]; texts: TextItem[] }, materials?: MaterialPanel[], info?: FrameInfo, shadows?: ShadowItem[], opacityGroups?: OpacityGroup[], images?: ImageItem[], overlays?: Overlay[]) {
    if (this.lost) return;
    try {
      this.frameImpl(rects, texts, glass, fg, materials, info, shadows, opacityGroups, images, overlays);
    } catch (e) {
      this.handleFrameError(e);
    }
  }

  private frameImpl(rects: Rect[], texts: TextItem[], glass: GlassPanel[], fg?: { rects: Rect[]; texts: TextItem[] }, materials?: MaterialPanel[], info?: FrameInfo, shadows?: ShadowItem[], opacityGroups?: OpacityGroup[], images?: ImageItem[], overlays?: Overlay[]) {
    const { cssWidth, cssHeight } = this.resize();
    const fbw = this.canvas.width;
    const fbh = this.canvas.height;
    const dpr = fbw / cssWidth;
    this.ensureBackdrop(fbw, fbh);
    this.imageTick++; // one LRU tick per FRAME (drawImages runs >1× — main PASS 1.9 + per-overlay)
    // identity camera — rects from collectRects() are already screen-space.
    this.device.queue.writeBuffer(this.vpBuffer, 0, new Float32Array([cssWidth, cssHeight, 0, 0, 0, 0, 1, 0]));

    const instanceBuffer = this.uploadRects(rects);
    const fgBuffer = fg ? this.uploadRects(fg.rects) : null;
    const shadowBuffer = shadows && shadows.length ? this.uploadShadows(shadows) : null;

    const encoder = this.device.createCommandEncoder();
    const canvasView = this.context.getCurrentTexture().createView();
    // With post-process on, the whole scene composites into sceneTex; bloom then writes the
    // canvas (masked to the region). Without it, everything renders straight to the canvas.
    const post = info?.post ?? null;
    const finalView = post ? this.sceneView! : canvasView;

    // PASS 0 — full-screen background shader INTO the backdrop, so glass refracts it. Uses the
    // material template (full-screen rect, radius 0); binding 2 is a dummy (it self-generates).
    if (this.bgShader) {
      const pipeline = this.getMaterialPipeline(this.bgShader);
      const a = new Float32Array(32);
      a[0] = 0; a[1] = 0; a[2] = cssWidth; a[3] = cssHeight; // rect = full screen
      a[4] = cssWidth; a[5] = cssHeight; a[6] = dpr; a[7] = info?.time ?? 0; // res + time
      a[8] = info?.pointer?.[0] ?? 0; a[9] = info?.pointer?.[1] ?? 0; a[10] = 0; a[11] = 0;
      a[12] = info?.bgScroll ?? 0; // u.c0.x — page scroll, so the bg can scroll with the page
      this.device.queue.writeBuffer(this.bgBuffer, 0, a);
      const bg = this.device.createBindGroup({
        layout: this.materialBGL,
        entries: [{ binding: 0, resource: { buffer: this.bgBuffer } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: this.backdropView2! }],
      });
      const p0 = encoder.beginRenderPass({ colorAttachments: [{ view: this.backdropView!, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
      p0.setPipeline(pipeline);
      p0.setBindGroup(0, bg);
      p0.draw(6);
      p0.end();
    }

    // PASS 1 — non-glass content (rects + glyphs) -> backdrop texture (load on top of bg if any)
    const p1 = encoder.beginRenderPass({
      colorAttachments: [{ view: this.backdropView!, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: this.bgShader ? "load" : "clear", storeOp: "store" }],
    });
    if (shadowBuffer) {
      // Shadows first → they sit BEHIND all PASS-1 content (and under glass, which composites later).
      p1.setPipeline(this.shadowPipeline);
      p1.setBindGroup(0, this.shadowVpBindGroup);
      p1.setVertexBuffer(0, shadowBuffer);
      p1.draw(6, shadows!.length);
    }
    if (instanceBuffer) {
      p1.setPipeline(this.rectPipeline);
      p1.setBindGroup(0, this.rectVpBindGroup);
      p1.setVertexBuffer(0, instanceBuffer);
      p1.draw(6, rects.length);
    }
    this.drawGlyphs(p1, texts); // Gap B: per-glyph atlas instances
    p1.end();

    // PASS 1.5 — GROUP OPACITY: each faded subtree renders at FULL alpha into a scratch texture
    // (so its internal overlaps composite correctly), then composites onto the backdrop scaled by
    // the group's opacity. Done here so groups sit over PASS-1 content and glass still refracts them.
    if (opacityGroups && opacityGroups.length) {
      for (const g of opacityGroups) {
        const gBuf = this.uploadRects(g.rects);
        const gp = encoder.beginRenderPass({ colorAttachments: [{ view: this.opacityView!, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }] });
        if (gBuf) {
          gp.setPipeline(this.rectPipeline);
          gp.setBindGroup(0, this.rectVpBindGroup);
          gp.setVertexBuffer(0, gBuf);
          gp.draw(6, g.rects.length);
        }
        this.drawGlyphs(gp, g.texts);
        gp.end();
        if (gBuf) this.pendingBuffers.push(gBuf);
        // composite the scratch onto the backdrop, faded by the group opacity (per-group uniform)
        const ub = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.device.queue.writeBuffer(ub, 0, new Float32Array([g.opacity, 0, 0, 0]));
        this.pendingBuffers.push(ub);
        const bg = this.device.createBindGroup({
          layout: this.alphaBlitPipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: this.opacityView! }, { binding: 2, resource: { buffer: ub } }],
        });
        const cp = encoder.beginRenderPass({ colorAttachments: [{ view: this.backdropView!, loadOp: "load", storeOp: "store" }] });
        cp.setPipeline(this.alphaBlitPipeline);
        cp.setBindGroup(0, bg);
        cp.draw(3);
        cp.end();
      }
    }

    // PASS 1.9 — images (textured rounded quads) onto the backdrop, over PASS-1 rects/glyphs but
    // still UNDER glass (so glass refracts them). Loads are async; only ready textures draw now.
    if (images && images.length) {
      const ip = encoder.beginRenderPass({ colorAttachments: [{ view: this.backdropView!, loadOp: "load", storeOp: "store" }] });
      this.drawImages(ip, images);
      ip.end();
    }

    // PASS 2 — composite glass over the backdrop (ping-pong = glass-over-glass) -> finalView.
    this.compositeGlass(encoder, glass, fbw, fbh, cssWidth, cssHeight, dpr, finalView);

    // PASS 2.5 — custom shader materials (can sample the backdrop).
    if (materials && materials.length) {
      this.drawMaterials(encoder, materials, cssWidth, cssHeight, dpr, info?.time ?? 0, info?.pointer ?? [0, 0], finalView);
    }

    // PASS 3 — foreground: a glass node's children, drawn ON the glass (crisp, not
    // refracted by it). loadOp "load" preserves what the prior passes drew into finalView.
    if (fg && (fgBuffer || fg.texts.length)) {
      const p3 = encoder.beginRenderPass({
        colorAttachments: [{ view: finalView, loadOp: "load", storeOp: "store" }],
      });
      if (fgBuffer) {
        p3.setPipeline(this.rectPipeline);
        p3.setBindGroup(0, this.rectVpBindGroup);
        p3.setVertexBuffer(0, fgBuffer);
        p3.draw(6, fg.rects.length);
      }
      this.drawGlyphs(p3, fg.texts);
      p3.end();
    }

    // PASS 4 — particles (additive, on top of the scene).
    if (info?.particles && info.particles.count > 0) {
      const pp = encoder.beginRenderPass({ colorAttachments: [{ view: finalView, loadOp: "load", storeOp: "store" }] });
      this.drawParticles(pp, info.particles);
      pp.end();
    }

    // PASS 4.5 — OVERLAYS (style.zIndex): z-lifted subtrees painted on top of all scene content,
    // in ascending z order (last = topmost). Each draws its own shadows → rects → glyphs → images.
    if (overlays && overlays.length) this.drawOverlays(encoder, finalView, overlays);
    this.evictImages(this.imageTick); // once per frame, AFTER all drawImages (main + overlays) marked usage

    // PASS 5 — post-process bloom: sceneTex -> canvas, masked to the region (CSS px -> fb px).
    if (post) {
      const r = post.rect;
      this.bloom(encoder, canvasView, fbw, fbh, [r[0] * dpr, r[1] * dpr, r[2] * dpr, r[3] * dpr]);
    }

    this.device.queue.submit([encoder.finish()]);
    instanceBuffer?.destroy();
    fgBuffer?.destroy();
    shadowBuffer?.destroy();
    for (const b of this.pendingBuffers) b.destroy();
    this.pendingBuffers.length = 0;
  }

  /** Upload the static node graph ONCE (WORLD coords, RECT instance layout). */
  setGraphNodes(instanceData: Float32Array, count: number) {
    if (count > this.nodeCap) {
      this.nodeBuffer?.destroy();
      this.nodeCap = Math.ceil(count * 1.2);
      this.nodeBuffer = this.device.createBuffer({ size: this.nodeCap * RECT_STRIDE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    this.device.queue.writeBuffer(this.nodeBuffer!, 0, instanceData, 0, count * FLOATS_PER_RECT);
    this.nodeCount = count;
  }

  /** Draw the uploaded node graph under `cam`, plus screen-space labels + glass.
   *  Per frame this is one instanced draw for ALL nodes + N label draws + glass. */
  frameGraph(cam: { tx: number; ty: number; scale: number }, texts: TextItem[], glass: GlassPanel[]) {
    if (this.lost) return;
    try {
      this.frameGraphImpl(cam, texts, glass);
    } catch (e) {
      this.handleFrameError(e);
    }
  }

  private frameGraphImpl(cam: { tx: number; ty: number; scale: number }, texts: TextItem[], glass: GlassPanel[]) {
    const { cssWidth, cssHeight } = this.resize();
    const fbw = this.canvas.width;
    const fbh = this.canvas.height;
    const dpr = fbw / cssWidth;
    this.ensureBackdrop(fbw, fbh);
    this.device.queue.writeBuffer(this.vpBuffer, 0, new Float32Array([cssWidth, cssHeight, 0, 0, cam.tx, cam.ty, cam.scale, 0]));

    const encoder = this.device.createCommandEncoder();
    const p1 = encoder.beginRenderPass({
      colorAttachments: [{ view: this.backdropView!, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
    });
    if (this.nodeCount && this.nodeBuffer) {
      p1.setPipeline(this.rectPipeline);
      p1.setBindGroup(0, this.rectVpBindGroup);
      p1.setVertexBuffer(0, this.nodeBuffer);
      p1.draw(6, this.nodeCount); // ALL 10k nodes — one instanced draw
    }
    this.drawGlyphs(p1, texts); // Gap B: per-glyph atlas instances
    p1.end();

    // composite glass over the backdrop (ping-pong = glass-over-glass).
    this.compositeGlass(encoder, glass, fbw, fbh, cssWidth, cssHeight, dpr, this.context.getCurrentTexture().createView());
    this.device.queue.submit([encoder.finish()]);
    for (const b of this.pendingBuffers) b.destroy();
    this.pendingBuffers.length = 0;
  }

  // A frame threw — almost always because the device was lost between the runtime's `stopped`
  // check and a GPU call (getCurrentTexture on a lost/unconfigured context, writeBuffer, submit).
  // Flip `lost` so further frames no-op, log it (don't swallow silently), and notify the runtime.
  private handleFrameError(e: unknown) {
    if (this.lost) return; // already handled (e.g. via the async device.lost)
    this.lost = true;
    const message = e instanceof Error ? e.message : String(e);
    console.error("[gpu-renderer] frame aborted (device lost?):", message);
    this.onDeviceError?.({ reason: "device-lost", message });
  }

  /** Release every GPU resource this Painter owns and destroy the device. MUST be called on
   *  teardown: a fresh GPUDevice is requested per mount and React StrictMode mounts twice, so
   *  without this each <GpuCanvas> mount leaks a device + the ~16MB glyph atlas + every texture,
   *  buffer, and pipeline. Idempotent; safe to call after the device is already lost. */
  destroy() {
    this.lost = true; // any in-flight / subsequent frame becomes a no-op
    // device.destroy() frees everything the device owns, but eagerly release the big resources
    // (the atlas alone is ~16MB) and drop our references so caches/buffers can be GC'd.
    this.atlasTex?.destroy();
    this.backdropTex?.destroy();
    this.backdropTex2?.destroy();
    this.sceneTex?.destroy();
    this.opacityTex?.destroy();
    this.brightTex?.destroy();
    for (const e of this.images.values()) e.tex?.destroy();
    this.images.clear();
    for (const b of [this.vpBuffer, this.bgBuffer, this.bloomExtractU, this.bloomCompositeU, this.nodeBuffer]) b?.destroy();
    for (const b of this.glassBuffers) b.destroy();
    for (const b of this.materialBuffers) b.destroy();
    for (const b of this.pendingBuffers) b.destroy();
    this.glassBuffers.length = 0;
    this.materialBuffers.length = 0;
    this.pendingBuffers.length = 0;
    this.glyphCache.clear();
    this.materialPipelines.clear();
    try {
      this.context?.unconfigure(); // release the canvas swap-chain
    } catch {
      // context may already be invalid after a device loss — ignore
    }
    this.device?.destroy();
  }
}
