// Custom React renderer — react-reconciler@0.29.2 (React 18.3.1), MUTATION mode.
// Signatures verified against the actual 0.29.2 runtime source (NOT the React-19
// DefinitelyTyped types): createContainer is 8 args ending in transitionCallbacks;
// commitUpdate takes updatePayload as its 2nd arg; getCurrentEventPriority is
// mandatory; React-19-only methods are intentionally absent.
import ReactReconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants";
import { newElement, newText, type AnyNode, type Container, type ElementNode } from "./scene";

function detach(child: AnyNode) {
  const p = child.parent;
  if (p && "children" in p) {
    const i = p.children.indexOf(child);
    if (i !== -1) p.children.splice(i, 1);
  }
  child.parent = null;
}

const hostConfig: any = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  supportsMicrotasks: true,
  scheduleMicrotask: typeof queueMicrotask === "function" ? queueMicrotask : (cb: () => void) => Promise.resolve().then(cb),

  createInstance(type: "view" | "text", props: any) {
    return newElement(type, props);
  },
  createTextInstance(text: string) {
    return newText(text);
  },

  appendInitialChild(parent: ElementNode, child: AnyNode) {
    child.parent = parent;
    parent.children.push(child);
  },
  finalizeInitialChildren() {
    return false;
  },

  appendChild(parent: ElementNode, child: AnyNode) {
    detach(child);
    child.parent = parent;
    parent.children.push(child);
  },
  appendChildToContainer(container: Container, child: AnyNode) {
    detach(child);
    child.parent = container;
    container.children.push(child);
    container.dirty = true;
  },

  insertBefore(parent: ElementNode, child: AnyNode, before: AnyNode) {
    detach(child);
    const i = parent.children.indexOf(before);
    child.parent = parent;
    parent.children.splice(i < 0 ? parent.children.length : i, 0, child);
  },
  insertInContainerBefore(container: Container, child: AnyNode, before: AnyNode) {
    detach(child);
    const i = container.children.indexOf(before);
    child.parent = container;
    container.children.splice(i < 0 ? container.children.length : i, 0, child);
    container.dirty = true;
  },

  removeChild(parent: ElementNode, child: AnyNode) {
    const i = parent.children.indexOf(child);
    if (i !== -1) parent.children.splice(i, 1);
    child.parent = null;
  },
  removeChildFromContainer(container: Container, child: AnyNode) {
    const i = container.children.indexOf(child);
    if (i !== -1) container.children.splice(i, 1);
    child.parent = null;
    container.dirty = true;
  },

  // PURE; return null to skip commitUpdate. (0.29.2: null return => no update flag.)
  prepareUpdate(_instance: any, _type: any, oldProps: any, newProps: any) {
    const keys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
    for (const k of keys) {
      if (k === "children") continue;
      if (!Object.is(oldProps[k], newProps[k])) return [k]; // non-null => commit
    }
    return null;
  },
  // 0.29.2 arg order: (instance, updatePayload, type, prevProps, nextProps, handle)
  commitUpdate(instance: ElementNode, _payload: any, _type: any, _prev: any, next: any) {
    instance.props = next;
  },
  commitTextUpdate(textInstance: { text: string }, _old: string, next: string) {
    textInstance.text = next;
  },

  shouldSetTextContent() {
    return false; // strings become real text nodes; <text> concatenates them
  },

  getRootHostContext() {
    return {};
  },
  getChildHostContext(parent: any) {
    return parent;
  },
  getPublicInstance(instance: any) {
    return instance;
  },

  prepareForCommit() {
    return null; // must be non-undefined
  },
  resetAfterCommit(container: Container) {
    container.dirty = true;
    container.onDirty?.(); // single repaint trigger per commit
  },
  preparePortalMount() {},
  clearContainer(container: Container) {
    container.children.length = 0;
    container.dirty = true;
  },

  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,

  getCurrentEventPriority() {
    return DefaultEventPriority; // mandatory; destructured directly off config
  },

  // Required no-op stubs (must exist or the renderer throws).
  getInstanceFromNode() {
    return null;
  },
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  prepareScopeUpdate() {},
  getInstanceFromScope() {
    return null;
  },
  detachDeletedInstance() {},
  resetTextContent() {},
};

const Recon = ReactReconciler(hostConfig);

export function createRoot(container: Container) {
  const root = Recon.createContainer(
    container, // containerInfo
    1, // ConcurrentRoot
    null, // hydrationCallbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    "", // identifierPrefix
    (error: unknown) => console.error("[gpu-renderer recoverable]", error),
    null, // transitionCallbacks
  );
  return {
    render(element: React.ReactNode) {
      Recon.updateContainer(element, root, null, null);
    },
    unmount() {
      Recon.updateContainer(null, root, null, null);
    },
  };
}
