import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Progress on Radix (ARIA progressbar, value clamping all handled) with a
 * Kussetsu glass track. The track is the visible surface, so it's the off-white
 * glass panel; the indicator is a tinted fill that slides via shadcn's exact
 * translateX transform. Radix owns behavior + a11y; the glass is just paint.
 */
export const Progress = forwardRef<
  ElementRef<typeof ProgressPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(function Progress({ className, value, ...props }, ref) {
  return (
    <GlassPanel radius={999} color="#e6ebf2" className="block overflow-hidden">
      <ProgressPrimitive.Root
        ref={ref}
        value={value}
        className={cn("relative h-3 w-full overflow-hidden rounded-full bg-transparent", className)}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            "h-full w-full flex-1 rounded-full bg-gradient-to-b from-[#7e8cff]/85 to-[#5c66eb]/90",
            "shadow-[0_1px_8px_rgba(92,102,235,0.55)] transition-transform duration-500 ease-out",
          )}
          style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
        />
      </ProgressPrimitive.Root>
    </GlassPanel>
  );
});
