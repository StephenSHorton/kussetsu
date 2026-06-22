// The runtime bridge exposed to hooks (useFrame / useViewport / useGpuRoot). The runtime
// wraps the rendered tree in <KussetsuContext.Provider>; the hooks read it. React context
// works across our custom reconciler — it's a core React feature, same as react-three-fiber.
import { createContext } from "react";
import type { GpuControls } from "./runtime";

export interface KussetsuBridge {
  /** The imperative controls (camera, hitTest, resize, … — no render/destroy). */
  root: GpuControls;
  /** Register a per-frame callback (`dt` = seconds since the last frame); returns an unregister
   *  fn. While any callback is registered the render loop runs continuously (drives animation). */
  onFrame: (cb: (dt: number) => void) => () => void;
  /** Current canvas size in CSS px. */
  getViewport: () => { width: number; height: number };
  /** Subscribe to viewport (canvas size) changes; returns an unsubscribe fn. */
  subscribeViewport: (cb: () => void) => () => void;
}

export const KussetsuContext = createContext<KussetsuBridge | null>(null);
