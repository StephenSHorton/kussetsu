import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn ScrollArea on Radix (custom cross-browser scrollbars, keyboard + a11y
 * all handled) rendered as Kussetsu glass. The viewport box and the scrollbar
 * track are <GlassPanel> surfaces; the draggable thumb is its own little glass
 * pill. Radix owns behavior; Kussetsu owns the paint. No motion — shadcn's
 * canonical ScrollArea doesn't animate.
 *
 * Mirrors the canonical shadcn structure exactly: Root > Viewport + children,
 * a <ScrollBar> (Scrollbar > Thumb) per axis, and the Corner.
 */
export const ScrollArea = forwardRef<
  ElementRef<typeof ScrollAreaPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(function ScrollArea({ className, children, ...props }, ref) {
  return (
    <GlassPanel radius={16} color="#e6ebf2" className="block overflow-hidden">
      <ScrollAreaPrimitive.Root
        ref={ref}
        className={cn("relative overflow-hidden bg-transparent", className)}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport
          className="h-full w-full rounded-[inherit] text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    </GlassPanel>
  );
});

export const ScrollBar = forwardRef<
  ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(function ScrollBar({ className, orientation = "vertical", ...props }, ref) {
  const isVertical = orientation === "vertical";

  return (
    <GlassPanel
      radius={999}
      color="#e6ebf2"
      tint={0.05}
      className={cn(
        "flex touch-none select-none overflow-hidden",
        isVertical ? "h-full w-2.5 border-l border-l-transparent p-px" : "h-2.5 flex-col border-t border-t-transparent p-px",
        className,
      )}
    >
      <ScrollAreaPrimitive.ScrollAreaScrollbar
        ref={ref}
        orientation={orientation}
        className={cn(
          "flex grow touch-none select-none bg-transparent transition-colors",
          isVertical ? "h-full w-full flex-col" : "h-full w-full",
        )}
        {...props}
      >
        <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-white/35 transition-colors hover:bg-white/50" />
      </ScrollAreaPrimitive.ScrollAreaScrollbar>
    </GlassPanel>
  );
});
