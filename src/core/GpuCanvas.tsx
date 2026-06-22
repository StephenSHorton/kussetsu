"use client";
// <GpuCanvas> — the declarative way to mount Kussetsu in a React app ("R3F's <Canvas>").
//
// Drop it in your JSX and it owns all the imperative plumbing that `createGpuRoot`
// otherwise leaves to you:
//   • creates its own <canvas> inside a position:relative wrapper (so the "positioned
//     parent" + "non-zero CSS size" requirements are satisfied by construction),
//   • calls createGpuRoot in an effect and renders `children` into the GPU root,
//   • re-renders the GPU tree when `children` change,
//   • tears the root down on unmount — and survives React 18 StrictMode's
//     mount→unmount→mount without leaking a second root / overlay / rAF loop,
//   • renders `fallback` (real HTML) when WebGPU is unavailable.
//
//   import { GpuCanvas, View, Text } from "kussetsu";
//   <GpuCanvas style={{ width: "100vw", height: "100vh" }} fallback={<p>Needs WebGPU.</p>}>
//     <View glass={{ refraction: 0.1 }} style={{ padding: 28, radius: 22 }}>
//       <Text style={{ fontWeight: 800 }}>Hello, light.</Text>
//     </View>
//   </GpuCanvas>
//
// `createGpuRoot` remains the lower-level escape hatch for non-React / custom mounts.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createGpuRoot, type GpuRoot, type GpuRootOptions } from "./runtime";

export interface GpuCanvasProps extends GpuRootOptions {
  /** The Kussetsu tree to paint — authored with `<View>` / `<Text>`. */
  children?: ReactNode;
  /** className for the wrapper <div>. */
  className?: string;
  /** Inline style for the wrapper <div>, merged over the defaults (position/size). */
  style?: CSSProperties;
  /** Rendered (as real HTML) when WebGPU is unavailable or the root fails to create. */
  fallback?: ReactNode;
  /** Called once with the `GpuRoot` after it's created — the imperative escape hatch. */
  onCreated?: (root: GpuRoot) => void;
}

const WRAPPER: CSSProperties = { position: "relative", width: "100%", height: "100%" };
const CANVAS: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" };

export function GpuCanvas({
  children,
  className,
  style,
  fallback,
  onCreated,
  camera,
  pageScroll,
  textSelectable,
  background,
}: GpuCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [root, setRoot] = useState<GpuRoot | null>(null);
  const [failed, setFailed] = useState(false);

  // Serializes root creation so two roots never own the canvas at once. A `<canvas>`'s
  // WebGPU context is a single shared resource: under React 18 StrictMode (mount → unmount
  // → mount) or an option change, two overlapping createGpuRoot calls would each configure
  // it with their own GPUDevice, and the live root then paints nothing while the console
  // floods with "TextureView … cannot be used with [Device]". The gate makes each mount
  // wait for the previous root to FULLY tear down before it creates its own.
  const gateRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let created: GpuRoot | null = null;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const prev = gateRef.current;
    gateRef.current = gate;

    const done = (async () => {
      await prev; // wait for any previous root on this canvas to finish tearing down
      if (cancelled) return; // unmounted while waiting — never touch the canvas
      setFailed(false);
      try {
        const r = await createGpuRoot(canvas, { camera, pageScroll, textSelectable, background });
        if (cancelled) {
          r.destroy(); // unmounted while creating
          return;
        }
        created = r;
        setRoot(r);
        onCreated?.(r);
      } catch (err) {
        if (!cancelled) {
          setFailed(true);
          console.error("[kussetsu] createGpuRoot failed (no WebGPU?):", err);
        }
      }
    })();

    return () => {
      cancelled = true;
      setRoot(null);
      // Destroy and open the gate only AFTER creation settles, so the next mount can't
      // start configuring the canvas while this root is still alive.
      done.then(() => {
        created?.destroy();
        release();
      });
    };
    // onCreated is intentionally not a dep — recreating the root on a new callback identity
    // would be surprising; we call the latest-at-creation-time handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, pageScroll, textSelectable, background]);

  // (Re)paint the React subtree whenever the children or the root change.
  useEffect(() => {
    root?.render(children);
  }, [root, children]);

  return (
    <div className={className} style={{ ...WRAPPER, ...style }}>
      <canvas ref={canvasRef} style={CANVAS} />
      {failed ? fallback : null}
    </div>
  );
}
