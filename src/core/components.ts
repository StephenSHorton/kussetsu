// The typed authoring API: `<View>` (a box) and `<Text>` (a string).
//
// These are the host elements `<view>` / `<text>` wrapped so they type-check cleanly.
// We can't type the *lowercase* intrinsics: `@types/react` already claims `view` and
// `text` for SVG in `JSX.IntrinsicElements`, and a module augmentation can only *merge*
// with that (intersecting Kussetsu's `style: Style` with SVG's `style: CSSProperties`),
// so `background: rgba(...)` and friends fail to type-check. Capitalised components don't
// go through `IntrinsicElements` at all, so they sidestep the collision entirely.
//
// The trick: each is the *string* `"view"` / `"text"` at runtime — `<View/>` compiles to
// `jsx("view", …)`, the exact same host element the reconciler builds — but is *typed* as
// a component taking Kussetsu's props. Zero runtime cost, full type-safety + autocomplete.
//
//   import { View, Text, rgba } from "kussetsu";
//   <View glass={{ refraction: 0.1 }} style={{ padding: 28, background: rgba("#0b0e14") }}>
//     <Text style={{ fontWeight: 800 }}>Hello, light.</Text>
//   </View>
import type { FC } from "react";
import type { NodeProps } from "./scene";

/** Props for `<View>` / `<Text>` — Kussetsu's node props (`style`, `glass`, `onActivate`, …). */
export type ViewProps = NodeProps;
export type TextProps = NodeProps;

/** A box. The GPU-painted equivalent of a `<div>` — flex layout, glass, material, etc. */
export const View = "view" as unknown as FC<ViewProps>;

/** A string. Put your text content as children: `<Text>hello</Text>`. */
export const Text = "text" as unknown as FC<TextProps>;
