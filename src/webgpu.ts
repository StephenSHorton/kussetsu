// WebGPU 2D painter. TWO passes now:
//   1) render all non-glass content (rects + text) to an offscreen BACKDROP texture
//   2) blit the backdrop to the canvas, then draw glass panels that SAMPLE the
//      backdrop with refraction/blur/rim — i.e. glass refracts whatever is behind
//      it, anywhere on screen, because we own the whole framebuffer.
import type { RGBA } from "./scene";

export type ClipRect = [number, number, number, number]; // x,y,w,h screen px; w<=0 => no clip

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  color: RGBA;
  clip?: ClipRect;
}

export interface TextItem {
  x: number;
  y: number;
  text: string;
  size: number;
  weight: number;
  color: RGBA;
  clip?: ClipRect;
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
  let cov = textureSample(atlas, samp, in.uv).a;
  let a = cov * in.color.a * clipAlpha(in.screenPos, in.clip);
  return vec4f(in.color.rgb * a, a);
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
  @location(4) screenPos: vec2f, @location(5) clip: vec4f,
};
const QUAD = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) rect: vec4f, @location(1) radius: f32, @location(2) color: vec4f, @location(3) clip: vec4f) -> VSOut {
  let q = QUAD[vi];
  let worldPx = rect.xy + q * rect.zw;
  let screenPx = worldPx * vp.cam.z + vp.cam.xy;
  let size = vp.sizePad.xy;
  let ndc = vec2f(screenPx.x/size.x*2.0-1.0, -(screenPx.y/size.y*2.0-1.0));
  var o: VSOut;
  o.pos = vec4f(ndc,0,1); o.local = (q-0.5)*rect.zw; o.half = rect.zw*0.5;
  o.radius = min(radius, min(o.half.x, o.half.y)); o.color = color;
  o.screenPos = screenPx; o.clip = clip;
  return o;
}
fn sdRoundBox(p: vec2f, b: vec2f, r: f32) -> f32 { let q = abs(p)-b+vec2f(r); return length(max(q,vec2f(0.0)))+min(max(q.x,q.y),0.0)-r; }
// Clip rect alpha (CSS px), ~1px AA. clip.z<=0 => no clip.
fn clipAlpha(p: vec2f, clip: vec4f) -> f32 {
  if (clip.z <= 0.0) { return 1.0; }
  let x1 = clip.x + clip.z; let y1 = clip.y + clip.w;
  let ax = smoothstep(clip.x - 0.5, clip.x + 0.5, p.x) * (1.0 - smoothstep(x1 - 0.5, x1 + 0.5, p.x));
  let ay = smoothstep(clip.y - 0.5, clip.y + 0.5, p.y) * (1.0 - smoothstep(y1 - 0.5, y1 + 0.5, p.y));
  return ax * ay;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let d = sdRoundBox(in.local, in.half, in.radius);
  let aa = fwidth(d);
  let a = in.color.a * (1.0 - smoothstep(-aa, aa, d)) * clipAlpha(in.screenPos, in.clip);
  return vec4f(in.color.rgb * a, a);
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

// Refractive glass: samples the backdrop in SCREEN space, bends it at the rim.
const GLASS_WGSL = /* wgsl */ `
struct GU {
  rect: vec4f,   // x,y,w,h  CSS px
  fbvp: vec4f,   // fb.x, fb.y (physical px),  vp.x, vp.y (CSS px)
  params: vec4f, // refraction, blur, tint, rim
  tint: vec4f,   // rgba
  misc: vec4f,   // dpr, radius, brighten, specular
  params2: vec4f,// dispersion, _, _, _
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

// [x,y,w,h][radius,_,_,_][r,g,b,a][clipX,clipY,clipW,clipH]
export const FLOATS_PER_RECT = 16;
const RECT_STRIDE = FLOATS_PER_RECT * 4;

// Glyph atlas: glyphs are rasterized once at a BASE size (supersampled) and scaled
// per display size. Crisp for UI text; only soft when zoomed past BASE.
const GLYPH_BASE = 44; // CSS px the atlas glyph is measured at
const GLYPH_SS = 2; // atlas supersample
const GLYPH_PAD = 2; // CSS px padding around each glyph cell (overhang)
const GLYPH_ASCENT = Math.round(GLYPH_BASE * 0.98);
const ATLAS_SIZE = 1024;
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
  private blitPipeline!: GPURenderPipeline;
  private glassPipeline!: GPURenderPipeline;
  private vpBuffer!: GPUBuffer;
  private rectVpBindGroup!: GPUBindGroup;
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
  private glyphScratch = new Float32Array(0);
  private pendingBuffers: GPUBuffer[] = []; // transient per-pass buffers, freed after submit

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  static async create(canvas: HTMLCanvasElement): Promise<Painter> {
    if (!navigator.gpu) throw new Error("WebGPU not supported (navigator.gpu is undefined)");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No GPUAdapter");
    const p = new Painter(canvas);
    p.device = await adapter.requestDevice();
    p.device.lost.then((info) => console.error("WebGPU device lost:", info.reason, info.message));
    p.context = canvas.getContext("webgpu") as GPUCanvasContext;
    p.format = navigator.gpu.getPreferredCanvasFormat();
    p.context.configure({ device: p.device, format: p.format, alphaMode: "premultiplied" });
    p.build();
    p.resize();
    return p;
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
              { shaderLocation: 1, offset: 16, format: "float32" }, // radius
              { shaderLocation: 2, offset: 32, format: "float32x4" }, // color
              { shaderLocation: 3, offset: 48, format: "float32x4" }, // clip
            ],
          },
        ],
      },
      fragment: { module: rectModule, entryPoint: "fs", targets: [{ format, blend: PREMUL_BLEND }] },
      primitive: { topology: "triangle-list" },
    });

    const blitModule = device.createShaderModule({ code: BLIT_WGSL });
    this.blitPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: blitModule, entryPoint: "vs" },
      fragment: { module: blitModule, entryPoint: "fs", targets: [{ format }] },
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
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

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
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
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
  }

  // Composite glass over the backdrop with ping-pong, so each panel refracts the
  // accumulated result (glass-over-glass). Builds glass uniforms + bind groups.
  private compositeGlass(encoder: GPUCommandEncoder, glass: GlassPanel[], fbw: number, fbh: number, cssWidth: number, cssHeight: number, dpr: number) {
    const canvasView = this.context.getCurrentTexture().createView();
    const clear = { r: 0, g: 0, b: 0, a: 0 };

    while (this.glassBuffers.length < glass.length) {
      this.glassBuffers.push(this.device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    }
    glass.forEach((g, i) => {
      const u = new Float32Array(24);
      u[0] = g.x; u[1] = g.y; u[2] = g.w; u[3] = g.h;
      u[4] = fbw; u[5] = fbh; u[6] = cssWidth; u[7] = cssHeight;
      u[8] = g.refraction; u[9] = g.blur; u[10] = g.tint; u[11] = g.rim;
      u[12] = g.tintColor[0]; u[13] = g.tintColor[1]; u[14] = g.tintColor[2]; u[15] = g.tintColor[3];
      u[16] = dpr; u[17] = g.radius; u[18] = g.brighten; u[19] = g.specular;
      u[20] = g.dispersion;
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
  private getGlyph(char: string, weight: number): GlyphEntry {
    const key = `${weight}|${char}`;
    const cached = this.glyphCache.get(key);
    if (cached) return cached;
    const font = `${weight} ${GLYPH_BASE}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    this.glyph2d.font = font;
    const advance = this.glyph2d.measureText(char).width;
    const cellW = Math.max(1, Math.ceil(advance) + GLYPH_PAD * 2);
    const cellH = Math.ceil(GLYPH_BASE * 1.3);
    const aw = cellW * GLYPH_SS;
    const ah = cellH * GLYPH_SS;
    if (this.packX + aw > ATLAS_SIZE) {
      this.packX = 1;
      this.packY += this.packRowH + 1;
      this.packRowH = 0;
    }
    if (this.packY + ah > ATLAS_SIZE || char === " " || advance <= 0) {
      // atlas full or whitespace: cache an empty entry (advance only)
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
    o.fillText(char, GLYPH_PAD, GLYPH_ASCENT);
    this.device.queue.copyExternalImageToTexture({ source: off, flipY: false }, { texture: this.atlasTex, origin: { x: px, y: py }, premultipliedAlpha: true }, [aw, ah]);
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
      const scale = t.size / GLYPH_BASE;
      const cl = t.clip;
      let penX = 0;
      for (const ch of t.text) {
        const e = this.getGlyph(ch, t.weight);
        if (e.u1 > e.u0) {
          const o = n * FLOATS_PER_GLYPH;
          data[o] = t.x + (penX - GLYPH_PAD) * scale;
          data[o + 1] = t.y;
          data[o + 2] = e.cellW * scale;
          data[o + 3] = e.cellH * scale;
          data[o + 4] = e.u0; data[o + 5] = e.v0; data[o + 6] = e.u1; data[o + 7] = e.v1;
          data[o + 8] = t.color[0]; data[o + 9] = t.color[1]; data[o + 10] = t.color[2]; data[o + 11] = t.color[3];
          data[o + 12] = cl ? cl[0] : 0; data[o + 13] = cl ? cl[1] : 0; data[o + 14] = cl ? cl[2] : 0; data[o + 15] = cl ? cl[3] : 0;
          n++;
        }
        penX += e.advance;
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
    rects.forEach((r, i) => {
      const o = i * FLOATS_PER_RECT;
      data[o] = r.x; data[o + 1] = r.y; data[o + 2] = r.w; data[o + 3] = r.h;
      data[o + 4] = r.radius;
      data[o + 8] = r.color[0]; data[o + 9] = r.color[1]; data[o + 10] = r.color[2]; data[o + 11] = r.color[3];
      if (r.clip) { data[o + 12] = r.clip[0]; data[o + 13] = r.clip[1]; data[o + 14] = r.clip[2]; data[o + 15] = r.clip[3]; }
    });
    this.device.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  frame(rects: Rect[], texts: TextItem[], glass: GlassPanel[], fg?: { rects: Rect[]; texts: TextItem[] }) {
    const { cssWidth, cssHeight } = this.resize();
    const fbw = this.canvas.width;
    const fbh = this.canvas.height;
    const dpr = fbw / cssWidth;
    this.ensureBackdrop(fbw, fbh);
    // identity camera — rects from collectRects() are already screen-space.
    this.device.queue.writeBuffer(this.vpBuffer, 0, new Float32Array([cssWidth, cssHeight, 0, 0, 0, 0, 1, 0]));

    const instanceBuffer = this.uploadRects(rects);
    const fgBuffer = fg ? this.uploadRects(fg.rects) : null;

    const encoder = this.device.createCommandEncoder();

    // PASS 1 — non-glass content (rects + glyphs) -> backdrop texture
    const p1 = encoder.beginRenderPass({
      colorAttachments: [{ view: this.backdropView!, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
    });
    if (instanceBuffer) {
      p1.setPipeline(this.rectPipeline);
      p1.setBindGroup(0, this.rectVpBindGroup);
      p1.setVertexBuffer(0, instanceBuffer);
      p1.draw(6, rects.length);
    }
    this.drawGlyphs(p1, texts); // Gap B: per-glyph atlas instances
    p1.end();

    // PASS 2 — composite glass over the backdrop (ping-pong = glass-over-glass).
    this.compositeGlass(encoder, glass, fbw, fbh, cssWidth, cssHeight, dpr);

    // PASS 3 — foreground: a glass node's children, drawn ON the glass (crisp, not
    // refracted by it). getCurrentTexture() returns the same canvas texture as the
    // glass pass, so loadOp "load" preserves what compositeGlass drew.
    if (fg && (fgBuffer || fg.texts.length)) {
      const p3 = encoder.beginRenderPass({
        colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: "load", storeOp: "store" }],
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

    this.device.queue.submit([encoder.finish()]);
    instanceBuffer?.destroy();
    fgBuffer?.destroy();
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
    this.compositeGlass(encoder, glass, fbw, fbh, cssWidth, cssHeight, dpr);
    this.device.queue.submit([encoder.finish()]);
    for (const b of this.pendingBuffers) b.destroy();
    this.pendingBuffers.length = 0;
  }
}
