// Dev-only: a DOM slider panel that drives the live glass tuning params. Not part
// of the renderer core — it just mutates glassTuning (which collectGlass reads when
// enabled) and calls onRender() to repaint. Examples mount it; apps don't ship it.
import { glassTuning, GLASS_DEFAULTS } from "../core/glassTuning";
import type { RGBA } from "../core/scene";

const rgbaToHex = (c: RGBA) => "#" + [0, 1, 2].map((i) => Math.round(c[i] * 255).toString(16).padStart(2, "0")).join("");
const hexToRgba = (h: string): RGBA => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, 1];

/** Build the glass-tuning panel element. Append it to a positioned container.
 *  `onRender` is called on every change (e.g. root.requestRender). */
export function buildGlassPanel(onRender: () => void): HTMLElement {
  const tp = glassTuning.params;
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "absolute",
    bottom: "16px",
    right: "16px",
    zIndex: "60",
    width: "212px",
    background: "rgba(10,12,20,0.86)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    color: "#cdd3e6",
    font: "12px/1.4 system-ui,-apple-system,sans-serif",
    boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
    overflow: "hidden",
    userSelect: "none",
  } as Partial<CSSStyleDeclaration>);

  const header = document.createElement("div");
  Object.assign(header.style, { boxSizing: "border-box", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "10px 12px" } as Partial<CSSStyleDeclaration>);
  const titleBtn = document.createElement("button");
  Object.assign(titleBtn.style, { all: "unset", display: "flex", alignItems: "center", gap: "6px", flex: "1", cursor: "pointer", fontWeight: "700", color: "#eef1f8" } as Partial<CSSStyleDeclaration>);
  titleBtn.innerHTML = `<span class="chev">▸</span><span>✦ Glass controls</span>`;
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset";
  Object.assign(resetBtn.style, { all: "unset", cursor: "pointer", fontSize: "11px", fontWeight: "600", color: "#9fb0ff", padding: "3px 9px", borderRadius: "7px", background: "rgba(255,255,255,0.08)" } as Partial<CSSStyleDeclaration>);
  header.appendChild(titleBtn);
  header.appendChild(resetBtn);

  const body = document.createElement("div");
  Object.assign(body.style, { padding: "2px 12px 12px", display: "none", flexDirection: "column", gap: "11px" } as Partial<CSSStyleDeclaration>);

  // Each control registers a sync() so Reset can push default values back into it.
  const controls: Array<() => void> = [];

  let open = false;
  const setOpen = (v: boolean) => {
    open = v;
    body.style.display = v ? "flex" : "none";
    (titleBtn.querySelector(".chev") as HTMLElement).textContent = v ? "▾" : "▸";
    if (v) glassTuning.enabled = true; // once opened, tuning persists (even collapsed)
    onRender();
  };
  titleBtn.addEventListener("click", () => setOpen(!open));

  const addSlider = (label: string, key: "refraction" | "blur" | "tint" | "rim" | "brighten" | "specular" | "dispersion", min: number, max: number, step: number) => {
    const row = document.createElement("div");
    const top = document.createElement("div");
    Object.assign(top.style, { display: "flex", justifyContent: "space-between", marginBottom: "3px" } as Partial<CSSStyleDeclaration>);
    const val = document.createElement("span");
    val.style.color = "#9fb0ff";
    val.textContent = tp[key].toFixed(step < 1 ? 3 : 0);
    top.innerHTML = `<span>${label}</span>`;
    top.appendChild(val);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(tp[key]);
    Object.assign(input.style, { width: "100%", accentColor: "#6a82ff", cursor: "pointer" } as Partial<CSSStyleDeclaration>);
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      glassTuning.params[key] = v;
      val.textContent = v.toFixed(step < 1 ? 3 : 0);
      onRender();
    });
    controls.push(() => {
      input.value = String(glassTuning.params[key]);
      val.textContent = glassTuning.params[key].toFixed(step < 1 ? 3 : 0);
    });
    row.appendChild(top);
    row.appendChild(input);
    body.appendChild(row);
  };
  addSlider("Refraction", "refraction", 0, 0.4, 0.005);
  addSlider("Dispersion", "dispersion", 0, 0.06, 0.001);
  addSlider("Blur", "blur", 0, 16, 0.5);
  addSlider("Tint", "tint", 0, 0.5, 0.01);
  addSlider("Rim width", "rim", 0, 80, 1);
  addSlider("Specular", "specular", 0, 1.5, 0.05);
  addSlider("Brighten", "brighten", 0.8, 1.4, 0.01);

  const crow = document.createElement("div");
  Object.assign(crow.style, { display: "flex", justifyContent: "space-between", alignItems: "center" } as Partial<CSSStyleDeclaration>);
  crow.innerHTML = `<span>Tint color</span>`;
  const color = document.createElement("input");
  color.type = "color";
  color.value = rgbaToHex(tp.tintColor);
  Object.assign(color.style, { width: "34px", height: "22px", border: "0", background: "none", cursor: "pointer" } as Partial<CSSStyleDeclaration>);
  color.addEventListener("input", () => {
    glassTuning.params.tintColor = hexToRgba(color.value);
    onRender();
  });
  controls.push(() => {
    color.value = rgbaToHex(glassTuning.params.tintColor);
  });
  crow.appendChild(color);
  body.appendChild(crow);

  resetBtn.addEventListener("click", () => {
    Object.assign(glassTuning.params, GLASS_DEFAULTS, { tintColor: [...GLASS_DEFAULTS.tintColor] });
    for (const sync of controls) sync();
    onRender();
  });

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}
