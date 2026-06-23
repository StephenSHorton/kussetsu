// Custom React renderer — react-reconciler@0.33.0 (React 19.2), MUTATION mode.
// Signatures verified against the actual 0.33.0 runtime source AND
// @types/react-reconciler@0.33.0 (the two now agree):
//   - createContainer is 10 args: ...identifierPrefix, onUncaughtError,
//     onCaughtError, onRecoverableError, onDefaultTransitionIndicator.
//   - prepareUpdate was REMOVED; commitUpdate is now (instance, type, prevProps,
//     nextProps, internalHandle) with NO updatePayload — it always runs.
//   - getCurrentEventPriority was REPLACED by the trio resolveUpdatePriority /
//     getCurrentUpdatePriority / setCurrentUpdatePriority (renderer holds the state).
//   - React-19 added required Suspense-in-commit / transition members
//     (maySuspendCommit, startSuspendingCommit, suspendInstance, waitForCommitToBeReady,
//     preloadInstance, requestPostPaintCallback, shouldAttemptEagerTransition,
//     resetFormInstance) plus the two non-function values NotPendingTransition and
//     HostTransitionContext. They are no-ops here (this renderer never suspends a
//     commit and has no form actions), but must EXIST or the reconciler throws.
import { createContext, type ReactNode } from "react";
import ReactReconciler from "react-reconciler";
// NB: explicit ".js" — react-reconciler has no package "exports" map, so bare
// "react-reconciler/constants" is unresolvable under Node ESM (used by the test runner).
import { DefaultEventPriority, NoEventPriority } from "react-reconciler/constants.js";
import { newElement, newText, type AnyNode, type Container, type ElementNode } from "./scene.ts";

function detach(child: AnyNode) {
  const p = child.parent;
  if (p && "children" in p) {
    const i = p.children.indexOf(child);
    if (i !== -1) p.children.splice(i, 1);
  }
  child.parent = null;
}

// React 19 no longer reads priority once via getCurrentEventPriority; it pushes/pops
// the current update priority through the renderer, so we hold it ourselves.
let currentUpdatePriority: number = NoEventPriority;

// A real React context object — the reconciler reads/writes its `_currentValue` and
// pushes it on the context stack for form-action/useFormStatus support. We never use
// form actions, but it must be a genuine context, so createContext is the right supply.
const NotPendingTransition = null;
const HostTransitionContext = createContext(NotPendingTransition);

const hostConfig: any = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsResources: false,
  supportsSingletons: false,
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

  // 0.33 dropped prepareUpdate: commitUpdate always runs and diffs in the commit phase.
  // Arg order: (instance, type, prevProps, nextProps, internalHandle). We just adopt the
  // new props (cheap); the painter/layout read node.children, not props.children, so a
  // per-render props swap is harmless. Repaint is triggered once per commit in
  // resetAfterCommit, not per update.
  commitUpdate(instance: ElementNode, _type: any, _prev: any, next: any) {
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

  // React-19 event-priority trio (replaces getCurrentEventPriority).
  setCurrentUpdatePriority(newPriority: number) {
    currentUpdatePriority = newPriority;
  },
  getCurrentUpdatePriority() {
    return currentUpdatePriority;
  },
  resolveUpdatePriority() {
    // No DOM event context to derive from; fall back to Default when nothing is set.
    return currentUpdatePriority !== NoEventPriority ? currentUpdatePriority : DefaultEventPriority;
  },

  // React-19 Suspense-in-commit hooks. This renderer never suspends a commit.
  // (maySuspendCommitOnUpdate/InSyncRender are only read behind a suspensey-commit mode
  // bit this root never sets, but we define them for parity with the maySuspendCommit family.)
  maySuspendCommit() {
    return false;
  },
  maySuspendCommitOnUpdate() {
    return false;
  },
  maySuspendCommitInSyncRender() {
    return false;
  },
  preloadInstance() {
    return true; // true => already "loaded", no commit suspension needed
  },
  startSuspendingCommit() {},
  suspendInstance() {},
  waitForCommitToBeReady() {
    return null; // commit can proceed immediately
  },

  // Suspense / <Activity> VISIBILITY hooks. The reconciler calls these unconditionally in
  // mutation mode whenever an Offscreen subtree's visibility toggles (a <Suspense> boundary
  // flipping to/from its fallback, or <Activity mode="hidden">) — they MUST exist or each
  // host/text node in the toggled subtree throws. They are no-ops here: this renderer paints
  // from the scene graph across many traversals (collect*/layout/a11y/hit-test), and visually
  // hiding a subtree correctly also needs yoga `display:none` so it stops taking layout space.
  // That cross-pipeline work is tracked as a follow-up; until then a suspended subtree stays
  // painted (it overlaps the fallback) rather than being hidden — same behavior as the prior
  // React-18 build, minus the swallowed TypeErrors these stubs prevent.
  hideInstance() {},
  hideTextInstance() {},
  unhideInstance() {},
  unhideTextInstance() {},

  // React-19 transition / form-action / scheduling members (no-ops for this renderer).
  NotPendingTransition,
  HostTransitionContext,
  resetFormInstance() {},
  requestPostPaintCallback() {},
  shouldAttemptEagerTransition() {
    return false;
  },
  trackSchedulerEvent() {},
  resolveEventType() {
    return null;
  },
  resolveEventTimeStamp() {
    return -1.1; // sentinel: no event-time context available
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
    (error: unknown) => console.error("[gpu-renderer uncaught]", error), // onUncaughtError
    (error: unknown) => console.error("[gpu-renderer caught]", error), // onCaughtError
    (error: unknown) => console.error("[gpu-renderer recoverable]", error), // onRecoverableError
    () => {}, // onDefaultTransitionIndicator
  );
  return {
    render(element: ReactNode) {
      Recon.updateContainer(element, root, null, null);
    },
    unmount() {
      Recon.updateContainer(null, root, null, null);
    },
  };
}
