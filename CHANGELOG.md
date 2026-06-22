# Changelog

All notable changes to Kussetsu are documented here. This project adheres to
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- **`debug` option** (`createGpuRoot` / `<GpuCanvas>`) — an opt-in corner perf overlay showing
  fps · frame-ms · draw counts (rect / glass / material / particle). A single opaque canvas
  otherwise hides DevTools' element + perf panels.

- **`root.setGlassOverride(params | null)`** (also `useGpuRoot().setGlassOverride`) — a
  root-scoped glass override (partial, merged over `GLASS_DEFAULTS`; `null` clears). The
  sound alternative to the process-wide `glassTuning` global, which is now documented as
  overriding every mounted root and mutating outside React (the global still works as a
  dev convenience / fallback).

- **`useSpring` vector / RGBA overload.** `useSpring` now also animates a `number[]` / `RGBA`
  (each component its own spring, shared config), so you can spring a color or an (x, y) in one
  hook — `useSpring(rgba("#5C5CFF"))`. The scalar `number` form is unchanged.

- **R3F-style hooks** for components inside a Kussetsu tree: `useFrame((dt) => …)` (per-frame
  callback; the loop runs continuously while any is mounted, so it drives animation),
  `useViewport()` (`{ width, height }`, re-renders on resize), and `useGpuRoot()` (the
  imperative `GpuRoot` — camera / hitTest / …). The runtime now wraps the rendered tree in a
  React context provider (context works across the custom reconciler).
- **Percentage / proportional sizing.** `width` / `height` / `minWidth` / `maxWidth` /
  `minHeight` / `maxHeight` and a new `basis` (flex-basis) now accept a `"NN%"` string (a
  percentage of the parent) in addition to px — wired to Yoga's percent dimensions. `width`
  still also takes `"stretch"` (cross-axis fill). Exported a `Size` type.
- **Shader/effect docs + feedback.** The WGSL `material` contract (the `fn material` signature,
  in-scope helpers, and the `uniforms` → `u.c0..u.c3` lane mapping) is now full JSDoc on
  `MaterialSpec` (shows on hover), and `particles` / `postProcess` are documented in the README.
  A `material` shader that fails to compile now logs a console error with the line mapped back
  to **your** source; passing more than 16 `uniforms` floats warns (the rest are ignored).
  Exported a `PostProcess` type.
- **Hover + richer activation.** `onPointerEnter` / `onPointerLeave` (hover) on any node,
  and `onActivate` now receives an `ActivateEvent` (`button` + `metaKey` / `shiftKey` / …) —
  so you can build hover/highlight and cmd-click in plain React without a shader.
- **Per-side padding + gap axes.** `paddingX` / `paddingY` / `paddingTop` / `paddingRight` /
  `paddingBottom` / `paddingLeft`, plus `rowGap` / `columnGap` on `Style`.
- **Imperative `GpuRoot` escapes.** `getCamera()` / `setCamera({ tx?, ty?, scale? })` /
  `resetCamera()`, `hitTest(x, y)` (node id at a canvas point), `resize()`, and `getCanvas()`.
- **`<GpuCanvas>`** — the declarative way to mount Kussetsu in a React app. Owns the
  canvas + positioned wrapper, runs `createGpuRoot` in an effect, re-renders on updates,
  tears down on unmount (StrictMode-safe), and shows a `fallback` when WebGPU is absent.
  `createGpuRoot` stays the lower-level escape hatch.
- **Typed `<View>` / `<Text>` components** — the recommended authoring API. They render
  the same GPU host elements but type-check cleanly, fixing the `<view>` / `<text>` ↔
  React-SVG-intrinsic collision ([#2](https://github.com/StephenSHorton/kussetsu/issues/2)).
- `onDeviceLost` / `onError` options (on `createGpuRoot` and `<GpuCanvas>`). On WebGPU
  device loss Kussetsu now **stops the render loop** and notifies (and `<GpuCanvas>` shows
  its `fallback`) instead of silently freezing while flooding the console.
- Automatic resize: a `ResizeObserver` on the canvas repaints on element-level size changes
  (resizable panels, collapsing sidebars), not just `window` resize.
- `rgba(hexOrCss, alpha?)` — convert a hex / `rgb()` / named color into a Kussetsu
  `RGBA` tuple (0..1, straight alpha). Throws on an unparseable color.
- `justify` now accepts `"space-between"`, `"space-around"`, and `"space-evenly"`.
- Re-exported the `ParticleSpec` type from the package root.
- Dev-mode `console.warn`s for the two silent first-run footguns: a zero-sized canvas
  and a non-positioned parent.
- `test:types` — a committed consumer type-check fixture (`test/types/`) that guards the
  `<View>` / `<Text>` typings against regression; runs in CI on every PR.

### Changed

- Authoring API is now `<View>` / `<Text>` (capitalised). The lowercase `<view>` /
  `<text>` host elements still work at runtime as an untyped escape hatch.
- `onActivate` signature widened `() => void` → `(e: ActivateEvent) => void` (backward
  compatible — zero-arg handlers stay assignable).
- `<View>` / `<Text>` `children` are typed `React.ReactNode` (was `unknown`).
- README: complete copy-pasteable HTML/CSS scaffold + error handling in Quick start;
  corrected the publish / WebGPU-fallback / React-version / ESM / type-checking notes.
- `package.json`: R3F-anchored description, more keywords, plus `engines`, `bugs`.

## [0.1.0]

- Initial public release: WebGPU renderer; `<view>` / `<text>` host elements;
  `createGpuRoot`; glass / material / particles / postProcess primitives; `useSpring`.
