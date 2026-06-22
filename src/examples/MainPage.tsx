import { useMemo, useState } from "react";
import { useSpring } from "../core/useSpring";
import type { MaterialSpec, RGBA } from "../core/scene";
import { AURORA, PLASMA, HOLOGRAPHIC, RIPPLE, LOUPE } from "./FxGallery";

// The one-page showcase. A tall scrolling column of sections (pageScroll), each showing
// something CSS structurally can't do: shader materials, real spring physics + squircles,
// a glass panel refracting live moving content, and a build-time React→GPU migration shown
// as code↔result. No tabs. Authored in plain React with <view>/<text> — except the Migrate
// card, which is literally HTML/Tailwind transformed by kussetsu/compat at build time.

const INK: RGBA = [0.03, 0.04, 0.08, 1];
const WHITE: RGBA = [0.97, 0.98, 1, 1];
const MUTED: RGBA = [0.6, 0.65, 0.78, 1];
const FAINT: RGBA = [0.45, 0.5, 0.64, 1];

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <view style={{ width: "stretch", direction: "column", gap: 7, padding: 44 }}>
      <text role="heading" level={2} style={{ fontSize: 32, fontWeight: 800, color: WHITE }}>{title}</text>
      <text style={{ maxWidth: 720, fontSize: 16, fontWeight: 500, color: MUTED }}>{sub}</text>
    </view>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────────
// ── Section 1: shader materials (the hero capability) ─────────────────────────────
interface Tile { name: string; note: string; spec?: MaterialSpec; glass?: boolean; }
const FX_TILES: Tile[] = [
  { name: "Aurora", note: "procedural · animated", spec: { shader: AURORA, animated: true } },
  { name: "Plasma", note: "procedural · animated", spec: { shader: PLASMA, animated: true } },
  { name: "Holographic", note: "follows your cursor", spec: { shader: HOLOGRAPHIC, animated: true } },
  { name: "Ripple", note: "bends the live backdrop", spec: { shader: RIPPLE, animated: true, backdrop: true } },
  { name: "Loupe", note: "magnifies under cursor", spec: { shader: LOUPE, backdrop: true } },
  { name: "Glass", note: "refraction + dispersion", glass: true },
];
const FX_BANDS: { word: string; color: RGBA }[] = [
  { word: "SHADERS AS MATERIALS", color: [0.36, 0.4, 0.95, 1] },
  { word: "SAMPLE THE LIVE SCENE", color: [0.1, 0.72, 0.66, 1] },
  { word: "BEND IT · WARP IT · GLOW", color: [0.96, 0.45, 0.2, 1] },
  { word: "BACKDROP-FILTER COULD NEVER", color: [0.86, 0.32, 0.56, 1] },
];
const TILE_W = 248, TILE_H = 178, GAP = 22;

function FxSection({ vw }: { vw: number }) {
  const cols = 3;
  const gridW = cols * TILE_W + (cols - 1) * GAP;
  const gridX = Math.round((vw - gridW) / 2);
  const bandsTop = 150, bandsH = 620;
  return (
    <view style={{ width: "stretch", height: 820, direction: "column" }}>
      <Heading title="Shaders as Materials" sub="Every panel's fill is a hand-written WGSL fragment shader. Some reach back into the live scene behind them and bend it — a ripple, a magnifying loupe — a thing CSS backdrop-filter was never built to do." />
      {/* textured backdrop so the sampling materials have detail to bend/magnify */}
      <view style={{ absolute: { x: 0, y: bandsTop }, width: vw, height: bandsH, direction: "column", overflow: "hidden" }}>
        {FX_BANDS.map((b, i) => (
          <view key={i} style={{ width: "stretch", grow: 1, background: b.color, direction: "column", justify: "center", padding: 36, overflow: "hidden" }}>
            <text style={{ fontSize: 34, fontWeight: 800, color: INK }}>{(b.word + "   ").repeat(5)}</text>
          </view>
        ))}
      </view>
      {/* the tiles */}
      <view style={{ absolute: { x: gridX, y: bandsTop + Math.round((bandsH - (2 * TILE_H + GAP)) / 2) }, width: gridW, direction: "row", wrap: true, gap: GAP }}>
        {FX_TILES.map((t) => {
          const inner = (
            <view style={{ grow: 1, width: "stretch", direction: "column", justify: "end", padding: 14, gap: 2 }}>
              <text style={{ fontSize: 16, fontWeight: 800, color: WHITE }}>{t.name}</text>
              <text style={{ fontSize: 12, fontWeight: 600, color: [0.85, 0.88, 0.98, 0.85] }}>{t.note}</text>
            </view>
          );
          const style = { width: TILE_W, height: TILE_H, shrink: 0, radius: 18, cornerSmoothing: 0.6, direction: "column" } as const;
          return t.glass
            ? <view key={t.name} glass={{ refraction: 0.13, dispersion: 0.07, blur: 4, tint: 0.05, rim: 16 }} style={style}>{inner}</view>
            : <view key={t.name} material={t.spec} style={style}>{inner}</view>;
        })}
      </view>
    </view>
  );
}

// ── Section 2: springs + squircles ────────────────────────────────────────────────
interface Preset { name: string; w: number; h: number; radius: number; sm: number; color: [number, number, number]; }
const PRESETS: Preset[] = [
  { name: "Rounded", w: 260, h: 260, radius: 40, sm: 0, color: [0.36, 0.4, 0.95] },
  { name: "Squircle", w: 260, h: 260, radius: 78, sm: 1, color: [0.1, 0.72, 0.66] },
  { name: "Circle", w: 260, h: 260, radius: 130, sm: 0, color: [0.96, 0.45, 0.2] },
  { name: "Pill", w: 400, h: 150, radius: 75, sm: 0.4, color: [0.86, 0.32, 0.56] },
  { name: "Card", w: 400, h: 250, radius: 18, sm: 0.6, color: [0.56, 0.35, 0.95] },
];
const BOUNCY = { stiffness: 190, damping: 13 };
const SMOOTH = { stiffness: 190, damping: 22 };
const CHIP: RGBA = [0.12, 0.14, 0.22, 1];
const CHIP_ON: RGBA = [0.3, 0.36, 0.62, 1];

function SpringSection() {
  const [i, setI] = useState(1);
  const p = PRESETS[i];
  const w = useSpring(p.w, BOUNCY), h = useSpring(p.h, BOUNCY);
  const radius = useSpring(p.radius, BOUNCY), sm = useSpring(p.sm, SMOOTH);
  const cr = useSpring(p.color[0], SMOOTH), cg = useSpring(p.color[1], SMOOTH), cb = useSpring(p.color[2], SMOOTH);
  return (
    <view style={{ width: "stretch", height: 720, direction: "column", background: INK }}>
      <Heading title="Springs and Squircles" sub="Real, interruptible spring physics: click a shape and retarget it mid-flight — its momentum carries through. The corners are true superellipse squircles — continuous curvature, not stitched circular arcs. Neither has a CSS spelling." />
      <view style={{ grow: 1, width: "stretch", direction: "column", align: "center", justify: "center", gap: 44 }}>
        <view style={{ width: 440, height: 290, direction: "row", align: "center", justify: "center" }}>
          <view style={{ width: Math.round(w), height: Math.round(h), radius, cornerSmoothing: sm, background: [cr, cg, cb, 1] }} />
        </view>
        <view style={{ direction: "row", gap: 12 }}>
          {PRESETS.map((pp, idx) => (
            <view key={pp.name} role="button" ariaLabel={`Morph to ${pp.name}`} onActivate={() => setI(idx)}
              style={{ height: 44, shrink: 0, direction: "row", align: "center", justify: "center", padding: 18, radius: 13, cornerSmoothing: 0.6, background: idx === i ? CHIP_ON : CHIP }}>
              <text style={{ fontSize: 14, fontWeight: 700, color: idx === i ? WHITE : [0.78, 0.82, 0.94, 1] }}>{pp.name}</text>
            </view>
          ))}
        </view>
      </view>
    </view>
  );
}

// ── Section 3: glass over live moving content ─────────────────────────────────────
const DRIFT: { color: RGBA; w: number; h: number; r: number; y: number; speed: number }[] = [
  { color: [0.36, 0.4, 0.95, 1], w: 150, h: 150, r: 28, y: 40, speed: 34 },
  { color: [0.1, 0.72, 0.66, 1], w: 120, h: 120, r: 60, y: 150, speed: -26 },
  { color: [0.96, 0.65, 0.13, 1], w: 170, h: 110, r: 22, y: 250, speed: 44 },
  { color: [0.86, 0.32, 0.56, 1], w: 130, h: 130, r: 65, y: 60, speed: -38 },
  { color: [0.55, 0.35, 0.95, 1], w: 160, h: 160, r: 36, y: 230, speed: 30 },
  { color: [0.18, 0.71, 0.61, 1], w: 110, h: 110, r: 24, y: 150, speed: -48 },
];

function GlassSection({ vw, t }: { vw: number; t: number }) {
  const sectionH = 600, contentTop = 150, span = vw + 280;
  const panelW = Math.min(520, vw - 120), panelH = 220;
  return (
    <view style={{ width: "stretch", height: sectionH, direction: "column", background: INK }}>
      <Heading title="Glass Over Anything" sub="Because we own the entire framebuffer, a single sheet of glass refracts and disperses whatever moves behind it. Light splits where it bends — a depth backdrop-filter, which only blurs, can never reach." />
      {DRIFT.map((c, idx) => {
        const x = ((c.speed * t + idx * 360) % span + span) % span - 140;
        return <view key={idx} style={{ absolute: { x: Math.round(x), y: contentTop + c.y }, width: c.w, height: c.h, radius: c.r, cornerSmoothing: 0.5, background: c.color }} />;
      })}
      <view glass={{ refraction: 0.14, dispersion: 0.07, blur: 3, tint: 0.05, rim: 16 }}
        style={{ absolute: { x: Math.round((vw - panelW) / 2), y: contentTop + 90 }, width: panelW, height: panelH, radius: 26, cornerSmoothing: 0.6, direction: "column", align: "center", justify: "center", gap: 6 }}>
        <text style={{ fontSize: 22, fontWeight: 800, color: WHITE }}>One glass panel</text>
        <text style={{ fontSize: 15, color: [0.85, 0.88, 0.99, 0.9] }}>refracting the live scene behind it</text>
      </view>
    </view>
  );
}

// ── Section 4: particles + bloom post-process ─────────────────────────────────────
function ParticleSection({ vw }: { vw: number }) {
  const sectionH = 580, top = 160;
  return (
    <view style={{ width: "stretch", height: sectionH, direction: "column", background: INK }}>
      <Heading title="Particles and Bloom" sub="Thousands of GPU particles in one instanced draw, alive to your cursor — sweep through to stir and plow them. A bloom pass lets the brightest ones spill their glow into the dark." />
      {/* the emitter is an invisible box; the field is drawn (and camera-scrolled) by the painter.
          postProcess scopes the bloom to THIS box only — the rest of the page stays crisp. */}
      <view
        particles={{ count: 1500, color: [1.0, 0.5, 0.16, 1], color2: [1.0, 0.82, 0.36, 1], size: 13, speed: 22, drag: 0.6, pointer: 1900, pointerRadius: 360, life: 4 }}
        postProcess="bloom"
        style={{ absolute: { x: 0, y: top }, width: vw, height: sectionH - top }}
      />
    </view>
  );
}

// ── Section 4: migrate — code ↔ live result ───────────────────────────────────────
// The card on the right is PLAIN HTML/Tailwind, transformed at build time by kussetsu/compat.
function MigratedCard() {
  const [following, setFollowing] = useState(false);
  return (
    <div className="flex-col p-5 rounded-2xl bg-slate-800" style={{ width: 300, gap: 14 }}>
      <div className="flex-row items-center gap-3">
        <div className="rounded-full bg-indigo-500" style={{ width: 46, height: 46 }} />
        <div className="flex-col">
          <h3 className="text-lg font-bold text-white">Ada Lovelace</h3>
          <p className="text-sm text-slate-400">First programmer</p>
        </div>
      </div>
      <button className="flex-row items-center justify-center rounded-lg bg-indigo-600 text-white w-full" style={{ height: 42, fontSize: 15, fontWeight: 700 }} onClick={() => setFollowing((f) => !f)}>
        <span>{following ? "Following ✓" : "Follow"}</span>
      </button>
    </div>
  );
}

type CodeSeg = { text: string; kind?: "tag" | "attr" | "str" | "const" };
type CodeLine = CodeSeg[];
const CODE_COLOR: Record<string, RGBA> = { tag: [0.55, 0.62, 0.95, 1], str: [0.45, 0.78, 0.6, 1], attr: [0.92, 0.7, 0.45, 1], const: [0.82, 0.6, 0.98, 1] };

// The SAME card, two ways. Left: HTML + Tailwind (what you'd usually write). Right: kussetsu's
// native vocabulary — <view>/<text> + a style object, no cascade. compat maps left -> right.
// Full per-token highlighting: adjacent coloured text nodes now lay out tight because layout
// and the painter measure advances identically (charAdvance, text.ts).
const TAILWIND_CODE: CodeLine[] = [
  [{ text: "<div ", kind: "tag" }, { text: "className=", kind: "attr" }, { text: '"flex-col p-5', kind: "str" }],
  [{ text: '      rounded-2xl bg-slate-800"', kind: "str" }, { text: ">" }],
  [{ text: "  <div ", kind: "tag" }, { text: "className=", kind: "attr" }, { text: '"flex-row', kind: "str" }],
  [{ text: '             items-center gap-3"', kind: "str" }, { text: ">" }],
  [{ text: "    <div ", kind: "tag" }, { text: "className=", kind: "attr" }, { text: '"rounded-full', kind: "str" }],
  [{ text: '               bg-indigo-500"', kind: "str" }, { text: " />" }],
  [{ text: "    <h3 ", kind: "tag" }, { text: "className=", kind: "attr" }, { text: '"text-lg', kind: "str" }],
  [{ text: '            font-bold text-white"', kind: "str" }, { text: ">Ada</h3>" }],
  [{ text: "  </div>", kind: "tag" }],
  [{ text: "  <button ", kind: "tag" }, { text: "className=", kind: "attr" }, { text: '"rounded-lg', kind: "str" }],
  [{ text: '            bg-indigo-600"', kind: "str" }, { text: ">Follow" }],
  [{ text: "  </button>", kind: "tag" }],
  [{ text: "</div>", kind: "tag" }],
];

const NATIVE_CODE: CodeLine[] = [
  [{ text: "<view ", kind: "tag" }, { text: "style={{ direction: " }, { text: "'column'", kind: "str" }, { text: "," }],
  [{ text: "       padding: 20, radius: 16," }],
  [{ text: "       background: " }, { text: "SLATE", kind: "const" }, { text: ", gap: 14 }}>" }],
  [{ text: "  <view ", kind: "tag" }, { text: "style={{ direction: " }, { text: "'row'", kind: "str" }, { text: "," }],
  [{ text: "         align: " }, { text: "'center'", kind: "str" }, { text: ", gap: 12 }}>" }],
  [{ text: "    <view ", kind: "tag" }, { text: "style={{ radius: 23," }],
  [{ text: "           background: " }, { text: "INDIGO", kind: "const" }, { text: " }} />" }],
  [{ text: "    <text ", kind: "tag" }, { text: "style={{ fontWeight: 700," }],
  [{ text: "           color: " }, { text: "WHITE", kind: "const" }, { text: " }}>Ada</text>" }],
  [{ text: "  </view>", kind: "tag" }],
  [{ text: "  <view ", kind: "tag" }, { text: "role", kind: "attr" }, { text: "='button'", kind: "str" }, { text: ">Follow" }],
  [{ text: "  </view>", kind: "tag" }],
  [{ text: "</view>", kind: "tag" }],
];

function CodeCol({ label, accent, code, w }: { label: string; accent: RGBA; code: CodeLine[]; w: number }) {
  return (
    <view style={{ width: w, direction: "column", gap: 10 }}>
      <text style={{ fontSize: 13, fontWeight: 700, color: accent }}>{label}</text>
      <view style={{ width: "stretch", grow: 1, radius: 14, cornerSmoothing: 0.6, background: [0.06, 0.07, 0.12, 1], padding: 20, direction: "column", gap: 3 }}>
        {code.map((line, i) => (
          <view key={i} style={{ direction: "row" }}>
            {line.map((seg, j) => (
              <text key={j} style={{ fontSize: 13, fontWeight: 500, color: seg.kind ? CODE_COLOR[seg.kind] : [0.78, 0.82, 0.92, 1] }}>{seg.text}</text>
            ))}
          </view>
        ))}
      </view>
    </view>
  );
}

function MigrateSection({ vw }: { vw: number }) {
  const colW = Math.min(440, (Math.min(980, vw - 80) - 30) / 2);
  return (
    <view style={{ width: "stretch", height: 820, direction: "column", background: INK }}>
      <Heading title="Native Vocabulary, or Migrate" sub="Author in the native tongue — <view> and <text> with a plain style object, no cascade. Or bring your existing HTML and Tailwind React, and a build-time compat layer maps it onto the GPU so you migrate one piece at a time. The same card, both ways, painting the identical result below." />
      <view style={{ width: "stretch", direction: "row", align: "start", justify: "center", gap: 30 }}>
        <CodeCol label="HTML + TAILWIND — the familiar way" accent={[0.5, 0.78, 0.62, 1]} code={TAILWIND_CODE} w={colW} />
        <CodeCol label="KUSSETSU — the native vocabulary" accent={[0.66, 0.66, 0.98, 1]} code={NATIVE_CODE} w={colW} />
      </view>
      <view style={{ grow: 1, width: "stretch", direction: "column", align: "center", justify: "center", gap: 12 }}>
        <text style={{ fontSize: 13, fontWeight: 700, color: FAINT }}>↓ BOTH COMPILE TO THIS — PAINTED ON THE GPU, ACCESSIBLE</text>
        <MigratedCard />
      </view>
    </view>
  );
}

/** The five capability sections, without page chrome — appended to the bottom of the marketing
 *  page. Heavy sections are memoized so the per-frame drift tick only reconciles the animated glass. */
export function DemoSections({ vw, t }: { vw: number; t: number }) {
  const fx = useMemo(() => <FxSection vw={vw} />, [vw]);
  const springs = useMemo(() => <SpringSection />, []);
  const particles = useMemo(() => <ParticleSection vw={vw} />, [vw]);
  const migrate = useMemo(() => <MigrateSection vw={vw} />, [vw]);
  return (
    <>
      {fx}
      {springs}
      <GlassSection vw={vw} t={t} />
      {particles}
      {migrate}
    </>
  );
}

