// The invisible DOM "semantics overlay" (Flutter's flt-semantics model): one
// transparent, correctly-tagged, focusable DOM proxy per interactive/semantic node,
// positioned over the GPU-painted pixels. Screen readers, keyboard nav, focus, AND
// pointer/keyboard DRAG all work even though every visible pixel is WebGPU.
import type { Role } from "./scene";

export interface SemNode {
  id: string;
  role?: Role; // undefined => a plain interactive region (e.g. draggable)
  label: string;
  rect: { x: number; y: number; width: number; height: number };
  focusable: boolean;
  level?: number;
  draggable?: boolean;
  onActivate?: () => void;
  onDrag?: (worldDx: number, worldDy: number) => void;
}

export interface FocusBridge {
  setFocusRing(nodeId: string | null, keyboard: boolean): void;
}

interface Proxy {
  el: HTMLElement;
  node: SemNode;
}

const TAG: Record<Role, keyof HTMLElementTagNameMap> = { button: "button", heading: "h2", paragraph: "p" };

export class SemanticsOverlay {
  private root: HTMLElement;
  private pool = new Map<string, Proxy>();
  private keyboardActive = false;

  constructor(container: HTMLElement, private bridge: FocusBridge, private getScale: () => number) {
    this.root = container;
    addEventListener("keydown", () => (this.keyboardActive = true), true);
    addEventListener("pointerdown", () => (this.keyboardActive = false), true);
    this.root.addEventListener("focusin", (e) => {
      const id = (e.target as HTMLElement).dataset.nodeId ?? null;
      this.bridge.setFocusRing(id, this.keyboardActive);
    });
    this.root.addEventListener("focusout", () => this.bridge.setFocusRing(null, false));
  }

  private tagFor(node: SemNode): string {
    if (!node.role) return "div";
    return node.role === "heading" ? `h${Math.min(6, Math.max(1, node.level ?? 2))}` : TAG[node.role];
  }

  private interactive(node: SemNode): boolean {
    return node.role === "button" || !!node.draggable;
  }

  syncFromScene(nodes: readonly SemNode[]): void {
    const seen = new Set<string>();
    const focusedId = (document.activeElement as HTMLElement | null)?.dataset?.nodeId;

    for (const node of nodes) {
      seen.add(node.id);
      let proxy = this.pool.get(node.id);
      if (!proxy || proxy.el.tagName.toLowerCase() !== this.tagFor(node)) {
        const fresh = this.createProxy(node);
        if (proxy) proxy.el.replaceWith(fresh);
        else this.root.appendChild(fresh);
        proxy = { el: fresh, node };
        this.pool.set(node.id, proxy);
      }
      proxy.node = node; // keep latest (handlers read this)
      this.updateProxy(proxy, node);
    }

    for (const [id, proxy] of this.pool) {
      if (!seen.has(id)) {
        proxy.el.remove();
        this.pool.delete(id);
      }
    }
    // Reorder the DOM to match reading order ONLY when it actually changed. Re-appending
    // every frame moves nodes in the DOM, and a move that lands between a real (human-slow)
    // click's mousedown and mouseup makes the browser SWALLOW the click — focus survives,
    // activation doesn't. That's the "buttons focus but don't fire" bug. Stable frames now
    // do zero DOM mutation here, so clicks land.
    const want = nodes.map((n) => n.id).join(",");
    const have = Array.from(this.root.children, (el) => (el as HTMLElement).dataset.nodeId ?? "").join(",");
    if (want !== have) {
      for (const node of nodes) {
        const el = this.pool.get(node.id)?.el;
        if (el) this.root.appendChild(el);
      }
    }
    if (focusedId && this.pool.has(focusedId)) {
      const el = this.pool.get(focusedId)!.el;
      if (document.activeElement !== el) el.focus({ preventScroll: true });
    }
  }

  private createProxy(node: SemNode): HTMLElement {
    const el = document.createElement(this.tagFor(node));
    el.dataset.nodeId = node.id;
    Object.assign(el.style, {
      position: "absolute",
      top: "0",
      left: "0",
      margin: "0",
      padding: "0",
      border: "0",
      background: "transparent",
      color: "transparent",
      outline: "none",
      appearance: "none",
      font: "inherit",
      touchAction: "none",
      cursor: node.draggable ? "grab" : "",
      pointerEvents: this.interactive(node) ? "auto" : "none",
    } as Partial<CSSStyleDeclaration>);

    el.addEventListener("click", (e) => {
      e.preventDefault();
      this.pool.get(node.id)?.node.onActivate?.();
    });

    if (node.draggable) {
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      el.addEventListener("pointerdown", (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
        e.preventDefault();
      });
      el.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const s = this.getScale() || 1;
        const dx = (e.clientX - lastX) / s;
        const dy = (e.clientY - lastY) / s;
        lastX = e.clientX;
        lastY = e.clientY;
        this.pool.get(node.id)?.node.onDrag?.(dx, dy);
      });
      const end = (e: PointerEvent) => {
        dragging = false;
        el.releasePointerCapture(e.pointerId);
        el.style.cursor = "grab";
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    }

    el.addEventListener("keydown", (e) => {
      const cur = this.pool.get(node.id)?.node;
      if (!cur) return;
      if ((e.key === "Enter" || e.key === " ") && cur.role !== "button") {
        e.preventDefault();
        cur.onActivate?.();
      }
      if (cur.draggable) {
        const step = 24;
        const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (d[e.key]) {
          e.preventDefault();
          cur.onDrag?.(d[e.key][0], d[e.key][1]);
        }
      }
    });
    return el;
  }

  private updateProxy(proxy: Proxy, node: SemNode): void {
    const { el } = proxy;
    const r = node.rect;
    el.style.transform = `translate(${r.x}px, ${r.y}px)`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
    el.setAttribute("aria-label", node.label);
    // Headings, paragraphs, and role-less regions (graph nodes) carry real text so
    // Cmd+F / find-in-page locates them and screen readers read them.
    if (node.role !== "button") el.textContent = node.label;
    if (node.role === "heading") el.setAttribute("aria-level", String(node.level ?? 2));
    el.tabIndex = node.focusable ? 0 : -1;
  }
}
