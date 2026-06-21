// A headless command-menu (⌘K palette) primitive — the first brick of kussetsu's
// native overlay library.
//
// THE POINT: on a renderer you own, the load-bearing 10% (focus, keyboard, screen-reader
// semantics) lives in a REAL, hidden DOM control — exactly the kussetsu thesis (the DOM
// is the a11y + input layer; the GPU paints the pixels). This owns a genuine ARIA
// combobox + listbox: VoiceOver/NVDA announce a real search field, the live result count,
// and each option as you arrow. The listbox <option>s are positioned (transparently) OVER
// the painted rows, so the SAME real elements drive mouse hover/click, keyboard, AND the
// screen reader — nothing is faked or approximated. The glass look is painted by the skin
// from the state this exposes; behaviour and presentation are cleanly split (headless).

export interface CommandItem {
  id: string;
  label: string;
  hint?: string; // right-aligned shortcut / section hint
  keywords?: string; // extra match text, not shown
  onSelect: () => void;
}

export interface MenuGeometry {
  x: number; y: number; w: number; // panel top-left + width (viewport px)
  fieldH: number; rowH: number; maxRows: number; pad: number;
}

export interface MenuView {
  open: boolean;
  query: string;
  results: CommandItem[];
  activeIndex: number; // into results
  windowStart: number; // first visible result index
  visible: CommandItem[]; // results[windowStart .. +maxRows]
}

export interface CommandMenuController {
  getView(): MenuView;
  geometry(): MenuGeometry;
  subscribe(cb: () => void): () => void;
  open(): void; close(): void; toggle(): void;
  destroy(): void;
}

export interface CommandMenuOptions {
  host: HTMLElement; // a positioned element over the canvas
  items: CommandItem[];
  placeholder?: string;
  hotkey?: (e: KeyboardEvent) => boolean; // default ⌘K / Ctrl+K
}

const W = 600, FIELD_H = 58, ROW_H = 46, MAX_ROWS = 7, PAD = 8;

function fuzzy(items: CommandItem[], query: string): CommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const scored: { it: CommandItem; score: number }[] = [];
  for (const it of items) {
    const hay = `${it.label} ${it.hint ?? ""} ${it.keywords ?? ""}`.toLowerCase();
    const idx = hay.indexOf(q);
    let score = idx >= 0 ? 100 - idx : -1;
    if (score < 0) {
      let qi = 0; // subsequence fallback
      for (let i = 0; i < hay.length && qi < q.length; i++) if (hay[i] === q[qi]) qi++;
      if (qi === q.length) score = 1;
    }
    if (score >= 0) scored.push({ it, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.it);
}

export function createCommandMenu(opts: CommandMenuOptions): CommandMenuController {
  const hotkey = opts.hotkey ?? ((e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k");
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((cb) => cb());

  let open = false, query = "", results = opts.items, activeIndex = 0, windowStart = 0;
  let restoreFocus: HTMLElement | null = null;

  const geometry = (): MenuGeometry => {
    const vw = window.innerWidth, vh = window.innerHeight;
    return { x: Math.round((vw - W) / 2), y: Math.max(72, Math.round(vh * 0.16)), w: W, fieldH: FIELD_H, rowH: ROW_H, maxRows: MAX_ROWS, pad: PAD };
  };
  const getView = (): MenuView => ({ open, query, results, activeIndex, windowStart, visible: results.slice(windowStart, windowStart + MAX_ROWS) });

  // ── the hidden, REAL ARIA combobox + listbox (transparent; the GPU paints it) ──
  const layer = document.createElement("div");
  Object.assign(layer.style, { position: "absolute", inset: "0", pointerEvents: "none", display: "none" } as Partial<CSSStyleDeclaration>);

  const backdrop = document.createElement("div");
  Object.assign(backdrop.style, { position: "absolute", inset: "0", pointerEvents: "auto", background: "transparent" } as Partial<CSSStyleDeclaration>);
  backdrop.addEventListener("pointerdown", (e) => { e.preventDefault(); close(); });

  const input = document.createElement("input");
  input.type = "text";
  for (const [k, v] of Object.entries({ role: "combobox", "aria-expanded": "false", "aria-controls": "kmenu-listbox", "aria-autocomplete": "list", "aria-haspopup": "listbox", "aria-label": opts.placeholder ?? "Type a command or search" })) input.setAttribute(k, v);
  Object.assign(input.style, { position: "absolute", margin: "0", padding: "0 18px", border: "0", background: "transparent", color: "transparent", caretColor: "transparent", outline: "none", font: "16px system-ui", pointerEvents: "auto", boxSizing: "border-box" } as Partial<CSSStyleDeclaration>);

  const listbox = document.createElement("ul");
  listbox.id = "kmenu-listbox";
  listbox.setAttribute("role", "listbox");
  listbox.setAttribute("aria-label", "Results");
  Object.assign(listbox.style, { position: "absolute", inset: "0", margin: "0", padding: "0", listStyle: "none", pointerEvents: "none" } as Partial<CSSStyleDeclaration>);

  const live = document.createElement("div");
  live.setAttribute("aria-live", "polite");
  Object.assign(live.style, { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" } as Partial<CSSStyleDeclaration>);

  layer.append(backdrop, input, listbox, live);
  opts.host.appendChild(layer);

  const optId = (i: number) => `kmenu-opt-${i}`;

  function clampWindow() {
    const max = Math.max(0, results.length - MAX_ROWS);
    if (activeIndex < windowStart) windowStart = activeIndex;
    else if (activeIndex >= windowStart + MAX_ROWS) windowStart = activeIndex - MAX_ROWS + 1;
    windowStart = Math.min(Math.max(0, windowStart), max);
  }

  // Rebuild the option mirror: one <li role=option> per result, with the VISIBLE window
  // positioned (transparently) over its painted row for mouse + AT, the rest parked
  // off-screen (still in the DOM so the listbox/activedescendant stay correct).
  function syncDom() {
    const g = geometry();
    listbox.replaceChildren();
    results.forEach((it, i) => {
      const li = document.createElement("li");
      li.id = optId(i);
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === activeIndex));
      li.textContent = it.hint ? `${it.label}, ${it.hint}` : it.label;
      const vis = i >= windowStart && i < windowStart + MAX_ROWS;
      if (vis) {
        const r = i - windowStart;
        Object.assign(li.style, { position: "absolute", left: `${g.x}px`, top: `${g.y + g.fieldH + g.pad + r * g.rowH}px`, width: `${g.w}px`, height: `${g.rowH}px`, margin: "0", color: "transparent", pointerEvents: "auto", cursor: "pointer" } as Partial<CSSStyleDeclaration>);
        li.addEventListener("pointerdown", (e) => { e.preventDefault(); close(); it.onSelect(); });
        li.addEventListener("pointermove", () => { if (activeIndex !== i) { activeIndex = i; clampWindow(); refreshSelected(); notify(); } });
      } else {
        Object.assign(li.style, { position: "absolute", left: "-9999px", top: "0", width: "1px", height: "1px", overflow: "hidden" } as Partial<CSSStyleDeclaration>);
      }
      listbox.appendChild(li);
    });
    input.setAttribute("aria-activedescendant", results.length ? optId(activeIndex) : "");
  }

  // cheap path when only the active row changed (no list rebuild)
  function refreshSelected() {
    const kids = listbox.children;
    for (let k = 0; k < kids.length; k++) kids[k].setAttribute("aria-selected", String(k === activeIndex));
    if (results.length) { input.setAttribute("aria-activedescendant", optId(activeIndex)); syncDom(); } // reposition window
  }

  function setActive(i: number) {
    const n = results.length; if (!n) return;
    activeIndex = ((i % n) + n) % n;
    clampWindow();
    refreshSelected();
    notify();
  }

  function recompute() {
    results = fuzzy(opts.items, query);
    activeIndex = 0; windowStart = 0;
    syncDom();
    live.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`; // announce on open too
    notify();
  }

  // Modal containment: while open, make everything behind the menu inert + hidden from
  // AT, so a screen-reader virtual cursor (and Tab) can't wander into the live feed.
  let inerted: HTMLElement[] = [];
  function setBackgroundInert(on: boolean) {
    if (on) {
      inerted = [];
      for (const child of Array.from(opts.host.children)) {
        if (child === layer || child.hasAttribute("inert")) continue;
        (child as HTMLElement).setAttribute("inert", "");
        child.setAttribute("aria-hidden", "true");
        inerted.push(child as HTMLElement);
      }
    } else {
      for (const el of inerted) { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
      inerted = [];
    }
  }

  function positionInput() { const g = geometry(); Object.assign(input.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.fieldH}px` }); }

  input.addEventListener("input", () => { query = input.value; recompute(); });
  input.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActive(activeIndex + 1); break;
      case "ArrowUp": e.preventDefault(); setActive(activeIndex - 1); break;
      case "Home": e.preventDefault(); setActive(0); break;
      case "End": e.preventDefault(); setActive(results.length - 1); break;
      case "Enter": { e.preventDefault(); const it = results[activeIndex]; if (it) { close(); it.onSelect(); } break; }
      case "Escape": e.preventDefault(); close(); break;
      case "Tab": e.preventDefault(); break; // trap focus (combobox owns ↑↓)
    }
  });

  function doOpen() {
    if (open) return;
    const af = document.activeElement as HTMLElement | null;
    restoreFocus = af && af !== document.body ? af : null;
    open = true; query = ""; input.value = "";
    layer.style.display = "block";
    setBackgroundInert(true);
    input.setAttribute("aria-expanded", "true");
    positionInput(); recompute();
    setTimeout(() => input.focus(), 0); // after the triggering keydown settles
    notify();
  }
  function close() {
    if (!open) return;
    open = false; layer.style.display = "none";
    setBackgroundInert(false);
    input.setAttribute("aria-expanded", "false");
    notify();
    // restore focus, but only to a still-connected element (the live feed recycles proxies)
    if (restoreFocus && restoreFocus.isConnected) restoreFocus.focus?.();
    restoreFocus = null;
  }
  function toggle() { open ? close() : doOpen(); }

  const onKey = (e: KeyboardEvent) => { if (hotkey(e)) { e.preventDefault(); toggle(); } };
  const onResize = () => { if (open) { positionInput(); syncDom(); notify(); } };
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);

  return {
    getView, geometry,
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    open: doOpen, close, toggle,
    destroy() { window.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); layer.remove(); subs.clear(); },
  };
}
