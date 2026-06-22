// React hooks for components running inside a Kussetsu tree (mounted via createGpuRoot or
// <GpuCanvas>). The R3F-style trio: per-frame work, the live viewport, and the imperative root.
import { useContext, useEffect, useRef, useState } from "react";
import { KussetsuContext } from "./context";
import type { GpuControls } from "./runtime";

function useBridge(name: string) {
  const bridge = useContext(KussetsuContext);
  if (!bridge) throw new Error(`kussetsu: ${name}() must be used inside a Kussetsu tree (rendered via createGpuRoot / <GpuCanvas>).`);
  return bridge;
}

/**
 * Run a callback every animation frame — `dt` is the seconds elapsed since the last frame.
 * The render loop runs continuously while any `useFrame` is mounted, so this drives animation
 * (Kussetsu's `useFrame`). Prefer **imperative** updates inside it (e.g. `useGpuRoot().setCamera(...)`,
 * or a `useRef` / material `uniforms: () => …`); a `setState` is an escape hatch — it reconciles
 * the subtree every frame, which is fine for a little but heavy at scale.
 */
export function useFrame(cb: (dt: number) => void): void {
  const bridge = useBridge("useFrame");
  const ref = useRef(cb);
  ref.current = cb; // call the latest closure without re-registering each render
  useEffect(() => bridge.onFrame((dt) => ref.current(dt)), [bridge]);
}

/** The canvas size in CSS px — re-renders the component when the canvas resizes. */
export function useViewport(): { width: number; height: number } {
  const bridge = useBridge("useViewport");
  const [vp, setVp] = useState(bridge.getViewport);
  useEffect(() => {
    setVp(bridge.getViewport());
    return bridge.subscribeViewport(() => setVp(bridge.getViewport()));
  }, [bridge]);
  return vp;
}

/** The imperative controls for the current tree — `getCamera` / `setCamera` / `hitTest` / …
 *  (the `GpuRoot` without `render` / `destroy`, which a component shouldn't call on its own tree). */
export function useGpuRoot(): GpuControls {
  return useBridge("useGpuRoot").root;
}
