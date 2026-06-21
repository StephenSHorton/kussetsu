// Deterministic, headless test for kussetsu/compat — proves the four hard claims:
//   1. tag-aliasing (div→view, h*→text+role, button→view+role+onActivate, input→editable)
//   2. className (Tailwind subset) + inline style → mapped Style, with NO Tailwind engine
//   3. fail-loud-at-build with a code frame on everything unpaintable
//   4. coexistence: hand-authored <view>/<text> pass through untouched
//
// Runs the actual Babel plugin (esbuild-bundled from the TS source) over snippets and
// asserts on the transformed JSX. Run: `node test/compat.test.mjs` (after npm install).
import * as babel from "@babel/core";
// Node ≥23 strips TS types + resolves explicit .ts imports, so we load the plugin source
// directly (it pulls in the pure mappers transitively). Run with a recent Node.
const plugin = (await import("../src/compat/babel.ts")).default;

function transform(code) {
  return babel.transformSync(code, {
    configFile: false,
    babelrc: false,
    filename: "Demo.tsx",
    plugins: [plugin],
    parserOpts: { plugins: ["jsx", "typescript"] },
  }).code;
}

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`); } };

// ── GOOD: must transform, must contain ──────────────────────────────────────────
const good = [
  ["div + tailwind + inline", `<div className="flex-row items-center p-4 bg-slate-800" style={{ width: 380, gap: 16 }} />`,
    ["<view", `direction: "row"`, `align: "center"`, "padding: 16", "width: 380", "gap: 16", "background: ["]],
  ["h1 → text+heading", `<h1 className="text-2xl font-bold text-white">Hi</h1>`,
    ["<text", `role="heading"`, "level={1}", "fontSize: 24", "fontWeight: 700", "color: [1, 1, 1, 1]", "Hi"]],
  ["button → view+role+onActivate", `<button onClick={f}>Send</button>`,
    ["<view", `role="button"`, "onActivate={f}", "<text", "Send"]],
  ["view-host folds mixed text", `<div>Hello {name}</div>`, ["<view", "<text", "Hello", "{name}"]],
  ["input → editable + shim", `<input value={v} onChange={e => setV(e.target.value)} />`,
    ["editable", "onChange={__v =>", "target: {", "value: __v", "<text"]],
  ["rounded-full + arbitrary", `<div className="rounded-full" style={{ background: "#1a1a2e" }} />`, ["radius: 9999", "background: ["]],
  ["arbitrary value", `<div className="w-[37px] bg-[#ff0000]" />`, ["width: 37", "background: [1, 0, 0, 1]"]],
  ["coexistence: view passes through", `<div><view glass={g}><text>native</text></view></div>`, ["<view glass={g}>", "<text>native</text>"]],
  ["p → paragraph", `<p className="text-sm">x</p>`, ["<text", `role="paragraph"`, "fontSize: 14"]],
];
console.log("GOOD (transform + assert):");
for (const [name, code, needles] of good) {
  let result;
  try { result = transform(code); } catch (e) { ok(name, false, `threw: ${String(e.message).split("\n")[0]}`); continue; }
  const missing = needles.filter((n) => !result.includes(n));
  ok(name, missing.length === 0, missing.length ? `missing ${JSON.stringify(missing)}\n      got: ${result.replace(/\s+/g, " ").trim()}` : "");
}

// ── BAD: must throw, message must contain fragment AND a code frame (location) ───
const bad = [
  ["img", `<img src="a.png" />`, "img has no GPU target"],
  ["inline box-shadow", `<div style={{ boxShadow: "0 1px 2px #000" }} />`, "box-shadow has no GPU target"],
  ["tailwind shadow-lg", `<div className="shadow-lg" />`, "shadow-"],
  ["tailwind margin", `<div className="m-4" />`, "margin"],
  ["inline margin", `<div style={{ marginTop: 8 }} />`, "margin-top is not wired"],
  ["dynamic inline value", `<div style={{ background: someColor }} />`, "dynamic value for 'background'"],
  ["dynamic className", `<div className={cn("p-2")} />`, "dynamic className"],
  ["hover variant", `<div className="hover:bg-slate-800" />`, "'hover:' variant"],
  ["responsive variant", `<div className="md:flex-row" />`, "'md:' variant"],
  ["onMouseEnter", `<span onMouseEnter={f}>x</span>`, "hover isn't wired"],
  ["onClick on div", `<div onClick={f}>x</div>`, "onClick on <div>"],
  ["inline rich text", `<p>a <strong>b</strong></p>`, "inline rich text isn't supported"],
  ["select", `<select />`, "select has no target"],
  ["textarea", `<textarea value={v} onChange={f} />`, "textarea (multi-line)"],
  ["uncontrolled input", `<input value={v} />`, "must be controlled"],
  ["input type=checkbox", `<input type="checkbox" value={v} onChange={f} />`, `type="checkbox"`],
  ["spread props", `<div {...props} />`, "spread props"],
  ["display grid via tailwind", `<div className="grid" />`, "display:grid"],
  ["asymmetric padding", `<div style={{ paddingTop: 4, paddingBottom: 12 }} />`, "per-side padding"],
  ["overflow-x", `<div className="overflow-x-auto" />`, "overflow-x"],
  ["z-index", `<div className="z-10" />`, "z-index has no target"],
  ["a href", `<a href="/x">link</a>`, "navigation isn't wired"],
  ["unknown utility", `<div className="prose" />`, "unknown utility"],
  // —— review-driven fail-louds (silent drops the adversarial pass caught) ——
  ["tailwind uppercase", `<div className="uppercase">x</div>`, "uppercase"],
  ["inline textTransform", `<div style={{ textTransform: "uppercase" }}>x</div>`, "text-transform"],
  ["button disabled", `<button disabled onClick={f}>x</button>`, "disabled"],
  ["input disabled", `<input disabled value={v} onChange={f} />`, "disabled"],
  ["div hidden", `<div hidden>x</div>`, "hidden"],
  ["uncontrolled defaultValue", `<input defaultValue="x" onChange={f} />`, "defaultValue"],
  ["lone gap-x", `<div className="gap-x-4" />`, "single-axis gap"],
  ["inline single-axis columnGap", `<div style={{ columnGap: 8 }} />`, "single-axis gap"],
  ["onChange on div", `<div onChange={f}>x</div>`, "onChange on <div>"],
  ["input onChange string literal", `<input value={v} onChange="foo" />`, "function expression"],
  ["pointer-events none", `<div style={{ pointerEvents: "none" }} />`, "pointer-events:none"],
  ["min-w-full → percent", `<div className="min-w-full" />`, "min-width"],
];
console.log("BAD (must fail loud with a location):");
for (const [name, code, fragment] of bad) {
  let threw = null;
  try { transform(code); } catch (e) { threw = e; }
  if (!threw) { ok(name, false, "did NOT throw"); continue; }
  const msg = String(threw.message);
  const hasFragment = msg.includes(fragment);
  const hasFrame = /[>|]\s*\d+\s*\|/.test(msg) || msg.includes("Demo.tsx"); // code frame or filename = a location
  ok(name, hasFragment && hasFrame, !hasFragment ? `message missing "${fragment}": ${msg.split("\n")[0]}` : "no code frame/location in message");
}

// ── STRUCTURAL: a lone {expr} in a <view> must NOT be folded into <text> (it may be
//    elements — the common container pattern), but literal text labels MUST be. ─────
console.log("STRUCTURAL (auto-wrap correctness):");
{
  const r = transform(`<div>{items.map(x => <span>{x}</span>)}</div>`);
  ok("lone {expr} list left as view child (not text-wrapped)", /<view>\s*\{items\.map/.test(r) && !/<view>\s*<text>\s*\{items/.test(r), r.replace(/\s+/g, " "));
}
{
  const r = transform(`<div>{name}</div>`);
  ok("lone {stringExpr} left as view child", /<view>\s*\{name\}\s*<\/view>/.test(r), r.replace(/\s+/g, " "));
}
{
  const r = transform(`<div>Hi {name}</div>`);
  ok("literal text + expr folded into one <text>", /<text[^>]*>\s*Hi\s*\{name\}/.test(r), r.replace(/\s+/g, " "));
}
{
  const r = transform(`<div className="self-stretch inline-flex" />`);
  ok("self-stretch + inline-flex map", r.includes(`width: "stretch"`) && r.includes(`direction: "row"`), r.replace(/\s+/g, " "));
}

console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
