import { useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import { GlassScene, GlassThemeContext } from "@kussetsu/react";
import { ControlPanel, type Control } from "./ControlPanel";

// Resolve the wallpaper under the deploy base path (root in dev, /kussetsu/ on
// GitHub Pages) so it loads in both — a CSS url("/grass.jpg") would 404 on Pages.
const GRASS_BG = `url(${import.meta.env.BASE_URL}grass.jpg)`;

/**
 * One section per component: a brief title + description on the dark page, then a
 * contained grass "card" that the component refracts. The title/description live
 * OUTSIDE the grass.
 */
function Stage({
  title,
  description,
  children,
  minH = "min-h-[110px]",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  /** Min-height floor on the grass card so it survives capture (see below). */
  minH?: string;
}) {
  // The title/description sit above the grass, in normal flow with LITERAL colors
  // (not Tailwind's `text-white/55`, which compiles to color-mix(in oklab,…) —
  // html2canvas can't parse that and the capture throws). The grass card needs a
  // literal rgba border (same reason) and a min-height floor: html2canvas drops
  // the no-capture content, which would otherwise collapse the card to 0 and clip
  // the grass to nothing (clear glass would then refract black).
  return (
    // content-visibility: auto lets the browser skip rendering off-screen stages
    // — essential on a ~55-card page so fast scrolling doesn't outrun paint. The
    // captured GlassScene (below) is excluded, so html2canvas is unaffected.
    <section
      className="flex w-full flex-col gap-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 360px" } as CSSProperties}
    >
      <div>
        <h2 className="m-0 text-sm font-bold uppercase tracking-[0.14em] text-white">{title}</h2>
        <p className="mt-1 text-[0.82rem] text-[rgba(255,255,255,0.55)]">{description}</p>
      </div>
      {/* Each card is its OWN GlassScene capturing only its small grass card —
          one page-wide scene would exceed the GPU's max texture size once there
          are dozens of tall sections. */}
      <GlassScene
        className={`relative w-full overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.12)] shadow-[0_24px_70px_rgba(0,0,0,0.55)] ${minH}`}
      >
        <div className="ks-stage-bg" style={{ backgroundImage: GRASS_BG }} />
        <div data-kussetsu-no-capture className="relative z-10 flex flex-col gap-4 p-6">
          {children}
        </div>
      </GlassScene>
    </section>
  );
}

const GLASS_DEFAULTS = {
  radius: 20,
  blur: 0,
  pageBlur: 3, // visible wallpaper blur (CSS) — NOT a glass material, ignored by the theme
  bgBlur: 3, // depth-of-field blur of the backdrop seen THROUGH the glass (shader)
  refraction: 0.05,
  dispersion: 0.006,
  rim: 0.05,
  tint: 0.04,
  specular: 1,
};
const GLASS_CONTROLS: Control[] = [
  { key: "radius", label: "Radius", min: 0, max: 60, step: 1 },
  { key: "blur", label: "Frost", min: 0, max: 20, step: 0.5 },
  { key: "pageBlur", label: "BG blur", min: 0, max: 20, step: 0.5 },
  { key: "bgBlur", label: "Glass BG blur", min: 0, max: 20, step: 0.5 },
  { key: "refraction", label: "Refraction", min: 0, max: 0.15, step: 0.005 },
  { key: "dispersion", label: "Dispersion", min: 0, max: 0.03, step: 0.001 },
  { key: "rim", label: "Rim width", min: 0.01, max: 0.2, step: 0.005 },
  { key: "tint", label: "Tint", min: 0, max: 0.4, step: 0.01 },
  { key: "specular", label: "Specular", min: 0, max: 2, step: 0.05 },
];

// Auto-discover every component demo in ./demos. Each demo file exports a `meta`
// ({ title, description, minH }) and a default Demo component — one stage each.
type DemoModule = {
  meta: { title: string; description: string; minH?: string };
  default: ComponentType;
};
const demoModules = import.meta.glob<DemoModule>("./demos/*.tsx", { eager: true });
const DEMOS = Object.entries(demoModules)
  .filter(([, m]) => m && m.meta && m.default)
  .map(([path, m]) => ({ key: path.slice(path.lastIndexOf("/") + 1, -4), meta: m.meta, Demo: m.default }))
  .sort((a, b) => a.meta.title.localeCompare(b.meta.title));

export function App() {
  const [glass, setGlass] = useState<Record<string, number>>({ ...GLASS_DEFAULTS });
  const resetGlass = () => setGlass({ ...GLASS_DEFAULTS });

  return (
    <div
      className="min-h-screen bg-[#05060c]"
      style={{ "--ks-bg-blur": `${glass.pageBlur}px` } as CSSProperties}
    >
      {/* Every <GlassPanel> below inherits these material values from the
          control panel — radius, frost, refraction, etc. — live. Each Stage
          owns its own GlassScene (capture). */}
      <GlassThemeContext.Provider value={glass}>
          <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-14">
            {/* Captured in flow (literal colors, no oklab) so it doesn't shift the
                grass cards below it during capture — see Stage. */}
            <header className="pb-2 text-center">
              <h1 className="m-0 text-[clamp(1.8rem,4vw,2.6rem)] font-bold tracking-tight text-white">
                Kussetsu UI · React
              </h1>
              <p className="mt-2 text-[rgba(255,255,255,0.7)]">
                The shadcn catalog — {DEMOS.length} components — rendered as live glass on{" "}
                <code>@kussetsu/react</code>.
              </p>
            </header>

            {DEMOS.map((d) => (
              <Stage key={d.key} title={d.meta.title} description={d.meta.description} minH={d.meta.minH}>
                <d.Demo />
              </Stage>
            ))}
          </div>
      </GlassThemeContext.Provider>

      {/* Pinned control panel — retunes every component's glass live via the
          GlassTheme provider wrapping the gallery. Follows the scroll. */}
      <div className="fixed right-5 top-5 z-30 hidden max-h-[calc(100vh-2.5rem)] w-[230px] flex-col gap-3 overflow-y-auto xl:flex">
        <ControlPanel
          title="Glass"
          note="Tunes every component →"
          controls={GLASS_CONTROLS}
          values={glass}
          onChange={(k, v) => setGlass((prev) => ({ ...prev, [k]: v }))}
          onReset={resetGlass}
        />
      </div>
    </div>
  );
}
