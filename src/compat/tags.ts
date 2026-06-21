// kussetsu/compat — HTML element → Kussetsu host element (<view>/<text>) mapping.
//
// Only a fixed allowlist is touched; any JSX whose tag isn't here (a Capitalized
// component, or hand-authored <view>/<text>) is left ALONE, so migrated HTML and the
// owned vocabulary coexist in one tree. Tags with no honest target (img/svg/table/
// non-text inputs) are refused, not faked — a build error beats a blank box.

import type { Style } from "../core/scene";

const P = "kussetsu/compat:";

export interface TagSpec {
  host: "view" | "text";
  role?: "button" | "heading" | "paragraph";
  level?: number;
  editable?: boolean; // single-line text field (input)
  injectStyle?: Partial<Style>; // e.g. <hr> needs an explicit bar to be visible
  /** html attr → kussetsu prop rename (e.g. onClick → onActivate). */
  rename?: Record<string, string>;
}

// view-like block/grouping elements (semantics beyond layout are lost unless a role
// is added — flagged in COVERAGE.md).
const VIEW_TAGS = [
  "div", "section", "main", "article", "aside", "header", "footer", "nav",
  "figure", "figcaption", "ul", "ol", "li", "dl", "dt", "dd",
];
// text-like inline/heading elements. NOTE: a text host holds plain strings only —
// nested element children (inline <strong> inside <p>) are refused by the transform
// (no inline rich-text runs yet).
const TEXT_TAGS = ["span", "p", "label", "small", "code", "blockquote"];

const REJECT: Record<string, string> = {
  img: "img has no GPU target yet (no texture pipeline) — images/icons can't paint",
  picture: "picture/img has no GPU target yet (no texture pipeline)",
  source: "source has no GPU target yet",
  svg: "svg has no GPU target yet (no path rasterizer) — icon libraries don't migrate",
  path: "svg path has no GPU target yet",
  video: "video has no GPU target yet",
  audio: "audio has no host element",
  canvas: "a nested canvas has no host element",
  iframe: "iframe has no host element",
  table: "table layout has no target (no grid/table layout)",
  thead: "table layout has no target", tbody: "table layout has no target",
  tr: "table layout has no target", td: "table layout has no target", th: "table layout has no target",
  select: "select has no target — only single-line text fields (editable) are supported",
  option: "select/option has no target",
  textarea: "textarea (multi-line) has no target yet — editable is single-line only",
  progress: "progress needs a percentage-width fill that Style can't express yet",
  meter: "meter needs a percentage-width fill that Style can't express yet",
  details: "details/summary disclosure has no target — toggle with React state",
  summary: "details/summary has no target — toggle with React state",
  dialog: "dialog/portal has no target — there's no stacking context (tree order only)",
  br: "br has no target — structure text with separate <text> nodes",
  em: "em/italic has no target (the glyph atlas has no italic face)",
  i: "italic has no target (the glyph atlas has no italic face)",
};

const SPECS: Record<string, TagSpec> = {};
for (const t of VIEW_TAGS) SPECS[t] = { host: "view" };
for (const t of TEXT_TAGS) SPECS[t] = { host: "text" };
for (let i = 1; i <= 6; i++) SPECS[`h${i}`] = { host: "text", role: "heading", level: i };
SPECS.p = { host: "text", role: "paragraph" };
SPECS.button = { host: "view", role: "button", rename: { onClick: "onActivate" } };
SPECS.a = { host: "text" }; // navigation/href refused at the attribute level
SPECS.strong = { host: "text", injectStyle: { fontWeight: 700 } };
SPECS.b = { host: "text", injectStyle: { fontWeight: 700 } };
SPECS.input = { host: "view", editable: true };
SPECS.form = { host: "view" }; // onSubmit refused at the attribute level
SPECS.hr = { host: "view", injectStyle: { width: "stretch", height: 1, background: [1, 1, 1, 0.12] } };

/** Look up an HTML tag. Returns a spec, a refusal, or null (not an HTML tag we touch). */
export function mapTag(tag: string): { spec?: TagSpec; error?: string; passthrough?: boolean } {
  if (tag === "view" || tag === "text") return { passthrough: true };
  if (tag[0] === tag[0].toUpperCase()) return { passthrough: true }; // React component
  if (tag in SPECS) return { spec: SPECS[tag] };
  if (tag in REJECT) return { error: `${P} <${tag}> — ${REJECT[tag]}.` };
  return { error: `${P} <${tag}> isn't in the supported element set (see COVERAGE.md).` };
}

// Event/interaction attributes that have NO wired target → must fail loud, never be a
// handler that silently never fires.
export const UNWIRED_EVENTS: Record<string, string> = {
  onMouseEnter: "hover isn't wired (no pointer enter/leave events)",
  onMouseLeave: "hover isn't wired (no pointer enter/leave events)",
  onMouseOver: "hover isn't wired",
  onMouseOut: "hover isn't wired",
  onMouseMove: "onMouseMove isn't wired",
  onFocus: "focus/blur callbacks aren't wired",
  onBlur: "focus/blur callbacks aren't wired",
  onKeyDown: "arbitrary key handlers aren't wired (only Enter on a button)",
  onKeyUp: "arbitrary key handlers aren't wired",
  onKeyPress: "arbitrary key handlers aren't wired",
  onSubmit: "form submit isn't wired — handle it in React with a button onActivate",
  onScroll: "onScroll isn't wired (wheel routing is internal)",
  onWheel: "onWheel isn't wired (wheel routing is internal)",
  onDrop: "HTML drag-and-drop isn't wired (only the custom draggable/onDrag)",
  onDragStart: "HTML drag-and-drop isn't wired",
  onDoubleClick: "double-click isn't wired",
};

// Benign HTML attributes that neither paint nor lay out → dropped silently.
export const BENIGN_DROP = new Set([
  "id", "name", "type", "htmlFor", "tabIndex", "title", "placeholder", "autoComplete",
  "spellCheck", "autoFocus", "rel", "target", "role" /* html role; our role is injected */,
]);

// Attributes whose meaning we CAN'T honor — dropping them would silently change behavior
// (an active "disabled" button, a visible "hidden" div, an uncontrolled value) → fail loud.
export const DROP_IS_WRONG: Record<string, string> = {
  disabled: "there's no disabled state — gate interactivity in React (omit onActivate)",
  readOnly: "there's no read-only field state",
  checked: "checkboxes/radios aren't supported (no non-text inputs)",
  defaultChecked: "checkboxes/radios aren't supported",
  defaultValue: "uncontrolled inputs aren't supported — use value + onChange",
  selected: "select/option isn't supported",
  hidden: "there's no visibility flag — render conditionally in React",
  required: "form validation isn't wired",
  contentEditable: "use a text <input> (→ editable) instead",
  multiple: "multi-select isn't supported",
};

// kussetsu props that pass straight through.
export const KUSSETSU_PROPS = new Set([
  "key", "ref", "style", "className", "children",
  "role", "ariaLabel", "level", "onActivate", "draggable", "onDrag",
  "selectable", "editable", "value", "onChange", "glass",
]);
