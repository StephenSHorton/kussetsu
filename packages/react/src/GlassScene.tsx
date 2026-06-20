import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { captureBackdrop } from "@kussetsu/core";
import { GlassSceneContext, type GlassSceneContextValue } from "./context";

export interface GlassSceneProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Device-pixel-ratio cap for the backdrop snapshot. */
  maxDpr?: number;
  /**
   * Scroll-driven parallax lag factor in [0, 1] (0 = off). The backdrop scrolls
   * at `(1 - lag)` of page speed — so it moves, but slower than the content, for
   * a depth effect. The scene publishes a `--kussetsu-parallax-y` CSS var (apply
   * it as `transform: translateY(...)` to your backdrop layer) and feeds every
   * <GlassPanel> the matching sample offset, so the glass refraction tracks the
   * lagging backdrop seam-free. The backdrop layer needs enough headroom (extend
   * it above/below the scene) to translate without exposing an edge.
   */
  parallax?: number;
}

/**
 * Captures a snapshot of its own subtree on mount and shares it (via context)
 * with any descendant <GlassPanel>, which refracts it. Mark crisp overlay UI
 * with `data-kussetsu-no-capture` to keep it on top of the glass.
 */
export function GlassScene({ children, maxDpr = 2, parallax = 0, style, ...rest }: GlassSceneProps) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [backdrop, setBackdrop] = useState<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  // Current backdrop-sample offset (scene UV), read per-frame by panels, plus the
  // scroll position at capture time (the texture is the fixed backdrop as seen
  // then, so the offset is measured relative to it).
  const parallaxUV = useRef<readonly [number, number]>([0, 0]);
  const captureScrollY = useRef(0);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      try {
        // Make sure backdrop images are decoded before we snapshot.
        const imgs = Array.from(el.querySelectorAll("img"));
        await Promise.all(imgs.map((im) => im.decode().catch(() => {})));
        captureScrollY.current = globalThis.scrollY || 0;
        const { source } = await captureBackdrop(el, { maxDpr });
        if (!cancelled) setBackdrop(source);
      } catch (err) {
        console.warn("[kussetsu] backdrop capture failed; panels fall back to CSS glass:", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [maxDpr]);

  // Scroll-driven parallax: the backdrop lags by `parallax` (so it scrolls at
  // (1-lag) of page speed). Publish the visible translate (CSS var, = lag*scroll)
  // and the matching glass sample offset (= -lag*scroll/sceneHeight, scene UV) —
  // derived so the grass inside the glass stays aligned with the grass outside.
  // Measured relative to the scroll at capture, and recomputed when it arrives.
  useEffect(() => {
    const el = sceneRef.current;
    if (!el || parallax <= 0) return;
    const lag = parallax;

    let raf = 0;
    let pending = false;
    const update = () => {
      pending = false;
      const h = el.getBoundingClientRect().height || 1;
      const s = (globalThis.scrollY || 0) - captureScrollY.current;
      parallaxUV.current = [0, (-lag * s) / h];
      el.style.setProperty("--kussetsu-parallax-y", `${(lag * s).toFixed(2)}px`);
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      parallaxUV.current = [0, 0];
      el.style.removeProperty("--kussetsu-parallax-y");
    };
  }, [parallax, backdrop]);

  const getSceneEl = useCallback(() => sceneRef.current, []);
  const getParallax = useCallback(() => parallaxUV.current, []);
  const value = useMemo<GlassSceneContextValue>(
    () => ({ getSceneEl, getParallax, backdrop, failed }),
    [getSceneEl, getParallax, backdrop, failed],
  );

  const sceneStyle: CSSProperties = { position: "relative", isolation: "isolate", ...style };

  return (
    <GlassSceneContext.Provider value={value}>
      <div ref={sceneRef} style={sceneStyle} {...rest}>
        {children}
      </div>
    </GlassSceneContext.Provider>
  );
}
