# Changelog

All notable changes to Kussetsu are documented here. This project adheres to
[Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- **`boxShadow` Style field** — a GPU drop shadow painted behind the box:
  `{ x?, y?, blur?, spread?, color? }` (CSS `box-shadow`, outer only). Rendered as one analytic
  gaussian-blurred rounded rectangle (the erf technique — no multi-pass blur), in its own pass
  behind all content (and under glass). Respects `radius`, the camera (pan/zoom), overflow clip,
  and the Suspense hidden-node exclusion. The `kussetsu/compat` layer doesn't map CSS
  `box-shadow` yet (use the native field) — a separate follow-up. (Road to 1.0 — Pillar 3)
- **`margin` Style field** — space *outside* the box, with the same shape as `padding`:
  `margin` (all sides), `marginX` / `marginY`, and per-side `marginTop` / `marginRight` /
  `marginBottom` / `marginLeft` (Yoga `setMargin`, same All < axis < per-side specificity).
  The `kussetsu/compat` layer now **maps** margin too (inline `margin` 1/2/4-value shorthand +
  per-side + `margin-inline`/`block`, and Tailwind `m-*`/`mx`/`my`/`mt`/`…`) instead of
  failing loud — closing the biggest remaining compat gap. (`margin: auto` is still unwired.)
  (Road to 1.0 — Pillar 3, box-model)
- **Unit tests for the pure layer** (`test/{color,text,layout,collect}.test.mjs`, ~240 assertions)
  — the GPU-free, correctness-critical core that previously had zero coverage and regressed
  silently: color parsing (`parseColor`/`rgba`), text geometry (`measureWidth`/`wrapText`/`hitTest`/
  `selectionRects`/`caretRect`, via a deterministic fake-canvas helper), Yoga layout
  (direction/padding/gap/stretch/percent/justify/align **and the Suspense hidden-node exclusion,
  incl. `build`/`writeBack` index-alignment**), and the `collect*` passes (camera/scroll
  transforms, focus ring, clip, and **hidden-subtree exclusion** across rects/texts/semantics).
  (Road to 1.0 — Pillar 2)

### Fixed

- **GPU resources are released on teardown.** `createGpuRoot().destroy()` (and `<GpuCanvas>`
  unmount) now calls a new `Painter.destroy()` that releases the `GPUDevice`, the ~16MB glyph
  atlas, every texture/buffer, and clears the pipeline/glyph caches. Previously teardown freed
  React/DOM but **nothing GPU-side**, so every mount→unmount cycle (every route change, and
  React StrictMode's dev double-mount) leaked a whole device + atlas. (Road to 1.0 — robustness)
- **A device lost mid-frame no longer throws out of the render loop.** `Painter.frame`/`frameGraph`
  now no-op once the device is lost and catch a synchronous GPU throw (e.g. `getCurrentTexture`
  on a lost/unconfigured context), routing it to the runtime so the loop stops and `onDeviceLost`
  fires — instead of an unhandled exception escaping the `requestAnimationFrame` callback.
- **compat: inline `letter-spacing` now maps** to the real `letterSpacing` Style field (the
  painter applies it as per-glyph tracking) instead of failing loud with a false "no target".
  The em-relative Tailwind `tracking-*` still refuses, but now points to the working field
  rather than claiming there's no target. (#2)
- **Glass `refraction` default unified to `0.09`** — `GLASS_DEFAULTS` disagreed with the
  documented per-node `GlassSpec` default and the `collectGlass` fallback (`0.1` vs `0.09`), so
  enabling the global tuning / a default `setGlassOverride` subtly shifted the look. (#2)
- **Published types are now a single bundled `dist/index.d.ts`** — the build bundles declarations
  (dts-bundle-generator) instead of emitting ~18 per-module `.d.ts`, so internal modules
  (`webgpu`, `collect`, `runtime`, …) no longer ship in the npm tarball. (#2)

### Changed

- Core modules `layout.ts` / `collect.ts` / `yogaLayout.ts` now use explicit `.ts` extensions on
  their relative value-imports (matching `compat/` and `hostConfig.ts`), so they load under the
  Node test runner. No behavior or build change (Vite/tsc resolve `.ts` either way).

### Docs

- **Clarified `kussetsu/compat` is an in-repo recipe** (clone-and-run or vendor `src/compat/`),
  not a published import — with a concrete `vite.config.ts` snippet. Publishing it as an
  installable subpath is tracked as a future enhancement. (#2 / P1-15)

## [0.3.0] — 2026-06-22

Migrate the custom renderer from React 18 to **React 19**. The whole React-18 coupling lived
in one file (`src/core/hostConfig.ts`); React 19 ships a new `react-reconciler` with an
incompatible HostConfig contract, so this is a clean switch, not a dual-support range.

### Breaking

- **React 19 is now required** (`peerDependencies.react` is `^19.2.0`; was `^18.2.0`). The
  renderer is built on `react-reconciler@0.33` (was `0.29`). React 18 is no longer supported —
  the two reconciler contracts are mutually exclusive. **Pin `kussetsu@0.2.x` for React 18.**

### Changed

- **`hostConfig.ts` rewritten for the `react-reconciler@0.33` contract**, verified against the
  actual installed reconciler source:
  - Dropped `prepareUpdate` (removed in React 19); `commitUpdate` is now the 5-arg
    `(instance, type, prevProps, nextProps, internalHandle)` form (no `updatePayload`).
  - Replaced `getCurrentEventPriority` with the renderer-held priority trio
    `setCurrentUpdatePriority` / `getCurrentUpdatePriority` / `resolveUpdatePriority`.
  - `createContainer` updated to its 10-arg React-19 signature (split error callbacks
    `onUncaughtError` / `onCaughtError` / `onRecoverableError` + `onDefaultTransitionIndicator`);
    the old `@ts-expect-error` on the call is gone (runtime and `@types` now agree).
  - Added the required React-19 Suspense-in-commit / transition members (`maySuspendCommit`,
    `startSuspendingCommit`, `suspendInstance`, `waitForCommitToBeReady`, `preloadInstance`,
    `requestPostPaintCallback`, `shouldAttemptEagerTransition`, `resetFormInstance`,
    `trackSchedulerEvent`, `resolveEventType`/`resolveEventTimeStamp`) and the two value
    members (`NotPendingTransition`, `HostTransitionContext`) — no-ops/defaults for this renderer.
  - Added the Offscreen visibility hooks (`hideInstance` / `unhideInstance` /
    `hideTextInstance` / `unhideTextInstance`), wired to real subtree hiding (see Added).
- **JSX intrinsics augmentation moved to `declare module "react"`** — React 19 dropped the
  global `JSX` namespace, so the React-18-era `declare global { namespace JSX }` no longer
  registered `<view>` / `<text>` under the `react-jsx` runtime.
- Bumped dev/type deps to React 19 (`react@^19.2`, `@types/react@^19.2`).

### Added

- **Suspense / `<Activity>` visibility is now fully wired** (not just crash-safe). A `hidden`
  flag on scene nodes — toggled by the reconciler's hide/unhide hooks when a `<Suspense>`
  boundary flips to/from its fallback — is honored across the whole render pipeline: every
  `collect*` paint/semantics/scroll/selection/editable pass, Yoga layout (`build` + `writeBack`
  stay index-aligned, so a hidden subtree takes **no layout space** — the fallback flows
  normally), hit-testing, page-scroll measurement, and the a11y overlay. A suspended subtree
  paints nothing, takes no space, and receives no input, then fully reappears on resolve.
  Suspending a field *while it's being edited* also releases the transparent text-input overlay
  (so a focused, off-screen field can't keep capturing keystrokes or trap keyboard/AT focus).
- **Runtime reconciler smoke test** (`test/reconciler.test.mjs`) — drives the production
  concurrent root through mount → prop update → child add/remove → unmount and a full
  `<Suspense>` re-suspend → resolve cycle, asserting the scene graph mutates correctly **and
  that the hidden subtree is excluded from the visible tree then fully unhidden**. This closes
  the prior gap where no test exercised the reconciler at runtime (so a wrong `commitUpdate`
  signature or a broken visibility hook would have shipped silently).

## [0.2.0] — 2026-06-22

First DX pass since the initial release: declarative mount, typed authoring components,
R3F-style hooks, percentage layout, a border primitive, and a hardened device-loss/resize
runtime. **Backward compatible — no breaking changes** (lowercase `<view>`/`<text>` and
zero-arg `onActivate` handlers still work).

### Added

- **`border` / `borderColor` Style fields** — a hairline/outline stroke on the box edge that
  follows the `radius` / `cornerSmoothing` corners and works with or without a `background`
  (a default faint hairline if no color; a sub-pixel width still paints a crisp ~1px line).
  Packed into the rect pipeline's spare instance slot (no extra draw, no stride growth).
  The CSS/Tailwind compat layer doesn't auto-map `border` yet (use the native field); and
  `box-shadow` / group `opacity` remain future work (separate shadow pass / offscreen
  subtree compositing).

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
