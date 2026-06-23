// Runtime smoke test for the custom React→scene reconciler (src/core/hostConfig.ts).
//
// The build/types tests do NOT exercise the reconciler at runtime, so a wrong HostConfig
// signature (the React-18→19 migration's sharpest hazard) would ship silently. This drives
// the ACTUAL production concurrent root through mount → prop update → child add/remove →
// unmount and asserts the scene graph mutates correctly. In particular, if commitUpdate's
// arg order were wrong, `style.gap` below would be set from the wrong positional arg and
// the prop-update assertion would fail. Run: `node test/reconciler.test.mjs` (Node ≥23).
import { act, createElement as h, Suspense, useState } from "react";
import { createRoot } from "../src/core/hostConfig.ts";
import { textOf } from "../src/core/scene.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let pass = 0,
  fail = 0;
const ok = (name, cond, detail) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
};

// A minimal fake host container (no WebGPU needed — the reconciler only mutates the tree
// and calls onDirty once per commit via resetAfterCommit).
let commits = 0;
const container = { kind: "container", canvas: {}, children: [], dirty: false, onDirty: () => commits++ };

// A component driven from the outside via a captured setState. Renders a <view> whose
// `gap` style tracks state (exercises commitUpdate), a <text> label (commitTextUpdate),
// and `n` child <view>s (appendChild / insertBefore / removeChild).
let setN;
function App() {
  const [n, setNState] = useState(0);
  setN = setNState;
  return h(
    "view",
    { style: { gap: n }, role: "button" },
    h("text", null, `count ${n}`),
    ...Array.from({ length: n }, (_, i) => h("view", { key: i, style: { width: i } })),
  );
}

const root = createRoot(container);
const rootView = () => container.children[0];
const label = () => rootView().children[0];
const childViews = () => rootView().children.slice(1);

// ── mount ───────────────────────────────────────────────────────────────────────
await act(() => root.render(h(App)));
ok("mount: one root <view> in container", container.children.length === 1 && rootView().type === "view");
ok("mount: props applied (role)", rootView().props.role === "button");
ok("mount: initial gap = 0", rootView().props.style?.gap === 0);
ok("mount: <text> child with text 'count 0'", label().type === "text" && textOf(label()) === "count 0");
ok("mount: zero child views", childViews().length === 0);
ok("mount: a commit fired (onDirty)", commits >= 1);

// ── update: props change + children added ─────────────────────────────────────────
const commitsBefore = commits;
await act(() => setN(3));
ok("update: gap prop updated to 3 (commitUpdate arg order)", rootView().props.style?.gap === 3);
ok("update: text updated to 'count 3' (commitTextUpdate)", textOf(label()) === "count 3");
ok("update: three child views appended", childViews().length === 3);
ok("update: child views carry their props", childViews()[2].props.style?.width === 2);
ok("update: another commit fired", commits > commitsBefore);

// ── update: children removed ──────────────────────────────────────────────────────
await act(() => setN(1));
ok("shrink: gap prop updated to 1", rootView().props.style?.gap === 1);
ok("shrink: text updated to 'count 1'", textOf(label()) === "count 1");
ok("shrink: one child view remains (removeChild)", childViews().length === 1);

// ── unmount ───────────────────────────────────────────────────────────────────────
await act(() => root.unmount());
ok("unmount: container emptied", container.children.length === 0);

// ── Suspense: live content → RE-SUSPEND (hides primary) → resolve (unhides) ──────────
// Drives the reconciler's Offscreen visibility path: a <Suspense> boundary that has already
// committed its primary content and then re-suspends on an urgent update HIDES the live
// subtree (hideInstance/hideTextInstance) and shows the fallback, then UNHIDES on resolve.
// Those HostConfig hooks must EXIST or each host/text node in the toggled subtree throws a
// TypeError routed to onCaughtError. We assert the cycle renders correctly AND that no
// reconciler-level error leaked to console.error. (Verified to have teeth: making any of the
// four hooks throw fails the "no reconciler error" assertion below.)
{
  // VISIBLE text — mirrors the real paint/layout passes, which skip hidden subtrees.
  const visibleText = (node, out = []) => {
    for (const c of node.children ?? []) {
      if (c.hidden) continue; // a hidden subtree paints nothing
      if (c.kind === "text") out.push(c.text);
      else if (c.kind === "element") {
        if (c.type === "text") out.push(textOf(c));
        else visibleText(c, out);
      }
    }
    return out;
  };
  // Any element/text node flagged hidden anywhere in the tree.
  const anyHidden = (node) =>
    (node.children ?? []).some((c) => c.hidden || (c.kind === "element" && anyHidden(c)));
  const cache = new Map(); // version -> { promise, done, resolve }
  const resource = (v) => {
    let e = cache.get(v);
    if (!e) {
      let r;
      const promise = new Promise((res) => (r = res));
      e = { promise, done: false, resolve: () => ((e.done = true), r()) };
      cache.set(v, e);
    }
    return e;
  };
  resource(0).resolve(); // version 0 starts already-resolved so the boundary mounts visible

  let setV;
  function Child({ v }) {
    const e = resource(v);
    if (!e.done) throw e.promise; // a NEW version suspends
    return h("text", null, `v${v}`);
  }
  function Boundary() {
    const [v, setVState] = useState(0);
    setV = setVState;
    return h(Suspense, { fallback: h("text", null, "loading") }, h(Child, { v }));
  }

  const sContainer = { kind: "container", canvas: {}, children: [], dirty: false, onDirty: () => {} };
  const sRoot = createRoot(sContainer);
  const errors = [];
  const origError = console.error;
  console.error = (...a) => errors.push(a.map(String).join(" "));
  try {
    await act(() => sRoot.render(h(Boundary)));
    ok("suspense mount: primary v0 visible", visibleText(sContainer).includes("v0"));
    ok("suspense mount: nothing hidden", !anyHidden(sContainer));

    // Urgent (non-transition) update to an unresolved version → boundary re-suspends →
    // the live v0 subtree is HIDDEN and the fallback shown.
    await act(() => setV(1));
    const reSuspend = visibleText(sContainer);
    ok("suspense re-suspend: fallback shown", reSuspend.includes("loading"));
    ok("suspense re-suspend: hidden v0 excluded from the visible tree", !reSuspend.includes("v0"));
    ok("suspense re-suspend: a subtree is flagged hidden", anyHidden(sContainer));

    // Resolve v1 → primary UNHIDDEN / replaced.
    await act(async () => {
      resource(1).resolve();
      await resource(1).promise;
    });
    ok("suspense resolve: primary v1 visible", visibleText(sContainer).includes("v1"));
    ok("suspense resolve: nothing left hidden (fully unhidden)", !anyHidden(sContainer));
  } finally {
    console.error = origError;
  }
  const reconErr = errors.find((e) => /gpu-renderer (caught|uncaught)|is not a function/.test(e));
  ok("suspense: no reconciler error during visibility toggle", !reconErr, reconErr);
  await act(() => sRoot.unmount());
}

console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
