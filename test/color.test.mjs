// Unit tests for src/core/color.ts — parseColor + rgba.
// Helpers import installs the fake canvas (not needed here, but harmless) and gives us
// the assertion harness + float-array compare.
import { makeHarness, approxArr } from "./helpers.mjs";
import { parseColor, rgba } from "../src/core/color.ts";

const { ok, done } = makeHarness();

// ── parseColor: transparent ─────────────────────────────────────────────────────────
ok("transparent → [0,0,0,0]", approxArr(parseColor("transparent"), [0, 0, 0, 0]));

// ── parseColor: named colors ────────────────────────────────────────────────────────
ok("white → [1,1,1,1]", approxArr(parseColor("white"), [1, 1, 1, 1]));
ok("black → [0,0,0,1]", approxArr(parseColor("black"), [0, 0, 0, 1]));
ok("red → [1,0,0,1]", approxArr(parseColor("red"), [1, 0, 0, 1]));
ok("green → [0,128/255,0,1]", approxArr(parseColor("green"), [0, 128 / 255, 0, 1]));
ok("blue → [0,0,1,1]", approxArr(parseColor("blue"), [0, 0, 1, 1]));
ok("gray → [128/255,...,1]", approxArr(parseColor("gray"), [128 / 255, 128 / 255, 128 / 255, 1]));
ok("grey === gray", approxArr(parseColor("grey"), [128 / 255, 128 / 255, 128 / 255, 1]));
// slate: exact 100/116/139 ÷ 255
ok("slate → [100/255,116/255,139/255,1]", approxArr(parseColor("slate"), [100 / 255, 116 / 255, 139 / 255, 1]));

// ── parseColor: case-insensitivity + whitespace trim ────────────────────────────────
ok("RED (uppercase) === red", approxArr(parseColor("RED"), [1, 0, 0, 1]));
ok("'  White  ' trimmed + lowered", approxArr(parseColor("  White  "), [1, 1, 1, 1]));
ok("' TRANSPARENT ' trimmed", approxArr(parseColor(" TRANSPARENT "), [0, 0, 0, 0]));
ok("'#FF0000' uppercase hex", approxArr(parseColor("#FF0000"), [1, 0, 0, 1]));

// ── parseColor: #rgb (1-char doubling) ──────────────────────────────────────────────
ok("#f00 → [1,0,0,1]", approxArr(parseColor("#f00"), [1, 0, 0, 1]));
// #abc: a→0xaa, b→0xbb, c→0xcc, each ÷255
ok("#abc doubling", approxArr(parseColor("#abc"), [0xaa / 255, 0xbb / 255, 0xcc / 255, 1]));
ok("#fff → [1,1,1,1]", approxArr(parseColor("#fff"), [1, 1, 1, 1]));
ok("#000 → [0,0,0,1]", approxArr(parseColor("#000"), [0, 0, 0, 1]));

// ── parseColor: #rgba (1-char doubling, with alpha) ─────────────────────────────────
// #f008: alpha 8→0x88÷255
ok("#f008 alpha doubling", approxArr(parseColor("#f008"), [1, 0, 0, 0x88 / 255]));
ok("#000f → opaque black", approxArr(parseColor("#000f"), [0, 0, 0, 1]));
ok("#fff0 → transparent white", approxArr(parseColor("#fff0"), [1, 1, 1, 0]));

// ── parseColor: #rrggbb ─────────────────────────────────────────────────────────────
ok("#ff0000 → [1,0,0,1]", approxArr(parseColor("#ff0000"), [1, 0, 0, 1]));
ok("#5C5CFF → [92/255,92/255,1,1]", approxArr(parseColor("#5C5CFF"), [0x5c / 255, 0x5c / 255, 1, 1]));
ok("#808080 → mid gray", approxArr(parseColor("#808080"), [0x80 / 255, 0x80 / 255, 0x80 / 255, 1]));

// ── parseColor: #rrggbbaa ───────────────────────────────────────────────────────────
ok("#ff000080 → [1,0,0,128/255]", approxArr(parseColor("#ff000080"), [1, 0, 0, 0x80 / 255]));
ok("#0000ffff → opaque blue", approxArr(parseColor("#0000ffff"), [0, 0, 1, 1]));
ok("#00000000 → all zero", approxArr(parseColor("#00000000"), [0, 0, 0, 0]));

// ── parseColor: rgb()/rgba() — comma separators ─────────────────────────────────────
ok("rgb(255,0,0) → [1,0,0,1]", approxArr(parseColor("rgb(255,0,0)"), [1, 0, 0, 1]));
ok("rgb(130,130,255) channels", approxArr(parseColor("rgb(130,130,255)"), [130 / 255, 130 / 255, 1, 1]));
ok("rgba(255,0,0,0.5) alpha", approxArr(parseColor("rgba(255,0,0,0.5)"), [1, 0, 0, 0.5]));
ok("rgb(255, 0, 0) spaces after comma", approxArr(parseColor("rgb(255, 0, 0)"), [1, 0, 0, 1]));

// ── parseColor: rgb()/rgba() — space separators ─────────────────────────────────────
ok("rgb(130 130 255) space-sep", approxArr(parseColor("rgb(130 130 255)"), [130 / 255, 130 / 255, 1, 1]));
// slash before alpha (split on [,\/\s]+)
ok("rgb(255 0 0 / 0.5) slash alpha", approxArr(parseColor("rgb(255 0 0 / 0.5)"), [1, 0, 0, 0.5]));

// ── parseColor: rgb()/rgba() — percentage channels ──────────────────────────────────
ok("rgb(100%,0%,0%) → red", approxArr(parseColor("rgb(100%,0%,0%)"), [1, 0, 0, 1]));
ok("rgb(50% 50% 50%) → 0.5s", approxArr(parseColor("rgb(50% 50% 50%)"), [0.5, 0.5, 0.5, 1]));
// percentage channels + percentage alpha
ok("rgba(100%,0%,0%,50%) pct alpha", approxArr(parseColor("rgba(100%,0%,0%,50%)"), [1, 0, 0, 0.5]));
// percentage channels + 0..1 alpha
ok("rgba(100% 0% 0% / 0.25) pct+float alpha", approxArr(parseColor("rgba(100% 0% 0% / 0.25)"), [1, 0, 0, 0.25]));

// ── parseColor: INVALID → null ──────────────────────────────────────────────────────
ok("#12 (2 hex) → null", parseColor("#12") === null);
ok("#fffff (5 hex) → null", parseColor("#fffff") === null);
ok("#gggggg (non-hex) → null", parseColor("#gggggg") === null);
ok("#1234567 (7 hex) → null", parseColor("#1234567") === null);
ok("hsl(0,0%,0%) → null", parseColor("hsl(0,0%,0%)") === null);
ok("var(--x) → null", parseColor("var(--x)") === null);
ok("currentColor → null", parseColor("currentColor") === null);
ok("rgb(1,2) too few → null", parseColor("rgb(1,2)") === null);
ok("rgb(a,b,c) NaN channels → null", parseColor("rgb(a,b,c)") === null);
ok("garbage → null", parseColor("garbage") === null);
ok("'' empty → null", parseColor("") === null);
ok("'notacolor' → null", parseColor("notacolor") === null);

// ── rgba(): valid passthrough ───────────────────────────────────────────────────────
ok("rgba('#fff') passthrough", approxArr(rgba("#fff"), [1, 1, 1, 1]));
ok("rgba('#5C5CFF') passthrough", approxArr(rgba("#5C5CFF"), [0x5c / 255, 0x5c / 255, 1, 1]));
ok("rgba('rgb(130 130 255)') passthrough", approxArr(rgba("rgb(130 130 255)"), [130 / 255, 130 / 255, 1, 1]));
ok("rgba('red') named passthrough", approxArr(rgba("red"), [1, 0, 0, 1]));
ok("rgba('#ff000080') keeps parsed alpha", approxArr(rgba("#ff000080"), [1, 0, 0, 0x80 / 255]));

// ── rgba(): alpha override ──────────────────────────────────────────────────────────
ok("rgba('#fff',0.6) override", approxArr(rgba("#fff", 0.6), [1, 1, 1, 0.6]));
ok("rgba('#ff000080',1) override alpha", approxArr(rgba("#ff000080", 1), [1, 0, 0, 1]));
ok("rgba('red',0) override to 0", approxArr(rgba("red", 0), [1, 0, 0, 0]));
// alpha === undefined explicitly → no override (parsed alpha kept)
ok("rgba('#ff000080',undefined) keeps parsed", approxArr(rgba("#ff000080", undefined), [1, 0, 0, 0x80 / 255]));

// ── rgba(): THROWS on unparseable ───────────────────────────────────────────────────
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
ok("rgba('not-a-color') throws", throws(() => rgba("not-a-color")));
ok("rgba('#12') throws", throws(() => rgba("#12")));
ok("rgba('hsl(0,0%,0%)') throws", throws(() => rgba("hsl(0,0%,0%)")));
ok("rgba('var(--x)') throws", throws(() => rgba("var(--x)")));
ok("rgba('') throws", throws(() => rgba("")));

process.exit(done("color.ts"));
