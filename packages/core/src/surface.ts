import { getGpuContext, hasWebGPU } from "./device.js";
import { assembleShader } from "./wgsl.js";
import { computeLayout, FLOATS, type UniformLayout, type UniformField } from "./layout.js";
import type {
  Fallback,
  FallbackReason,
  ShaderOptions,
  ShaderSurface,
  TextureSource,
  UniformValue,
  Uniforms,
} from "./types.js";

const GLOBALS_FLOATS = 8; // resolution.xy, mouse.xy, time, scroll, dpr, pad
const GLOBALS_BYTES = GLOBALS_FLOATS * 4;

/**
 * Module-level cache of compiled pipeline + bind-group layout, keyed by the
 * assembled WGSL. Every glass panel uses the same shader, so the (slow, async)
 * pipeline compile happens once per shader instead of once per surface — so a
 * panel mounted later (e.g. a dialog opening) paints its glass immediately
 * rather than popping in when the compile finally finishes. The layout/pipeline
 * depend only on the shader + canvas format (one shared device), so they're
 * safe to share; per-surface buffers/textures/bind groups are still local.
 */
interface CachedPipeline {
  readonly pipeline: GPURenderPipeline;
  readonly bgl: GPUBindGroupLayout;
}
const pipelineCache = new Map<string, CachedPipeline>();

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

interface LoadedTexture {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly sampler: GPUSampler;
}

function sourceSize(src: Exclude<TextureSource, string>): [number, number] {
  if (src instanceof HTMLImageElement) return [src.naturalWidth || 1, src.naturalHeight || 1];
  if (src instanceof HTMLVideoElement) return [src.videoWidth || 1, src.videoHeight || 1];
  return [(src as { width: number }).width || 1, (src as { height: number }).height || 1];
}

async function loadTexture(device: GPUDevice, src: TextureSource): Promise<LoadedTexture> {
  let source: Exclude<TextureSource, string>;
  if (typeof src === "string") {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`failed to fetch texture "${src}" (${res.status})`);
    const blob = await res.blob();
    source = await createImageBitmap(blob, { colorSpaceConversion: "none" });
  } else if (src instanceof HTMLImageElement && !src.complete) {
    await src.decode();
    source = src;
  } else {
    source = src;
  }

  const [width, height] = sourceSize(source);
  const texture = device.createTexture({
    size: [width, height, 1],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source, flipY: false }, { texture }, [width, height]);
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  return { texture, view: texture.createView(), sampler };
}

function applyFallback(el: HTMLElement, fb: Fallback): void {
  switch (fb.kind) {
    case "css":
      el.style.background = fb.value;
      break;
    case "color":
      el.style.backgroundColor = fb.value;
      break;
    case "image":
      el.style.backgroundImage = `url("${fb.url}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      break;
    case "none":
      break;
  }
}

/**
 * Create a Kussetsu shader surface bound to `target`. The shader paints into a
 * per-element canvas inserted behind the element's content, so the element's
 * text, links and focus stay real DOM and scroll natively with the canvas.
 *
 * Returns synchronously; GPU setup is async. Until it is ready (or has fallen
 * back) the surface is inactive and `setUniforms` calls are buffered.
 */
export function createShaderSurface(
  target: HTMLElement,
  options: ShaderOptions,
): ShaderSurface {
  const fallback: Fallback = options.fallback ?? { kind: "none" };
  const reducedMotion = options.reducedMotion ?? "freeze";
  const posterTime = options.posterTime ?? 0;
  const pauseWhenOffscreen = options.pauseWhenOffscreen ?? true;
  const maxDpr = options.maxDpr ?? 2;
  const freeze = reducedMotion === "freeze" && prefersReducedMotion();

  // --- mutable state -------------------------------------------------------
  let destroyed = false;
  let active = false;
  let ready = false;
  let device: GPUDevice | null = null;
  let ctx: GPUCanvasContext | null = null;
  let pipeline: GPURenderPipeline | null = null;
  let bindGroup: GPUBindGroup | null = null;
  let globalsBuffer: GPUBuffer | null = null;
  let userBuffer: GPUBuffer | null = null;
  let layout: UniformLayout | null = null;
  const gpuTextures: GPUTexture[] = [];

  let rafId = 0;
  let looping = false;
  let dirtyUniforms = true;
  let visible = true;
  let startTime = 0;

  const globals = new Float32Array(GLOBALS_FLOATS);
  let userStore = new Float32Array(0);
  const pendingUniforms: Uniforms = { ...(options.uniforms ?? {}) };
  const mouse = { x: 0.5, y: 0.5 };

  // Snapshot inline styles we may overwrite, to restore on destroy.
  const prevStyle = {
    position: target.style.position,
    isolation: target.style.isolation,
  };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    pointerEvents: "none",
    zIndex: "-1",
  } satisfies Partial<CSSStyleDeclaration>);

  // --- helpers -------------------------------------------------------------

  function fail(reason: FallbackReason): void {
    if (destroyed) return;
    active = false;
    applyFallback(target, fallback);
    options.onFallback?.(reason);
  }

  function writeUniform(field: UniformField, value: UniformValue): void {
    const lanes = FLOATS[field.type];
    const base = field.offset / 4;
    if (typeof value === "number") {
      if (lanes !== 1)
        console.warn(`[kussetsu] uniform "${field.name}" is ${field.type}; got a scalar.`);
      userStore[base] = value;
    } else if (typeof value === "boolean") {
      userStore[base] = value ? 1 : 0;
    } else {
      const arr = value as ArrayLike<number>;
      if (arr.length !== lanes)
        console.warn(
          `[kussetsu] uniform "${field.name}" is ${field.type} (${lanes} floats); got ${arr.length}.`,
        );
      for (let i = 0; i < lanes; i++) userStore[base + i] = arr[i] ?? 0;
    }
  }

  function mergeUniforms(next: Uniforms): void {
    if (!layout) return;
    for (const key of Object.keys(next)) {
      const field = layout.byName.get(key);
      const value = next[key];
      if (!field) {
        console.warn(`[kussetsu] unknown uniform "${key}" — not declared with @uniform in the shader.`);
        continue;
      }
      if (value !== undefined) writeUniform(field, value);
    }
    dirtyUniforms = true;
  }

  function syncCanvasSize(): boolean {
    const dpr = Math.min(maxDpr, (globalThis.devicePixelRatio ?? 1));
    const w = Math.max(1, Math.round(target.clientWidth * dpr));
    const h = Math.max(1, Math.round(target.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }

  function draw(): void {
    if (!device || !ctx || !pipeline || !bindGroup || !globalsBuffer) return;

    syncCanvasSize();

    const rect = target.getBoundingClientRect();
    const vh = globalThis.innerHeight || 1;
    const progress = 1 - (rect.top + rect.height / 2) / vh;
    const scroll = Math.min(1, Math.max(0, progress));
    const t = freeze ? posterTime : (performance.now() - startTime) / 1000;

    globals[0] = canvas.width;
    globals[1] = canvas.height;
    globals[2] = mouse.x;
    globals[3] = mouse.y;
    globals[4] = t;
    globals[5] = scroll;
    globals[6] = Math.min(maxDpr, globalThis.devicePixelRatio ?? 1);
    globals[7] = 0;
    device.queue.writeBuffer(globalsBuffer, 0, globals);

    if (options.uniformsPerFrame) {
      const perFrame = options.uniformsPerFrame();
      if (perFrame) mergeUniforms(perFrame);
    }

    if (dirtyUniforms && userBuffer && userStore.length > 0) {
      device.queue.writeBuffer(userBuffer, 0, userStore);
      dirtyUniforms = false;
    }

    let view: GPUTextureView;
    try {
      view = ctx.getCurrentTexture().createView();
    } catch {
      fail("context-error");
      stopLoop();
      return;
    }

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  function loop(): void {
    if (!looping || destroyed) return;
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function startLoop(): void {
    if (looping || destroyed || !ready || !active) return;
    if (freeze) {
      draw(); // single static frame
      return;
    }
    if (pauseWhenOffscreen && !visible) return;
    looping = true;
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop(): void {
    looping = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // --- observers / input ---------------------------------------------------

  const resizeObserver = new ResizeObserver(() => {
    if (!ready || !active) return;
    if (freeze || !looping) draw(); // keep static/paused surfaces correct on resize
  });

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      visible = entry ? entry.isIntersecting : true;
      if (!ready || !active) return;
      if (visible) startLoop();
      else stopLoop();
    },
    { threshold: 0 },
  );

  function onPointerMove(e: PointerEvent): void {
    // Measure against the target's own rect using clientX/Y — NOT offsetX/Y.
    // offsetX/Y are relative to event.target, which is the topmost child under
    // the cursor (a heading, a list item, ...), so they make the pointer
    // uniform jump toward (0,0) whenever you hover a child element.
    // getBoundingClientRect also accounts for any CSS transform on the element.
    const rect = target.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    mouse.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / w));
    mouse.y = Math.min(1, Math.max(0, (e.clientY - rect.top) / h));
    if (freeze) draw(); // reflect pointer even when motion is frozen
  }

  // --- init ----------------------------------------------------------------

  function mountCanvas(): void {
    const computed = getComputedStyle(target);
    if (computed.position === "static") target.style.position = "relative";
    // Isolate so the z-index:-1 canvas paints behind this element's own
    // content but never escapes behind the rest of the page.
    target.style.isolation = "isolate";
    target.insertBefore(canvas, target.firstChild);
  }

  async function init(): Promise<void> {
    let assembled: ReturnType<typeof assembleShader>;
    try {
      assembled = assembleShader(options.wgsl);
    } catch (err) {
      console.error(err);
      fail("shader-error");
      return;
    }
    layout = computeLayout(assembled.decls);
    userStore = new Float32Array(layout.size / 4);

    if (!hasWebGPU()) {
      fail("no-webgpu");
      return;
    }
    const gpu = await getGpuContext();
    if (destroyed) return;
    if (!gpu) {
      fail("no-device");
      return;
    }
    device = gpu.device;

    device.lost.then((info) => {
      if (destroyed) return;
      console.warn(`[kussetsu] GPU device lost: ${info.message}`);
      stopLoop();
      fail("device-lost");
    });

    mountCanvas();
    const context = canvas.getContext("webgpu");
    if (!context) {
      fail("context-error");
      return;
    }
    ctx = context;
    ctx.configure({ device, format: gpu.format, alphaMode: "premultiplied" });

    const hasUser = assembled.decls.length > 0;

    // Compile the pipeline once per shader (shared across surfaces); reuse if we
    // already have it, so later-mounted panels paint instantly (no compile gap).
    let cacheEntry = pipelineCache.get(assembled.module);
    if (!cacheEntry) {
      device.pushErrorScope("validation");
      const shaderModule = device.createShaderModule({ code: assembled.module });
      const info = await shaderModule.getCompilationInfo();
      for (const m of info.messages) {
        if (m.type === "error") console.error(`[kussetsu] WGSL ${m.type}: ${m.message} (line ${m.lineNum})`);
      }

      const bglEntries: GPUBindGroupLayoutEntry[] = [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ];
      if (hasUser) {
        bglEntries.push({
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        });
      }
      for (const t of assembled.textures) {
        bglEntries.push({
          binding: t.binding,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        });
        bglEntries.push({
          binding: t.samplerBinding,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        });
      }
      const newBgl = device.createBindGroupLayout({ entries: bglEntries });
      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [newBgl] });

      let newPipeline: GPURenderPipeline | null = null;
      try {
        newPipeline = await device.createRenderPipelineAsync({
          layout: pipelineLayout,
          vertex: { module: shaderModule, entryPoint: "kussetsu_vs" },
          fragment: {
            module: shaderModule,
            entryPoint: "kussetsu_fs",
            targets: [{ format: gpu.format }],
          },
          primitive: { topology: "triangle-list" },
        });
      } catch (err) {
        console.error("[kussetsu] pipeline creation failed:", err);
      }
      const scopeError = await device.popErrorScope();
      if (destroyed) return;
      if (!newPipeline || scopeError) {
        if (scopeError) console.error(`[kussetsu] ${scopeError.message}`);
        fail("shader-error");
        return;
      }
      cacheEntry = { pipeline: newPipeline, bgl: newBgl };
      pipelineCache.set(assembled.module, cacheEntry);
    }
    if (destroyed) return;

    pipeline = cacheEntry.pipeline;
    const bgl = cacheEntry.bgl;

    // Load texture sources declared with @texture.
    const loaded: LoadedTexture[] = [];
    try {
      for (const t of assembled.textures) {
        const src = options.textures?.[t.name];
        if (src === undefined) throw new Error(`no source provided for @texture "${t.name}"`);
        const lt = await loadTexture(device, src);
        gpuTextures.push(lt.texture);
        loaded.push(lt);
      }
    } catch (err) {
      console.error("[kussetsu] texture load failed:", err);
      fail("texture-error");
      return;
    }
    if (destroyed) return;

    globalsBuffer = device.createBuffer({
      size: GLOBALS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: globalsBuffer } }];
    if (hasUser) {
      userBuffer = device.createBuffer({
        size: layout.size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      entries.push({ binding: 1, resource: { buffer: userBuffer } });
    }
    assembled.textures.forEach((t, i) => {
      const lt = loaded[i];
      if (!lt) return;
      entries.push({ binding: t.binding, resource: lt.view });
      entries.push({ binding: t.samplerBinding, resource: lt.sampler });
    });
    bindGroup = device.createBindGroup({ layout: bgl, entries });

    // Apply initial / buffered uniforms now that the layout exists.
    mergeUniforms(pendingUniforms);

    syncCanvasSize();
    resizeObserver.observe(target);
    if (pauseWhenOffscreen) intersectionObserver.observe(target);
    target.addEventListener("pointermove", onPointerMove);

    ready = true;
    active = true;
    startTime = performance.now();
    options.onReady?.();
    startLoop();
  }

  void init();

  // --- public surface ------------------------------------------------------

  return {
    get active() {
      return active;
    },
    setUniforms(next: Uniforms) {
      if (destroyed) return;
      if (ready) mergeUniforms(next);
      else Object.assign(pendingUniforms, next);
      if (ready && (freeze || !looping)) draw();
    },
    pause() {
      stopLoop();
    },
    resume() {
      startLoop();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      target.removeEventListener("pointermove", onPointerMove);
      userBuffer?.destroy();
      globalsBuffer?.destroy();
      for (const tex of gpuTextures) tex.destroy();
      try {
        ctx?.unconfigure();
      } catch {
        /* ignore */
      }
      canvas.remove();
      target.style.position = prevStyle.position;
      target.style.isolation = prevStyle.isolation;
      active = false;
    },
  };
}
