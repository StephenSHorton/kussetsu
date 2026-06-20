import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { createShaderSurface, KUSSETSU_GLASS, type ShaderSurface, type Uniforms } from "@kussetsu/core";
import { GlassSceneContext, GlassThemeContext } from "./context";

const DEFAULT_RGB: [number, number, number] = [0.902, 0.922, 0.949];

/** Parse any CSS color string to 0..1 RGB via the canvas fillStyle trick. */
function parseColor(c: string): [number, number, number] {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return DEFAULT_RGB;
    ctx.fillStyle = c;
    const s = ctx.fillStyle;
    if (s[0] === "#") {
      const n = parseInt(s.slice(1, 7), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    const nums = s.match(/[\d.]+/g);
    if (nums && nums.length >= 3) return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255];
    return DEFAULT_RGB;
  } catch {
    return DEFAULT_RGB;
  }
}

function cssGlassFallback(el: HTMLElement) {
  el.style.backdropFilter = "blur(8px) saturate(150%)";
  (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter =
    "blur(8px) saturate(150%)";
  el.style.background = "rgba(255,255,255,0.10)";
}

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Corner radius in CSS px. Defaults to the element's computed border-radius. */
  radius?: number;
  /** Frost amount (0 = perfectly clear, see-through glass). */
  blur?: number;
  /** Backdrop blur — a clean depth-of-field blur of the wallpaper (no frosting). */
  bgBlur?: number;
  /** Edge bend strength. */
  refraction?: number;
  /** Chromatic split at the rim. */
  dispersion?: number;
  /** Rim refraction band width. */
  rim?: number;
  /** Glass color (any CSS color). Drives both the tint wash and the solid frost. */
  color?: string;
  /** Tint amount toward `color` (0 = none). */
  tint?: number;
  /** Highlight intensity. */
  specular?: number;
  /** Make the panel draggable. */
  drag?: boolean;
}

/**
 * A refractive glass panel. Drop it inside a <GlassScene>; it refracts the
 * scene's captured backdrop at its own rect while its children render as crisp,
 * accessible DOM on top.
 */
export function GlassPanel({
  children,
  radius,
  blur = 0,
  bgBlur = 0,
  refraction = 0.05,
  dispersion = 0.006,
  rim = 0.05,
  color = "#e6ebf2",
  tint = 0.04,
  specular = 1,
  drag = false,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerEnter,
  onPointerLeave,
  ...rest
}: GlassPanelProps) {
  const scene = useContext(GlassSceneContext);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  // A GlassTheme (if any ancestor provides one) overrides the material props, so
  // a control panel can retune a whole subtree of glass live. Color is excluded.
  const theme = useContext(GlassThemeContext);
  const effRadius = theme?.radius ?? radius;
  const effBlur = theme?.blur ?? blur;
  const effBgBlur = theme?.bgBlur ?? bgBlur;
  const effRefraction = theme?.refraction ?? refraction;
  const effDispersion = theme?.dispersion ?? dispersion;
  const effRim = theme?.rim ?? rim;
  const effTint = theme?.tint ?? tint;
  const effSpecular = theme?.specular ?? specular;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<ShaderSurface | null>(null);
  const resolvedRadiusRef = useRef(24);
  const hoverRef = useRef(0);
  const dragRef = useRef({ dragging: false, sx: 0, sy: 0, bx: 0, by: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const colorRgb = useMemo(() => parseColor(color), [color]);

  // Latest uniform-driving values for the per-frame callback (no stale closures).
  const frameRef = useRef({
    radius: effRadius,
    blur: effBlur,
    bgBlur: effBgBlur,
    refraction: effRefraction,
    dispersion: effDispersion,
    rim: effRim,
    colorRgb,
    tint: effTint,
    specular: effSpecular,
  });
  frameRef.current = {
    radius: effRadius,
    blur: effBlur,
    bgBlur: effBgBlur,
    refraction: effRefraction,
    dispersion: effDispersion,
    rim: effRim,
    colorRgb,
    tint: effTint,
    specular: effSpecular,
  };

  // Pushed to the shader every frame. Reads current rects + props, so binding
  // props to state updates the glass live with zero uniform code for the user.
  const frameUniforms = useRef((): Uniforms | null => {
    const sceneEl = sceneRef.current?.getSceneEl();
    const panelEl = panelRef.current;
    if (!sceneEl || !panelEl) return null;
    const s = sceneEl.getBoundingClientRect();
    const p = panelEl.getBoundingClientRect();
    const w = s.width || 1;
    const h = s.height || 1;
    const f = frameRef.current;
    const par = sceneRef.current?.getParallax?.() ?? [0, 0];
    return {
      origin: [(p.left - s.left) / w, (p.top - s.top) / h],
      size: [p.width / w, p.height / h],
      parallax: [par[0], par[1]],
      radius: f.radius ?? resolvedRadiusRef.current,
      blur: f.blur * 0.001,
      bgBlur: f.bgBlur * 0.001,
      refraction: f.refraction,
      dispersion: f.dispersion,
      rim: f.rim,
      color: f.colorRgb,
      tintAmount: f.tint,
      specular: f.specular,
      hover: hoverRef.current,
    };
  }).current;

  const backdrop = scene?.backdrop ?? null;
  const failed = scene?.failed ?? false;

  useEffect(() => {
    const panelEl = panelRef.current;
    if (!panelEl || surfaceRef.current) return;
    if (failed) {
      cssGlassFallback(panelEl);
      return;
    }
    if (!backdrop) return;

    resolvedRadiusRef.current =
      effRadius ?? (parseFloat(getComputedStyle(panelEl).borderTopLeftRadius) || 24);

    const surface = createShaderSurface(panelEl, {
      wgsl: KUSSETSU_GLASS,
      textures: { backdrop },
      uniforms: {
        origin: [0, 0],
        size: [1, 1],
        parallax: [0, 0],
        radius: resolvedRadiusRef.current,
        blur: effBlur * 0.001,
        bgBlur: effBgBlur * 0.001,
        refraction: effRefraction,
        dispersion: effDispersion,
        rim: effRim,
        color: colorRgb,
        tintAmount: effTint,
        specular: effSpecular,
        hover: 0,
      },
      uniformsPerFrame: frameUniforms,
      fallback: { kind: "css", value: "rgba(255,255,255,0.10)" },
    });
    surfaceRef.current = surface;
    return () => {
      surface.destroy();
      surfaceRef.current = null;
    };
    // Create once the backdrop is ready; live updates flow through frameUniforms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backdrop, failed]);

  // Push reactive (user-controlled) uniforms on change. The per-frame callback
  // only applies these while the render loop is running, which pauses offscreen
  // and stops under reduced motion — so without this, prop changes (e.g. a live
  // control panel) wouldn't take effect. setUniforms also redraws when paused.
  useEffect(() => {
    surfaceRef.current?.setUniforms({
      radius: effRadius ?? resolvedRadiusRef.current,
      blur: effBlur * 0.001,
      bgBlur: effBgBlur * 0.001,
      refraction: effRefraction,
      dispersion: effDispersion,
      rim: effRim,
      color: colorRgb,
      tintAmount: effTint,
      specular: effSpecular,
    });
  }, [effRadius, effBlur, effBgBlur, effRefraction, effDispersion, effRim, colorRgb, effTint, effSpecular]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    onPointerDown?.(e);
    if (!drag) return;
    dragRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, bx: pos.x, by: pos.y };
    hoverRef.current = 1;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    onPointerMove?.(e);
    const d = dragRef.current;
    if (!d.dragging) return;
    setPos({ x: d.bx + (e.clientX - d.sx), y: d.by + (e.clientY - d.sy) });
  };
  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    onPointerUp?.(e);
    dragRef.current.dragging = false;
  };
  const handlePointerEnter = (e: ReactPointerEvent<HTMLDivElement>) => {
    onPointerEnter?.(e);
    hoverRef.current = 1;
  };
  const handlePointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(e);
    if (!dragRef.current.dragging) hoverRef.current = 0;
  };

  const panelStyle: CSSProperties = {
    position: "relative",
    isolation: "isolate",
    transform: `translate(${pos.x}px, ${pos.y}px)`,
    ...(effRadius != null ? { borderRadius: `${effRadius}px` } : {}),
    ...(drag ? { cursor: "grab", touchAction: "none" } : {}),
    ...style,
  };

  return (
    <div
      ref={panelRef}
      data-kussetsu-panel=""
      style={panelStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      {...rest}
    >
      {children}
    </div>
  );
}
