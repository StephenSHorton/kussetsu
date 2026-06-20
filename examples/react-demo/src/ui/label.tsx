import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Label on Radix (click-to-focus association, a11y) rendered as a
 * Kussetsu glass chip. The cva base keeps shadcn's exact Tailwind contract
 * (incl. the peer-disabled rules so it dims with its disabled control); the
 * off-white <GlassPanel> is the surface, with white text crisp on top.
 */
const labelVariants = cva(
  "inline-flex items-center gap-1.5 text-sm font-medium leading-none text-white select-none [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

export const Label = forwardRef<
  ElementRef<typeof LabelPrimitive.Root>,
  ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(function Label({ className, ...props }, ref) {
  return (
    <GlassPanel radius={10} color="#e6ebf2" className="inline-flex overflow-hidden border border-white/20">
      <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), "px-2.5 py-1.5", className)} {...props} />
    </GlassPanel>
  );
});

export { labelVariants };
