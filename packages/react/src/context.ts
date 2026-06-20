import { createContext } from "react";

/** Shared by <GlassScene> with its <GlassPanel> descendants. */
export interface GlassSceneContextValue {
  /** Returns the scene element whose backdrop was captured (stable identity). */
  getSceneEl: () => HTMLElement | null;
  /** The captured backdrop canvas, or null until capture completes. */
  backdrop: HTMLCanvasElement | null;
  /** True if capture failed (panels should use the CSS-glass fallback). */
  failed: boolean;
  /**
   * Current backdrop-sample offset in scene UV, read per-frame by each panel.
   * Non-zero only when the scene drives a parallax drift; the scene translates
   * the visible backdrop by the matching amount so the glass stays seam-free.
   */
  getParallax?: () => readonly [number, number];
}

export const GlassSceneContext = createContext<GlassSceneContextValue | null>(null);

/**
 * Optional shared glass material. Any value set here OVERRIDES the matching prop
 * on every descendant <GlassPanel> — so a control panel can retune a whole tree
 * of glass live (radius, frost, refraction, …) without each panel wiring it up.
 * Color is intentionally NOT here: it stays per-component identity.
 */
export interface GlassThemeValue {
  radius?: number;
  blur?: number;
  bgBlur?: number;
  refraction?: number;
  dispersion?: number;
  rim?: number;
  tint?: number;
  specular?: number;
}

export const GlassThemeContext = createContext<GlassThemeValue | null>(null);
