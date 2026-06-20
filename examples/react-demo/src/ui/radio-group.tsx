import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn RadioGroup on Radix (roving focus, ARIA, keyboard all handled). The
 * group is a plain layout grid; each item's round control is a Kussetsu glass
 * pill that tints when selected, with a crisp white dot rendered on top. The
 * behavior layer is real DOM; the glass is just paint.
 */
export const RadioGroup = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Root ref={ref} className={cn("grid gap-2.5", className)} {...props} />
  );
});

export const RadioGroupItem = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioGroupItem({ className, ...props }, ref) {
  return (
    <GlassPanel radius={999} color="#e6ebf2" className="inline-flex overflow-hidden border border-white/30">
      <RadioGroupPrimitive.Item
        ref={ref}
        className={cn(
          "peer grid aspect-square h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-full bg-transparent text-white outline-none",
          "focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
          <span className="block h-2 w-2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]" />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>
    </GlassPanel>
  );
});
