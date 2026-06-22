// Consumer type-check fixture — compiled with `npm run test:types`.
//
// Proves the public authoring surface type-checks the way a real app's tsconfig sees it
// (jsx: react-jsx, moduleResolution: bundler, skipLibCheck: true), importing from the
// BUILT package. The `@ts-expect-error` lines are negative guards: each MUST stay an
// error, so if the typing ever goes loose (e.g. props collapse to `any`, or the
// <view>/<text> SVG-intrinsic collision comes back), this file stops compiling.
import { createGpuRoot, GpuCanvas, View, Text, rgba, useSpring } from "kussetsu";
import type { GpuRoot, Style, RGBA, ParticleSpec, ViewProps, ActivateEvent } from "kussetsu";

// ── color helper ──────────────────────────────────────────────────────────────
const indigo: RGBA = rgba("#5C5CFF");
const faded: RGBA = rgba("#fff", 0.6);
const named: RGBA = rgba("slate");
void faded;
void named;

// ── authoring types ─────────────────────────────────────────────────────────────
const bar: Style = { direction: "row", justify: "space-between", gap: 12 };
const dots: ParticleSpec = { count: 200, gravity: 20 };
const headingProps: ViewProps = { role: "heading", level: 1, style: { fontWeight: 800 } };
// per-side padding + gap axes
const card: Style = { paddingX: 16, paddingY: 8, paddingTop: 12, rowGap: 6, columnGap: 10 };
void bar;
void headingProps;
void card;

// ── the documented authoring shape — must type-check clean ───────────────────────
function App() {
  const lift = useSpring(12); // returns number
  return (
    <View
      glass={{ refraction: 0.1, dispersion: 0.07 }}
      style={{ padding: 28, radius: 22, background: rgba("#0b0e14"), gap: 10 }}
    >
      <Text style={{ fontWeight: 800, color: indigo }}>Hello, light.</Text>
      <View
        role="button"
        draggable
        ariaLabel="card"
        onActivate={(e: ActivateEvent) => void (e.metaKey || e.shiftKey || e.button)}
        onPointerEnter={() => {}}
        onPointerLeave={() => {}}
        onDrag={(dx, dy) => void (dx + dy)}
        particles={dots}
        style={{ absolute: { x: 0, y: lift }, width: 150, height: 92, paddingX: 14, paddingY: 8, justify: "space-between" }}
      />
      {/* zero-arg onActivate must still be assignable (backward compatible) */}
      <View role="button" onActivate={() => {}} />
      <View onPointerEnter={() => {}} style={{ padding: 8 }} />
      <View editable value="hi" onChange={(v) => void v} material={{ shader: "fn material() {}" }}>
        <Text>{"editable"}</Text>
      </View>
    </View>
  );
}

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
  const root = await createGpuRoot(canvas, {
    camera: false,
    textSelectable: true,
    onDeviceLost: (info) => console.warn(info.reason, info.message),
    onError: (err) => console.error(err),
  });
  root.render(<App />);

  // imperative escapes (P1-6)
  const cam = root.getCamera(); // { tx, ty, scale }
  root.setCamera({ scale: cam.scale * 1.5 });
  root.setCamera({ tx: 0, ty: 0 });
  root.resetCamera();
  root.resize();
  const id: number | null = root.hitTest(120, 80);
  void id;
  const c: HTMLCanvasElement = root.getCanvas();
  void c;

  root.destroy();
}
void boot;
void App;

// ── <GpuCanvas> — the declarative mount, must type-check clean ────────────────────
function Root() {
  return (
    <GpuCanvas
      className="stage"
      style={{ width: "100vw", height: "100vh" }}
      camera={false}
      textSelectable
      fallback={<p>This app needs a WebGPU-capable browser.</p>}
      onCreated={(root: GpuRoot) => root.requestRender()}
      onDeviceLost={(info) => console.warn("device lost:", info.reason)}
      onError={(err) => console.error(err)}
    >
      <View style={{ padding: 28, background: rgba("#0b0e14") }}>
        <Text style={{ fontWeight: 800 }}>Hello, light.</Text>
      </View>
    </GpuCanvas>
  );
}
void Root;

// ── negative guards (each line MUST remain a type error) ─────────────────────────

// @ts-expect-error camera is a boolean, not a string.
const badCanvas = <GpuCanvas camera="yes" />;
void badCanvas;

// @ts-expect-error background is an RGBA tuple, not a CSS string — use rgba("#fff").
const badBg = <View style={{ background: "#ffffff" }} />;
// @ts-expect-error "middle" is not a valid justify value.
const badJustify = <View style={{ justify: "middle" }} />;
// @ts-expect-error color is an RGBA tuple, not a string.
const badColor = <Text style={{ color: "red" }}>x</Text>;
// @ts-expect-error unknown prop is rejected (props are typed, not `any`).
const badProp = <View notARealProp />;
// @ts-expect-error rgba() takes a string, not a number.
const badRgba = rgba(0xff0000);
void badBg;
void badJustify;
void badColor;
void badProp;
void badRgba;
