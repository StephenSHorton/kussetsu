# Changelog

All notable changes to Kussetsu are documented here. This project adheres to
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- `rgba(hexOrCss, alpha?)` — convert a hex / `rgb()` / named color into a Kussetsu
  `RGBA` tuple (0..1, straight alpha). Throws on an unparseable color.
- `justify` now accepts `"space-between"`, `"space-around"`, and `"space-evenly"`.
- Re-exported the `ParticleSpec` type from the package root.
- Dev-mode `console.warn`s for the two silent first-run footguns: a zero-sized canvas
  and a non-positioned parent.

### Changed

- `<view>` / `<text>` `children` are now typed `React.ReactNode` (was `unknown`).
- README: complete copy-pasteable HTML/CSS scaffold + error handling in Quick start;
  corrected the publish / WebGPU-fallback / React-version / ESM notes.
- `package.json`: R3F-anchored description, more keywords, plus `engines`, `bugs`.

### Known

- The `<view>` / `<text>` host elements still type-check against React's SVG intrinsics
  for consumers (see [#2](https://github.com/StephenSHorton/kussetsu/issues/2)); the
  type-collision fix lands next.

## [0.1.0]

- Initial public release: WebGPU renderer; `<view>` / `<text>` host elements;
  `createGpuRoot`; glass / material / particles / postProcess primitives; `useSpring`.
