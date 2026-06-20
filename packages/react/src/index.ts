// High-level components: wrap a backdrop in <GlassScene>, drop <GlassPanel>s
// over it, and get refractive glass with zero texture/uniform/capture code.
export { GlassScene } from "./GlassScene";
export type { GlassSceneProps } from "./GlassScene";
export { GlassPanel } from "./GlassPanel";
export type { GlassPanelProps } from "./GlassPanel";

// Shared glass material: override material props on a whole subtree of panels.
export { GlassThemeContext } from "./context";
export type { GlassThemeValue } from "./context";

// Low-level primitive: bind a raw WGSL shader to an element via a ref.
export { useShader } from "./useShader";
export type { UseShaderOptions } from "./useShader";

// Re-export the core types most React users will reference.
export type {
  ShaderOptions,
  ShaderSurface,
  Uniforms,
  UniformValue,
  Fallback,
  FallbackReason,
} from "@kussetsu/core";
