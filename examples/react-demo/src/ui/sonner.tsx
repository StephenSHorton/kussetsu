import type { ComponentProps, ReactNode } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";
import type { ToastT } from "sonner";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Sonner, rendered as Kussetsu glass. Sonner owns all behavior (stacking,
 * swipe-to-dismiss, timers, a11y, promise/loading toasts); Kussetsu owns the
 * paint. We keep sonner's exact public API — render `<Toaster />` once and call
 * `toast(...)` from anywhere — and keep its Tailwind contract by driving every
 * inner element (title/description/action/cancel/close/icon) through
 * `toastOptions.classNames` while the toast BOX itself becomes a glass surface.
 *
 * The trick: sonner renders each toast into a `<li data-sonner-toast>`. With
 * `unstyled` it strips sonner's chrome so that `<li>` carries only our classes.
 * We make that `<li>` the positioning host (transparent) and paint a single
 * absolutely-positioned <GlassPanel> behind the crisp content via `::before`-
 * style layering — implemented as a real child so GlassPanel's canvas surface
 * gets a measurable box. Content sits on top with white text + text-shadow,
 * exactly like the Card / Dialog references.
 */

type ToasterProps = ComponentProps<typeof SonnerToaster>;

/** Off-white "#e6ebf2" glass for the default toast; saturated hues for states. */
const glassByType: Record<string, { color: string; tint: number }> = {
  default: { color: "#e6ebf2", tint: 0.05 },
  success: { color: "#8fffc4", tint: 0.2 },
  error: { color: "#ff6b6b", tint: 0.2 },
  warning: { color: "#ffd56b", tint: 0.2 },
  info: { color: "#7c8cff", tint: 0.18 },
  loading: { color: "#e6ebf2", tint: 0.05 },
};

/**
 * Glass surface for a single toast. Sized to the toast box via `inset-0`, it
 * sits behind the crisp content. radius 14 matches the references' control feel
 * (between an input's 10–12 and a card's 16–20).
 */
function ToastGlass({ type, className }: { type?: string; className?: string }) {
  const g = glassByType[type ?? "default"] ?? glassByType.default;
  return (
    <GlassPanel
      radius={14}
      color={g.color}
      tint={g.tint}
      className={cn("absolute inset-0 block overflow-hidden", className)}
    />
  );
}

const baseToastClass =
  "group relative flex w-full items-center gap-3 px-4 py-3.5 text-white " +
  "[text-shadow:0_1px_8px_rgba(0,0,0,0.5)]";

export function Toaster({ toastOptions, ...props }: ToasterProps) {
  return (
    <SonnerToaster
      // Sonner's own positioning/animation chrome is kept; only the per-toast
      // surface is themed. `expand` mirrors shadcn's stacked look.
      className="toaster group"
      offset={24}
      gap={14}
      toastOptions={{
        ...toastOptions,
        // Strip sonner's default box styling; the glass + Tailwind take over.
        unstyled: true,
        classNames: {
          toast: cn(
            baseToastClass,
            "rounded-[14px] shadow-[0_8px_28px_rgba(0,0,0,0.32)] backdrop-blur-0",
          ),
          title: "text-[0.92rem] font-semibold leading-snug",
          description: "text-[0.82rem] leading-snug text-white/80",
          actionButton: cn(
            "ml-auto inline-flex h-7 shrink-0 items-center rounded-md bg-white/20 px-2.5 text-xs font-semibold",
            "text-white outline-none transition-colors hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white/60",
          ),
          cancelButton: cn(
            "inline-flex h-7 shrink-0 items-center rounded-md bg-white/10 px-2.5 text-xs font-semibold",
            "text-white/90 outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60",
          ),
          closeButton: cn(
            "absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-white/80 outline-none",
            "transition-colors hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60",
          ),
          icon: "shrink-0 [&_svg]:h-4 [&_svg]:w-4",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

/**
 * Optional helper to emit a toast whose content is wrapped in a Kussetsu glass
 * surface. Use when you call `toast.custom(...)` and still want the glass look
 * with full control over the body. Not part of shadcn's surface, but harmless
 * and keeps the same `toast` import working for everything else.
 */
export function glassToast(node: ReactNode, type?: keyof typeof glassByType) {
  return toast.custom((id: ToastT["id"]) => (
    <div className={cn(baseToastClass, "rounded-[14px]")}>
      <ToastGlass type={type} />
      <div className="relative flex w-full items-center gap-3">{node}</div>
      <button
        type="button"
        onClick={() => toast.dismiss(id)}
        aria-label="Close"
        className="relative grid h-5 w-5 place-items-center rounded-full text-white/80 outline-none transition-colors hover:bg-white/20 hover:text-white"
      >
        ✕
      </button>
    </div>
  ));
}

export { toast };
