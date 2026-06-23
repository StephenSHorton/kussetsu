// Unit tests for the collect* passes in src/core/collect.ts.
//
// These passes turn the laid-out scene tree into flat draw/semantics lists, applying the
// pan/zoom CAMERA (world -> screen) and per-region SCROLL offsets. We isolate collect from
// the layout engine by stamping x/y/w/h directly via placed(). Key formulas from source:
//   screen x = node.x * cam.scale + cam.tx
//   screen y = (node.y - scrollOffset) * cam.scale + cam.ty
//   sizes   *= cam.scale
//
// Run: node test/collect.test.mjs   (Node >=23 strips TS types, resolves .ts imports)
import { makeHarness, approx, approxArr, el, container, placed } from "./helpers.mjs";
import { collectRects, collectTexts, collectSemantics, collectScrollRegions } from "../src/core/collect.ts";

const { ok, done } = makeHarness();

const ID = { tx: 0, ty: 0, scale: 1 }; // identity camera
const CAM = { tx: 10, ty: 20, scale: 2 }; // non-identity: scale 2, tx 10, ty 20
const NOSCROLL = new Map();

// ── collectRects ─────────────────────────────────────────────────────────────

// (1) A node with style.background emits exactly one rect; camera applied.
{
  const node = placed(el("view", { style: { background: [1, 0, 0, 1] } }), 100, 200, 50, 30);
  const rects = collectRects(node, null, ID, NOSCROLL);
  ok("bg node emits one rect", rects.length === 1, `got ${rects.length}`);
  const r = rects[0];
  ok("bg rect identity geometry", approx(r.x, 100) && approx(r.y, 200) && approx(r.w, 50) && approx(r.h, 30), JSON.stringify(r));
  ok("bg rect color forwarded", approxArr(r.color, [1, 0, 0, 1]), JSON.stringify(r.color));
}

// (2) Non-identity camera: scale 2, tx 10, ty 20.  x = 100*2+10=210, y = 200*2+20=420, w=100, h=60.
{
  const node = placed(el("view", { style: { background: [0, 1, 0, 1] } }), 100, 200, 50, 30);
  const rects = collectRects(node, null, CAM, NOSCROLL);
  ok("bg rect emitted under non-identity cam", rects.length === 1, `got ${rects.length}`);
  const r = rects[0];
  ok("camera transform applied to rect", approx(r.x, 210) && approx(r.y, 420) && approx(r.w, 100) && approx(r.h, 60), JSON.stringify(r));
}

// (3) A node with border (no background) emits a rect with borderWidth scaled + a borderColor.
{
  const node = placed(el("view", { style: { border: 2 } }), 0, 0, 40, 40);
  const rects = collectRects(node, null, CAM, NOSCROLL);
  ok("border-only node emits a rect", rects.length === 1, `got ${rects.length}`);
  const r = rects[0];
  ok("borderWidth scaled by cam", approx(r.borderWidth, 4), `borderWidth=${r.borderWidth}`);
  ok("borderColor present (default hairline)", Array.isArray(r.borderColor), JSON.stringify(r.borderColor));
}

// (4) A node with NEITHER background NOR border emits nothing.
{
  const node = placed(el("view", { style: { radius: 8 } }), 0, 0, 10, 10);
  const rects = collectRects(node, null, ID, NOSCROLL);
  ok("plain node emits no rect", rects.length === 0, `got ${rects.length}`);
}

// (5) Glass / material nodes do NOT recurse here: their bg-bearing children are skipped.
{
  const child = placed(el("view", { style: { background: [1, 1, 1, 1] } }), 5, 5, 10, 10);
  const glass = placed(el("view", { glass: {} }, child), 0, 0, 100, 100);
  const rects = collectRects(glass, null, ID, NOSCROLL);
  ok("glass node emits no rect and does not recurse", rects.length === 0, `got ${rects.length}`);

  const mchild = placed(el("view", { style: { background: [1, 1, 1, 1] } }), 5, 5, 10, 10);
  const mat = placed(el("view", { material: { shader: "" } }, mchild), 0, 0, 100, 100);
  const mrects = collectRects(mat, null, ID, NOSCROLL);
  ok("material node emits no rect and does not recurse", mrects.length === 0, `got ${mrects.length}`);
}

// (6) Focus ring: when focusedId matches, an extra rect is pushed (inflated by 4 each side
//     in world px, color = FOCUS_RING). Push order: focus ring BEFORE the fill rect.
{
  const node = placed(el("view", { style: { background: [1, 0, 0, 1] } }), 100, 200, 50, 30);
  const rects = collectRects(node, node.id, ID, NOSCROLL);
  ok("focus ring + fill = 2 rects", rects.length === 2, `got ${rects.length}`);
  const ring = rects[0]; // ring pushed first
  ok("focus ring geometry inflated by 4", approx(ring.x, 96) && approx(ring.y, 196) && approx(ring.w, 58) && approx(ring.h, 38), JSON.stringify(ring));
  ok("focus ring color is the focus cyan", approxArr(ring.color, [0.35, 0.95, 1.0, 1]), JSON.stringify(ring.color));
  ok("fill rect still emitted after ring", rects[1].x === 100 && rects[1].y === 200, JSON.stringify(rects[1]));
}

// (6b) Focus ring inflate (-4 / +8) is in SCREEN px, applied AFTER scaling. For CAM the node
//      first maps to (210,420,100,60), then inflates: x=206, y=416, w=108, h=68. The ring
//      radius IS scaled: ((s.radius ?? 0) + 4) * scale = (0 + 4) * 2 = 8.
{
  const node = placed(el("view", { style: { background: [1, 0, 0, 1] } }), 100, 200, 50, 30);
  const rects = collectRects(node, node.id, CAM, NOSCROLL);
  const ring = rects[0];
  ok("focus ring inflated in screen px after scaling", approx(ring.x, 206) && approx(ring.y, 416) && approx(ring.w, 108) && approx(ring.h, 68), JSON.stringify(ring));
  ok("focus ring radius scaled by camera", approx(ring.radius, 8), `radius=${ring.radius}`);
}

// (7) Focus ring fires even on a node with no bg/border (selection outline on a plain view).
{
  const node = placed(el("view", {}), 0, 0, 20, 20);
  const rects = collectRects(node, node.id, ID, NOSCROLL);
  ok("focus ring on plain node = 1 rect (ring only)", rects.length === 1, `got ${rects.length}`);
  ok("the sole rect is the ring color", approxArr(rects[0].color, [0.35, 0.95, 1.0, 1]), JSON.stringify(rects[0].color));
}

// ── collectTexts ─────────────────────────────────────────────────────────────

// (8) A type:"text" node emits a TextItem with its concatenated text; camera applied.
{
  const t = placed(el("text", { style: { fontSize: 16 } }, "hello"), 100, 200, 40, 16);
  const items = collectTexts(t, ID, NOSCROLL);
  ok("text node emits one TextItem", items.length === 1, `got ${items.length}`);
  ok("text content is the concatenated string", items[0].text === "hello", JSON.stringify(items[0].text));
  ok("text position under identity cam", approx(items[0].x, 100) && approx(items[0].y, 200), JSON.stringify(items[0]));
  ok("text size = fontSize * scale", approx(items[0].size, 16), `size=${items[0].size}`);
}

// (8b) Concatenation across multiple text children.
{
  const t = placed(el("text", {}, "foo", "bar"), 0, 0, 48, 16);
  const items = collectTexts(t, ID, NOSCROLL);
  ok("text children concatenated", items.length === 1 && items[0].text === "foobar", JSON.stringify(items));
}

// (9) Camera applied to text geometry + size.  x=100*2+10=210, y=200*2+20=420, size=16*2=32.
{
  const t = placed(el("text", { style: { fontSize: 16 } }, "hi"), 100, 200, 40, 16);
  const items = collectTexts(t, CAM, NOSCROLL);
  ok("text camera transform applied", approx(items[0].x, 210) && approx(items[0].y, 420), JSON.stringify(items[0]));
  ok("text size scaled by camera", approx(items[0].size, 32), `size=${items[0].size}`);
}

// (10) A plain view (no text type) and empty-string text emit no TextItem.
{
  const view = placed(el("view", { style: { background: [1, 1, 1, 1] } }), 0, 0, 10, 10);
  ok("plain view emits no text", collectTexts(view, ID, NOSCROLL).length === 0);
  const empty = placed(el("text", {}), 0, 0, 0, 16); // no text children
  ok("empty text node emits no TextItem", collectTexts(empty, ID, NOSCROLL).length === 0);
}

// (11) Texts collected from a nested view tree (recurses into plain views).
{
  const t = placed(el("text", {}, "child"), 10, 10, 40, 16);
  const root = placed(el("view", { style: { background: [0, 0, 0, 1] } }, t), 0, 0, 100, 100);
  const items = collectTexts(root, ID, NOSCROLL);
  ok("nested text collected through a view", items.length === 1 && items[0].text === "child", JSON.stringify(items));
}

// ── collectSemantics ─────────────────────────────────────────────────────────

// (12) role="button" node emits a SemNode; label from firstText; focusable; camera applied.
{
  const label = placed(el("text", {}, "Save"), 0, 0, 32, 16);
  const btn = placed(el("view", { role: "button" }, label), 100, 200, 80, 40);
  const sem = collectSemantics(btn, CAM, NOSCROLL);
  ok("role=button emits a SemNode", sem.length === 1, `got ${sem.length}`);
  const s = sem[0];
  ok("sem id is stringified node id", s.id === String(btn.id), s.id);
  ok("sem role forwarded", s.role === "button");
  ok("sem label falls back to firstText", s.label === "Save", JSON.stringify(s.label));
  ok("button is focusable", s.focusable === true);
  ok("sem rect uses camera transform", approx(s.rect.x, 210) && approx(s.rect.y, 420) && approx(s.rect.width, 160) && approx(s.rect.height, 80), JSON.stringify(s.rect));
}

// (13) ariaLabel overrides firstText for the label.
{
  const label = placed(el("text", {}, "innerText"), 0, 0, 50, 16);
  const btn = placed(el("view", { role: "button", ariaLabel: "Close dialog" }, label), 0, 0, 40, 40);
  const sem = collectSemantics(btn, ID, NOSCROLL);
  ok("ariaLabel wins over firstText", sem[0].label === "Close dialog", JSON.stringify(sem[0].label));
}

// (14) onActivate (no role) still emits a SemNode (and forwards the handler).
{
  const fn = () => {};
  const node = placed(el("view", { onActivate: fn }), 0, 0, 10, 10);
  const sem = collectSemantics(node, ID, NOSCROLL);
  ok("onActivate node emits a SemNode", sem.length === 1, `got ${sem.length}`);
  ok("onActivate handler forwarded", sem[0].onActivate === fn);
  ok("non-button onActivate is not focusable", sem[0].focusable === false, `focusable=${sem[0].focusable}`);
}

// (15) draggable node emits a SemNode and is focusable; onDrag forwarded.
{
  const onDrag = () => {};
  const node = placed(el("view", { draggable: true, onDrag }), 0, 0, 10, 10);
  const sem = collectSemantics(node, ID, NOSCROLL);
  ok("draggable node emits a SemNode", sem.length === 1, `got ${sem.length}`);
  ok("draggable is focusable", sem[0].focusable === true);
  ok("onDrag forwarded", sem[0].onDrag === onDrag);
}

// (16) pointer handlers (onPointerEnter/Leave) emit a SemNode.
{
  const node = placed(el("view", { onPointerEnter: () => {} }), 0, 0, 10, 10);
  ok("onPointerEnter emits a SemNode", collectSemantics(node, ID, NOSCROLL).length === 1);
  const node2 = placed(el("view", { onPointerLeave: () => {} }), 0, 0, 10, 10);
  ok("onPointerLeave emits a SemNode", collectSemantics(node2, ID, NOSCROLL).length === 1);
}

// (17) A plain view (no role/handlers/draggable) emits NO SemNode.
{
  const node = placed(el("view", { style: { background: [1, 1, 1, 1] } }), 0, 0, 10, 10);
  ok("plain view emits no SemNode", collectSemantics(node, ID, NOSCROLL).length === 0);
}

// ── CRITICAL: hidden subtree exclusion (Suspense / Activity) ───────────────────
// A node with .hidden = true (and its whole subtree) must be EXCLUDED from collectRects,
// collectTexts AND collectSemantics. This locks the render-pipeline hidden behavior.
{
  // hidden subtree: a bg view containing a text + a role="button"
  const hiddenText = placed(el("text", {}, "secret"), 10, 10, 48, 16);
  const hiddenButton = placed(el("view", { role: "button" }, placed(el("text", {}, "Hidden btn"), 10, 30, 80, 16)), 10, 30, 80, 16);
  const hidden = placed(el("view", { style: { background: [1, 0, 1, 1] } }, hiddenText, hiddenButton), 0, 0, 100, 100);
  hidden.hidden = true;

  // a visible sibling so we can confirm collection still works around the hidden one
  const visibleText = placed(el("text", {}, "shown"), 0, 0, 40, 16);
  const visibleButton = placed(el("view", { role: "button" }, placed(el("text", {}, "Go"), 0, 0, 16, 16)), 0, 200, 30, 30);
  const visibleBg = placed(el("view", { style: { background: [0, 1, 0, 1] } }, visibleText), 0, 0, 50, 50);

  const root = placed(el("view", {}, hidden, visibleBg, visibleButton), 0, 0, 300, 300);

  const rects = collectRects(root, null, ID, NOSCROLL);
  ok("hidden subtree excluded from collectRects", rects.length === 1, `got ${rects.length} rects (expected only the visible green bg)`);
  ok("the surviving rect is the visible green bg", rects.length === 1 && approxArr(rects[0].color, [0, 1, 0, 1]), JSON.stringify(rects[0] && rects[0].color));

  const texts = collectTexts(root, ID, NOSCROLL);
  const texted = texts.map((t) => t.text);
  ok("hidden 'secret' text excluded from collectTexts", !texted.includes("secret"), JSON.stringify(texted));
  ok("hidden 'Hidden btn' text excluded from collectTexts", !texted.includes("Hidden btn"), JSON.stringify(texted));
  ok("visible 'shown' + 'Go' texts present", texted.includes("shown") && texted.includes("Go"), JSON.stringify(texted));

  const sem = collectSemantics(root, ID, NOSCROLL);
  const labels = sem.map((s) => s.label);
  ok("hidden role=button excluded from collectSemantics", !labels.includes("Hidden btn"), JSON.stringify(labels));
  ok("only the visible button survives in collectSemantics", sem.length === 1 && labels.includes("Go"), JSON.stringify(labels));
}

// (18b) When the focused node itself is hidden, collectRects still walks the root (root is
//       never gated by .hidden) — but if a HIDDEN child is focused, it is unreachable, so no
//       focus ring leaks out of the hidden subtree.
{
  const hiddenChild = placed(el("view", { style: { background: [1, 1, 1, 1] } }), 0, 0, 10, 10);
  hiddenChild.hidden = true;
  const root = placed(el("view", {}, hiddenChild), 0, 0, 100, 100);
  const rects = collectRects(root, hiddenChild.id, ID, NOSCROLL);
  ok("focusing a hidden child emits nothing", rects.length === 0, `got ${rects.length}`);
}

// ── scroll offset effect on y (collectRects + collectScrollRegions) ────────────

// (19) A child inside an overflow:"scroll" container shifts up by scrollY * scale.
//      Container at world y=0 has overflow scroll with scrollY=30. A child at world y=50:
//      child screen y = (50 - 30) * 1 + 0 = 20  (under identity cam).
{
  const child = placed(el("view", { style: { background: [1, 1, 1, 1] } }), 0, 50, 10, 10);
  const scroller = placed(el("view", { style: { overflow: "scroll" } }, child), 0, 0, 100, 40);
  const scroll = new Map([[scroller.id, 30]]);
  const rects = collectRects(scroller, null, ID, scroll);
  ok("scrolled child emits a rect", rects.length === 1, `got ${rects.length}`);
  ok("child y shifted by scroll offset", approx(rects[0].y, 20), `y=${rects[0].y}`);
}

// (19b) Same with non-identity camera: y = (50 - 30) * 2 + 20 = 60.
{
  const child = placed(el("view", { style: { background: [1, 1, 1, 1] } }), 0, 50, 10, 10);
  const scroller = placed(el("view", { style: { overflow: "scroll" } }, child), 0, 0, 100, 40);
  const scroll = new Map([[scroller.id, 30]]);
  const rects = collectRects(scroller, null, CAM, scroll);
  ok("scrolled child y under camera", approx(rects[0].y, 60), `y=${rects[0].y}`);
}

// (20) collectScrollRegions: emits a region for an overflow:"scroll" node with screen rect +
//      maxScroll = max(0, contentBottom - n.y + padding - n.h). Container h=40, child bottom=
//      50+10=60 → contentBottom=60, maxScroll = max(0, 60 - 0 + 0 - 40) = 20.
{
  const child = placed(el("view", {}), 0, 50, 10, 10);
  const scroller = placed(el("view", { style: { overflow: "scroll" } }, child), 0, 0, 100, 40);
  const regions = collectScrollRegions(scroller, CAM, NOSCROLL);
  ok("one scroll region emitted", regions.length === 1, `got ${regions.length}`);
  const reg = regions[0];
  ok("scroll region id matches node", reg.id === scroller.id);
  ok("scroll region maxScroll computed", approx(reg.maxScroll, 20), `maxScroll=${reg.maxScroll}`);
  ok("scroll region rect uses camera (no scroll offset at the region itself)", approxArr(reg.rect, [0 * 2 + 10, 0 * 2 + 20, 100 * 2, 40 * 2]), JSON.stringify(reg.rect));
}

// (20b) A non-scroll container produces no scroll region.
{
  const root = placed(el("view", { style: { overflow: "hidden" } }, placed(el("view", {}), 0, 0, 10, 10)), 0, 0, 100, 100);
  ok("overflow:hidden is not a scroll region", collectScrollRegions(root, ID, NOSCROLL).length === 0);
}

process.exit(done("collect"));
