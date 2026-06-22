// Consumer type-check fixture — compiled with `npm run test:types`.
//
// Proves the public authoring surface type-checks the way a real app's tsconfig sees it
// (jsx: react-jsx, moduleResolution: bundler, skipLibCheck: true), importing from the
// BUILT package. The `@ts-expect-error` lines are negative guards: each MUST stay an
// error, so if the typing ever goes loose (e.g. props collapse to `any`, or the
// <view>/<text> SVG-intrinsic collision comes back), this file stops compiling.
import { createGpuRoot, GpuCanvas, View, Text, rgba, useSpring, useFrame, useViewport, useGpuRoot } from "kussetsu";
import type { GpuRoot, Style, RGBA, ParticleSpec, MaterialSpec, PostProcess, ViewProps, ActivateEvent } from "kussetsu";

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
// GPU effects: material (with live uniforms + backdrop), particles, postProcess
const mat: MaterialSpec = { shader: "fn material(uv: vec2f, px: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }", uniforms: () => [1, 2, 3], backdrop: true, animated: true };
const bloom: PostProcess = "bloom";
void mat;
void bloom;
// per-side padding + gap axes
const card: Style = { paddingX: 16, paddingY: 8, paddingTop: 12, rowGap: 6, columnGap: 10 };
// percentage / proportional sizing
const fluid: Style = { width: "50%", height: "100%", maxWidth: "80%", minHeight: "10%", basis: "33%", grow: 1 };
const px: Style = { width: "stretch", height: 200 }; // px + "stretch" (cross-axis) still valid
void card;
void fluid;
void px;
void bar;
void headingProps;
void card;

// ── the documented authoring shape — must type-check clean ───────────────────────
function App() {
  const lift: number = useSpring(12); // scalar → number
  const xy: [number, number] = useSpring([0, 100] as [number, number]); // vector → tuple
  const color: RGBA = useSpring(rgba("#5C5CFF"), { stiffness: 120 }); // RGBA → RGBA (each channel springs)
  void xy;
  void color;
  void lift;
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
  root.setGlassOverride({ refraction: 0.2, dispersion: 0.1 }); // partial override
  root.setGlassOverride(null); // clear

  root.destroy();
}
void boot;
void App;

// ── R3F-style hooks (used inside the Kussetsu tree) ──────────────────────────────
function Animated() {
  const { width, height } = useViewport(); // { width, height } in css px
  const root = useGpuRoot(); // imperative controls (GpuControls)
  root.setGlassOverride({ tint: 0.1 }); // root-scoped glass override is reachable from a component
  useFrame((dt: number) => {
    root.setCamera({ scale: 1 + Math.sin(dt) * 0 }); // dt is seconds since last frame
  });
  return (
    <View style={{ width: width > 600 ? "50%" : "100%", height }}>
      <Text>{`${width}x${height}`}</Text>
    </View>
  );
}
void Animated;

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
      <View material={mat} postProcess="bloom" particles={dots} style={{ width: 240, height: 160 }} />
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
// @ts-expect-error a Size is px (number), "NN%", or (width) "stretch" — not "50px".
const badSize = <View style={{ width: "50px" }} />;
// @ts-expect-error postProcess only accepts the "bloom" literal.
const badPost = <View postProcess="glow" />;
void badBg;
void badJustify;
void badColor;
void badProp;
void badRgba;
void badSize;
void badPost;
