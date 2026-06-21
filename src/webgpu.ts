// WebGPU 2D painter. TWO passes now:
//   1) render all non-glass content (rects + text) to an offscreen BACKDROP texture
//   2) blit the backdrop to the canvas, then draw glass panels that SAMPLE the
//      backdrop with refraction/frost/rim — i.e. glass refracts whatever is behind
//      it, anywhere on screen, because we own the whole framebuffer.
import type { RGBA } from "./scene";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  color: RGBA;
}

export interface TextItem {
  x: number;
  y: number;
  text: string;
  size: number;
  weight: number;
  color: RGBA;
}

export interface GlassPanel {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  refraction: number; // fraction of panel size the rim bends the backdrop
  frost: number; // backdrop blur radius, CSS px
  tint: number; // 0..1 mix toward tintColor
  tintColor: RGBA;
  rim: number; // rim band width, CSS px
}

const PREMUL_BLEND: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

const RECT_WGSL = /* wgsl */ `
struct Viewport { size: vec2f };
@group(0) @binding(0) var<uniform> vp: Viewport;
struct VSOut { @builtin(position) pos: vec4f, @location(0) local: vec2f, @location(1) half: vec2f, @location(2) radius: f32, @location(3) color: vec4f };
const QUAD = array<vec2f, 6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) rect: vec4f, @location(1) radius: f32, @location(2) color: vec4f) -> VSOut {
  let q = QUAD[vi];
  let px = rect.xy + q * rect.zw;
  let clip = vec2f(px.x/vp.size.x*2.0-1.0, -(px.y/vp.size.y*2.0-1.0));
  var o: VSOut;
  o.pos = vec4f(clip,0,1); o.local = (q-0.5)*rect.zw; o.half = rect.zw*0.5;
  o.radius = min(radius, min(o.half.x, o.half.y)); o.color = color;
  return o;
}
fn sdRoundBox(p: vec2f, b: vec2f, r: f32) -> f32 { let q = abs(p)-b+vec2f(r); return length(max(q,vec2f(0.0)))+min(max(q.x,q.y),0.0)-r; }
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let d = sdRoundBox(in.local, in.half, in.radius);
  let aa = fwidth(d);
  let a = in.color.a * (1.0 - smoothstep(-aa, aa, d));
  return vec4f(in.color.rgb * a, a);
}
`;

const TEXT_WGSL = /* wgsl */ `
struct Viewport { size: vec2f };
struct QuadRect { rect: vec4f };
@group(0) @binding(0) var<uniform> vp: Viewport;
@group(0) @binding(1) var<uniform> qr: QuadRect;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex: texture_2d<f32>;
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
const Q = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1), vec2f(0,1),vec2f(1,0),vec2f(1,1));
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  let q = Q[vi];
  let px = qr.rect.xy + q*qr.rect.zw;
  let clip = vec2f(px.x/vp.size.x*2.0-1.0, -(px.y/vp.size.y*2.0-1.0));
  var o: VSOut; o.pos = vec4f(clip,0,1); o.uv = q; return o;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f { return textureSample(tex, samp, in.uv); }
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
  params: vec4f, // refraction, frost, tint, rim
  tint: vec4f,   // rgba
  misc: vec4f,   // dpr, radius, _, _
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
  let frost = u.params.y;
  let tintAmt = u.params.z;
  let rim = u.params.w;
  let edge = smoothstep(rim, 0.0, -d); // 1 at rim, 0 in interior

  // refraction: displace the backdrop sample (CSS px -> framebuffer px -> UV)
  let offCss = n * edge * refraction * (half.x + half.y);
  let suv = screenUV + offCss * dpr / fb;

  var col = textureSample(backdrop, samp, suv).rgb;
  if (frost > 0.001) {
    let r = frost * dpr / fb;
    var acc = col;
    acc += textureSample(backdrop, samp, suv + vec2f(r.x, 0.0)).rgb;
    acc += textureSample(backdrop, samp, suv - vec2f(r.x, 0.0)).rgb;
    acc += textureSample(backdrop, samp, suv + vec2f(0.0, r.y)).rgb;
    acc += textureSample(backdrop, samp, suv - vec2f(0.0, r.y)).rgb;
    acc += textureSample(backdrop, samp, suv + r*0.7).rgb;
    acc += textureSample(backdrop, samp, suv - r*0.7).rgb;
    col = acc / 7.0;
  }

  col = mix(col, u.tint.rgb, tintAmt);
  col *= 1.06;

  // rim highlight + top sheen — the glassy edge
  let rimHi = smoothstep(2.0, 0.0, abs(d));
  let lit = clamp(0.5 - 0.6*n.y - 0.2*n.x, 0.0, 1.0);
  col += vec3f(1.0) * rimHi * (0.14 + 0.35*lit);
  let ty = in.local.y / half.y * 0.5 + 0.5; // 0 top, 1 bottom
  col += vec3f(1.0) * smoothstep(0.42, 0.0, ty) * 0.06;

  let a = shape;
  return vec4f(col * a, a);
}
`;

const FLOATS_PER_RECT = 12;
const RECT_STRIDE = FLOATS_PER_RECT * 4;

function rgbaCss(c: RGBA): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
}

export class Painter {
  device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private canvas: HTMLCanvasElement;

  private rectPipeline!: GPURenderPipeline;
  private textPipeline!: GPURenderPipeline;
  private blitPipeline!: GPURenderPipeline;
  private glassPipeline!: GPURenderPipeline;
  private vpBuffer!: GPUBuffer;
  private rectVpBindGroup!: GPUBindGroup;
  private sampler!: GPUSampler;

  private backdropTex: GPUTexture | null = null;
  private backdropView: GPUTextureView | null = null;
  private blitBindGroup: GPUBindGroup | null = null;
  private backdropW = 0;
  private backdropH = 0;

  private texCache = new Map<string, { view: GPUTextureView; cssW: number; cssH: number }>();
  private textRectBuffers: GPUBuffer[] = [];
  private glassBuffers: GPUBuffer[] = [];

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
              { shaderLocation: 0, offset: 0, format: "float32x4" },
              { shaderLocation: 1, offset: 16, format: "float32" },
              { shaderLocation: 2, offset: 32, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: { module: rectModule, entryPoint: "fs", targets: [{ format, blend: PREMUL_BLEND }] },
      primitive: { topology: "triangle-list" },
    });

    const textModule = device.createShaderModule({ code: TEXT_WGSL });
    this.textPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: textModule, entryPoint: "vs" },
      fragment: { module: textModule, entryPoint: "fs", targets: [{ format, blend: PREMUL_BLEND }] },
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

    this.vpBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.rectVpBindGroup = device.createBindGroup({
      layout: this.rectPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.vpBuffer } }],
    });
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
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
    this.backdropTex = this.device.createTexture({
      size: [w, h],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.backdropView = this.backdropTex.createView();
    this.backdropW = w;
    this.backdropH = h;
    this.blitBindGroup = this.device.createBindGroup({
      layout: this.blitPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.backdropView },
      ],
    });
  }

  private getText(item: TextItem) {
    const key = `${item.size}|${item.weight}|${rgbaCss(item.color)}|${item.text}`;
    let entry = this.texCache.get(key);
    if (entry) return entry;
    const dpr = window.devicePixelRatio || 1;
    const font = `${item.weight} ${item.size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const measure = document.createElement("canvas").getContext("2d")!;
    measure.font = font;
    const m = measure.measureText(item.text);
    const cssW = Math.ceil(m.width) + 2;
    const ascent = m.actualBoundingBoxAscent || item.size * 0.8;
    const descent = m.actualBoundingBoxDescent || item.size * 0.2;
    const cssH = Math.ceil(ascent + descent) + 2;
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.round(cssW * dpr));
    off.height = Math.max(1, Math.round(cssH * dpr));
    const ctx = off.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.font = font;
    ctx.fillStyle = rgbaCss(item.color);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(item.text, 1, ascent + 1);
    const texture = this.device.createTexture({
      size: [off.width, off.height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source: off, flipY: false }, { texture, premultipliedAlpha: true }, [off.width, off.height]);
    entry = { view: texture.createView(), cssW, cssH };
    this.texCache.set(key, entry);
    return entry;
  }

  frame(rects: Rect[], texts: TextItem[], glass: GlassPanel[]) {
    const { cssWidth, cssHeight } = this.resize();
    const fbw = this.canvas.width;
    const fbh = this.canvas.height;
    const dpr = fbw / cssWidth;
    this.ensureBackdrop(fbw, fbh);
    this.device.queue.writeBuffer(this.vpBuffer, 0, new Float32Array([cssWidth, cssHeight, 0, 0]));

    // rect instances
    let instanceBuffer: GPUBuffer | null = null;
    if (rects.length) {
      instanceBuffer = this.device.createBuffer({ size: rects.length * RECT_STRIDE, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      const data = new Float32Array(rects.length * FLOATS_PER_RECT);
      rects.forEach((r, i) => {
        const o = i * FLOATS_PER_RECT;
        data[o] = r.x; data[o + 1] = r.y; data[o + 2] = r.w; data[o + 3] = r.h;
        data[o + 4] = r.radius;
        data[o + 8] = r.color[0]; data[o + 9] = r.color[1]; data[o + 10] = r.color[2]; data[o + 11] = r.color[3];
      });
      this.device.queue.writeBuffer(instanceBuffer, 0, data);
    }

    // text bind groups
    const textEntries = texts.map((t) => this.getText(t));
    while (this.textRectBuffers.length < texts.length) {
      this.textRectBuffers.push(this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    }
    const textBindGroups: GPUBindGroup[] = texts.map((t, i) => {
      const e = textEntries[i];
      this.device.queue.writeBuffer(this.textRectBuffers[i], 0, new Float32Array([t.x, t.y, e.cssW, e.cssH]));
      return this.device.createBindGroup({
        layout: this.textPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.vpBuffer } },
          { binding: 1, resource: { buffer: this.textRectBuffers[i] } },
          { binding: 2, resource: this.sampler },
          { binding: 3, resource: e.view },
        ],
      });
    });

    // glass uniforms + bind groups (sample the backdrop)
    while (this.glassBuffers.length < glass.length) {
      this.glassBuffers.push(this.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    }
    const glassBindGroups: GPUBindGroup[] = glass.map((g, i) => {
      const u = new Float32Array(20);
      u[0] = g.x; u[1] = g.y; u[2] = g.w; u[3] = g.h;
      u[4] = fbw; u[5] = fbh; u[6] = cssWidth; u[7] = cssHeight;
      u[8] = g.refraction; u[9] = g.frost; u[10] = g.tint; u[11] = g.rim;
      u[12] = g.tintColor[0]; u[13] = g.tintColor[1]; u[14] = g.tintColor[2]; u[15] = g.tintColor[3];
      u[16] = dpr; u[17] = g.radius;
      this.device.queue.writeBuffer(this.glassBuffers[i], 0, u);
      return this.device.createBindGroup({
        layout: this.glassPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.glassBuffers[i] } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: this.backdropView! },
        ],
      });
    });

    const encoder = this.device.createCommandEncoder();

    // PASS 1 — non-glass content -> backdrop texture
    const p1 = encoder.beginRenderPass({
      colorAttachments: [{ view: this.backdropView!, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
    });
    if (instanceBuffer) {
      p1.setPipeline(this.rectPipeline);
      p1.setBindGroup(0, this.rectVpBindGroup);
      p1.setVertexBuffer(0, instanceBuffer);
      p1.draw(6, rects.length);
    }
    textBindGroups.forEach((bg) => {
      p1.setPipeline(this.textPipeline);
      p1.setBindGroup(0, bg);
      p1.draw(6);
    });
    p1.end();

    // PASS 2 — blit backdrop to canvas, then glass on top
    const p2 = encoder.beginRenderPass({
      colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
    });
    p2.setPipeline(this.blitPipeline);
    p2.setBindGroup(0, this.blitBindGroup!);
    p2.draw(3);
    glassBindGroups.forEach((bg) => {
      p2.setPipeline(this.glassPipeline);
      p2.setBindGroup(0, bg);
      p2.draw(6);
    });
    p2.end();

    this.device.queue.submit([encoder.finish()]);
    instanceBuffer?.destroy();
  }
}
