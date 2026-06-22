# Changelog

All notable changes to Kussetsu are documented here. This project adheres to
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- **`<GpuCanvas>`** — the declarative way to mount Kussetsu in a React app. Owns the
  canvas + positioned wrapper, runs `createGpuRoot` in an effect, re-renders on updates,
  tears down on unmount (StrictMode-safe), and shows a `fallback` when WebGPU is absent.
  `createGpuRoot` stays the lower-level escape hatch.
- **Typed `<View>` / `<Text>` components** — the recommended authoring API. They render
  the same GPU host elements but type-check cleanly, fixing the `<view>` / `<text>` ↔
  React-SVG-intrinsic collision ([#2](https://github.com/StephenSHorton/kussetsu/issues/2)).
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
- `<View>` / `<Text>` `children` are typed `React.ReactNode` (was `unknown`).
- README: complete copy-pasteable HTML/CSS scaffold + error handling in Quick start;
  corrected the publish / WebGPU-fallback / React-version / ESM / type-checking notes.
- `package.json`: R3F-anchored description, more keywords, plus `engines`, `bugs`.

## [0.1.0]

- Initial public release: WebGPU renderer; `<view>` / `<text>` host elements;
  `createGpuRoot`; glass / material / particles / postProcess primitives; `useSpring`.
