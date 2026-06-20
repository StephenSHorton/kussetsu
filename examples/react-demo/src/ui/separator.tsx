import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Separator on Radix (orientation + decorative/ARIA handled) rendered as
 * a thin Kussetsu glass strip. Radix owns behavior + a11y; the <GlassPanel> is
 * the refractive divider line. The inner element keeps the full Tailwind
 * contract (shrink-0, sizing per orientation).
 */
export const Separator = forwardRef<
  ElementRef<typeof SeparatorPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(function Separator(
  { className, orientation = "horizontal", decorative = true, ...props },
  ref,
) {
  return (
    <GlassPanel
      radius={999}
      color="#e6ebf2"
      className={cn(
        "block shrink-0 overflow-hidden",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    >
      <SeparatorPrimitive.Root
        ref={ref}
        decorative={decorative}
        orientation={orientation}
        className={cn(
          "shrink-0 bg-white/25",
          orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        )}
        {...props}
      />
    </GlassPanel>
  );
});
