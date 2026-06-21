// kussetsu/compat — the build-time transform (a @babel/core plugin).
//
// Runs inside @vitejs/plugin-react's existing Babel pass, BEFORE jsx-runtime lowering,
// so it sees JSXElement/JSXAttribute AST and rewrites the compat HTML tag set into
// <view>/<text> + a mapped `style`. Everything it can't paint becomes a build error
// with a file:line:col code frame (path.buildCodeFrameError) — never a silent drop.
//
// This file is the ONLY Babel-coupled piece; all the actual CSS/Tailwind/tag knowledge
// lives in the pure, framework-agnostic modules it calls, so an SWC front-end could
// reuse them unchanged.

import type * as Babel from "@babel/core";
import { mapTag, UNWIRED_EVENTS, BENIGN_DROP, DROP_IS_WRONG, KUSSETSU_PROPS } from "./tags.ts";
import { mapCssDeclarations } from "./style.ts";
import { classNameToDecls } from "./tailwind.ts";

const P = "kussetsu/compat:";
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "tel", "url", "password", "number", ""]);

interface Options {
  dynamic?: "error"; // 'runtime' (opt-in resolver) is the documented next increment
}

export default function kussetsuCompat({ types: t }: typeof Babel, _options: Options = {}): Babel.PluginObj {
  const valueToNode = (v: unknown): Babel.types.Expression => {
    if (v === null || v === undefined) return t.nullLiteral();
    if (typeof v === "number") return v < 0 ? t.unaryExpression("-", t.numericLiteral(-v)) : t.numericLiteral(v);
    if (typeof v === "string") return t.stringLiteral(v);
    if (typeof v === "boolean") return t.booleanLiteral(v);
    if (Array.isArray(v)) return t.arrayExpression(v.map(valueToNode));
    if (typeof v === "object") return t.objectExpression(Object.entries(v as object).map(([k, val]) => t.objectProperty(t.identifier(k), valueToNode(val))));
    return t.nullLiteral();
  };

  const staticValue = (node: Babel.types.Node): { static: boolean; value?: unknown } => {
    if (t.isStringLiteral(node)) return { static: true, value: node.value };
    if (t.isNumericLiteral(node)) return { static: true, value: node.value };
    if (t.isBooleanLiteral(node)) return { static: true, value: node.value };
    if (t.isUnaryExpression(node) && node.operator === "-" && t.isNumericLiteral(node.argument)) return { static: true, value: -node.argument.value };
    if (t.isTemplateLiteral(node) && node.expressions.length === 0) return { static: true, value: node.quasis[0].value.cooked };
    if (t.isIdentifier(node, { name: "undefined" })) return { static: true, value: undefined };
    return { static: false };
  };

  const textEl = (children: Babel.types.JSXElement["children"], style?: Babel.types.JSXAttribute[]): Babel.types.JSXElement =>
    t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("text"), style ?? [], false), t.jsxClosingElement(t.jsxIdentifier("text")), children, false);

  return {
    name: "kussetsu-compat",
    visitor: {
      JSXElement(path) {
        const opening = path.node.openingElement;
        if (!t.isJSXIdentifier(opening.name)) return; // namespaced / member expression
        const tag = opening.name.name;
        const res = mapTag(tag);
        if (res.passthrough) return;
        if (res.error) throw path.buildCodeFrameError(res.error);
        const spec = res.spec!;

        const keep: Babel.types.JSXAttribute[] = [];
        const inlineDecls: [string, string | number | null][] = [];
        const classDecls: [string, string][] = [];
        let classNamePath: Babel.NodePath | null = null;
        let stylePath: Babel.NodePath | null = null;
        const inlinePropPath = new Map<string, Babel.NodePath>();
        let valueAttr: Babel.types.JSXAttribute | null = null;
        let onChangeNode: Babel.types.JSXAttribute | null = null;
        let inputType = "";
        let hasHref = false;

        for (const ap of path.get("openingElement.attributes")) {
          if (ap.isJSXSpreadAttribute()) throw ap.buildCodeFrameError(`${P} spread props {...} on <${tag}> can't be statically validated — make props explicit or use the runtime resolver.`);
          const node = (ap as Babel.NodePath<Babel.types.JSXAttribute>).node;
          const name = t.isJSXNamespacedName(node.name) ? `${node.name.namespace.name}:${node.name.name.name}` : node.name.name;

          if (name === "style") {
            stylePath = ap;
            const v = node.value;
            if (!t.isJSXExpressionContainer(v) || !t.isObjectExpression(v.expression))
              throw ap.buildCodeFrameError(`${P} dynamic style on <${tag}> can't be resolved at build time — use an object literal, or the runtime resolver.`);
            for (const pp of ap.get("value.expression.properties") as Babel.NodePath[]) {
              if (pp.isJSXSpreadChild() || (pp.isObjectProperty() && pp.node.computed) || pp.isSpreadElement())
                throw pp.buildCodeFrameError(`${P} spread/computed style keys aren't supported — list properties explicitly.`);
              const prop = pp.node as Babel.types.ObjectProperty;
              const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
              if (!key) throw pp.buildCodeFrameError(`${P} unsupported style key.`);
              const sv = staticValue(prop.value);
              if (!sv.static) throw pp.get("value").buildCodeFrameError(`${P} dynamic value for '${key}' can't be resolved at build time — make it static, or use the runtime resolver.`);
              inlineDecls.push([key, sv.value as string | number]);
              inlinePropPath.set(key.replace(/([A-Z])/g, "-$1").toLowerCase(), pp);
            }
            continue;
          }

          if (name === "className") {
            classNamePath = ap;
            const v = node.value;
            let cls: string | null = null;
            if (t.isStringLiteral(v)) cls = v.value;
            else if (t.isJSXExpressionContainer(v) && t.isStringLiteral(v.expression)) cls = v.expression.value;
            else if (t.isJSXExpressionContainer(v) && t.isTemplateLiteral(v.expression) && v.expression.expressions.length === 0) cls = v.expression.quasis[0].value.cooked ?? "";
            else throw ap.buildCodeFrameError(`${P} dynamic className (cn()/clsx/template with values) can't be resolved at build time — make it static, or use the runtime resolver.`);
            const { decls, errors } = classNameToDecls(cls);
            if (errors.length) throw ap.buildCodeFrameError(errors.join("\n"));
            classDecls.push(...decls);
            continue;
          }

          // event handling
          if (spec.rename?.[name]) { node.name = t.jsxIdentifier(spec.rename[name]); keep.push(node); continue; }
          if (name === "onClick") throw ap.buildCodeFrameError(`${P} onClick on <${tag}> has no target — only <button> activates. Wrap it in a <button> (→ role="button").`);
          if (UNWIRED_EVENTS[name]) throw ap.buildCodeFrameError(`${P} ${name} on <${tag}> — ${UNWIRED_EVENTS[name]}.`);
          if (/^on[A-Z]/.test(name) && !KUSSETSU_PROPS.has(name)) throw ap.buildCodeFrameError(`${P} ${name} isn't a wired event (supported: onActivate, onChange, onDrag).`);

          if (name === "aria-label") { node.name = t.jsxIdentifier("ariaLabel"); keep.push(node); continue; }
          if (name === "href") { hasHref = true; continue; }
          if (name === "type" && spec.editable) { if (t.isStringLiteral(node.value)) inputType = node.value.value; continue; }
          if (name === "value") { valueAttr = node; keep.push(node); continue; }
          if (name === "onChange") { onChangeNode = node; continue; } // wired below (string→event shim for editable)
          if (KUSSETSU_PROPS.has(name)) { keep.push(node); continue; }
          if (DROP_IS_WRONG[name]) throw ap.buildCodeFrameError(`${P} ${name} on <${tag}> — ${DROP_IS_WRONG[name]}.`);
          if (BENIGN_DROP.has(name) || name.startsWith("data-") || name.startsWith("aria-")) continue; // benign, dropped
          continue; // unknown non-event attribute: neither paints nor lays out → drop
        }

        if (tag === "a" && hasHref) throw path.buildCodeFrameError(`${P} <a href> navigation isn't wired — render a <button> + handle routing in React, or drop href for plain text.`);

        // ── merge styles: injectStyle (defaults) < className < inline ───────────
        const merged: Record<string, unknown> = { ...(spec.injectStyle ?? {}) };
        const cr = mapCssDeclarations(classDecls);
        if (cr.errors.length) throw (classNamePath ?? path).buildCodeFrameError(cr.errors.map((e) => e.message).join("\n"));
        Object.assign(merged, cr.style);
        const ir = mapCssDeclarations(inlineDecls);
        if (ir.errors.length) {
          const e = ir.errors[0];
          throw (inlinePropPath.get(e.prop) ?? stylePath ?? path).buildCodeFrameError(e.message);
        }
        Object.assign(merged, ir.style);

        // ── input → editable: needs value+onChange, a text-type, and a value child ─
        if (spec.editable) {
          if (inputType && !TEXT_INPUT_TYPES.has(inputType)) throw path.buildCodeFrameError(`${P} <input type="${inputType}"> has no target — only single-line text fields are supported.`);
          if (!valueAttr || !onChangeNode) throw path.buildCodeFrameError(`${P} <input> must be controlled (value + onChange) — uncontrolled inputs can't drive the GPU field.`);
        }

        // ── onChange: only a text <input> has one, and kussetsu calls it with the
        //    string value while migrated HTML handlers expect an event — so shim it:
        //    (__v) => handler({ target: { value: __v } }).
        if (onChangeNode) {
          if (!spec.editable) throw path.buildCodeFrameError(`${P} onChange on <${tag}> has no target — only a text <input> (→ editable) emits a change event.`);
          if (!t.isJSXExpressionContainer(onChangeNode.value) || t.isJSXEmptyExpression(onChangeNode.value.expression))
            throw path.buildCodeFrameError(`${P} <input> onChange must be a function expression (got ${onChangeNode.value ? "a literal" : "no value"}).`);
          const orig = onChangeNode.value.expression;
          const evt = t.objectExpression([
            t.objectProperty(t.identifier("target"), t.objectExpression([t.objectProperty(t.identifier("value"), t.identifier("__v"))])),
            t.objectProperty(t.identifier("currentTarget"), t.objectExpression([t.objectProperty(t.identifier("value"), t.identifier("__v"))])),
          ]);
          onChangeNode.value = t.jsxExpressionContainer(t.arrowFunctionExpression([t.identifier("__v")], t.callExpression(t.cloneNode(orig), [evt])));
          keep.push(onChangeNode);
        }

        // ── rename the element to its host ─────────────────────────────────────
        opening.name = t.jsxIdentifier(spec.host);
        if (path.node.closingElement) path.node.closingElement.name = t.jsxIdentifier(spec.host);

        // ── inject style / role / level / editable ─────────────────────────────
        const injected: Babel.types.JSXAttribute[] = [];
        if (Object.keys(merged).length) injected.push(t.jsxAttribute(t.jsxIdentifier("style"), t.jsxExpressionContainer(valueToNode(merged) as Babel.types.ObjectExpression)));
        if (spec.role) injected.push(t.jsxAttribute(t.jsxIdentifier("role"), t.stringLiteral(spec.role)));
        if (spec.level) injected.push(t.jsxAttribute(t.jsxIdentifier("level"), t.jsxExpressionContainer(t.numericLiteral(spec.level))));
        if (spec.editable) injected.push(t.jsxAttribute(t.jsxIdentifier("editable"), null));
        opening.attributes = [...keep, ...injected];

        // ── children ───────────────────────────────────────────────────────────
        if (spec.editable) {
          // input renders its value through a child <text>; carry color/fontSize for the caret.
          const textStyle: Record<string, unknown> = {};
          if (merged.color) textStyle.color = merged.color;
          if (merged.fontSize) textStyle.fontSize = merged.fontSize;
          const valChild = t.isJSXExpressionContainer(valueAttr!.value)
            ? t.jsxExpressionContainer(t.cloneNode(valueAttr!.value.expression))
            : t.isStringLiteral(valueAttr!.value)
              ? t.jsxText(valueAttr!.value.value)
              : t.jsxExpressionContainer(t.stringLiteral(""));
          const styleAttrs = Object.keys(textStyle).length ? [t.jsxAttribute(t.jsxIdentifier("style"), t.jsxExpressionContainer(valueToNode(textStyle) as Babel.types.ObjectExpression))] : [];
          opening.selfClosing = false;
          path.node.closingElement = t.jsxClosingElement(t.jsxIdentifier(spec.host));
          path.node.children = [textEl([valChild as Babel.types.JSXElement["children"][number]], styleAttrs)];
          return;
        }

        if (spec.host === "text") {
          // A text host holds plain strings — nested elements would be lost (no inline runs).
          for (const c of path.node.children)
            if (t.isJSXElement(c) || t.isJSXFragment(c))
              throw path.buildCodeFrameError(`${P} <${tag}> contains nested elements — inline rich text isn't supported yet. Split it into separate <text> nodes.`);
          return;
        }

        // view host: a <view> never paints raw strings/expressions, so textual children
        // must be lifted into a <text>. Carry the element's text styling onto it.
        const textStyle: Record<string, unknown> = {};
        for (const k of ["color", "fontSize", "fontWeight"]) if (merged[k] !== undefined) textStyle[k] = merged[k];
        const tsa = Object.keys(textStyle).length ? [t.jsxAttribute(t.jsxIdentifier("style"), t.jsxExpressionContainer(valueToNode(textStyle) as Babel.types.ObjectExpression))] : [];

        const kids = path.node.children;
        const hasEl = kids.some((c) => t.isJSXElement(c) || t.isJSXFragment(c));
        const hasLiteralText = kids.some((c) => t.isJSXText(c) && c.value.trim());
        if (!hasEl && hasLiteralText) {
          // a text label, possibly interpolated (`Hi {name}`, `Clicked {count} times`) → one <text>.
          path.node.children = [textEl(kids, tsa)];
          if (opening.selfClosing) { opening.selfClosing = false; path.node.closingElement = t.jsxClosingElement(t.jsxIdentifier(spec.host)); }
        } else if (hasEl) {
          // mixed structural + text → wrap only the literal text runs; expressions are left.
          path.node.children = kids.map((c) => (t.isJSXText(c) && c.value.trim() ? textEl([t.jsxText(c.value)], tsa) : c));
        }
        // else: only expression children (e.g. `{items.map(r => <Row/>)}` or `{name}`) — we
        // CAN'T tell statically if {expr} is elements or a string, and folding it into <text>
        // would silently drop element-returning maps (the common container pattern). So leave
        // it as direct view children. A bare {stringExpr} in a <view> won't paint — wrap it in
        // <text> explicitly (documented in COVERAGE.md).
      },
    },
  };
}
