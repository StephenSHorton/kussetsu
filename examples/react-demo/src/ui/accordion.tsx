import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Accordion on Radix (keyboard, ARIA, single/multiple all handled), with
 * each item rendered as a Kussetsu glass panel. Radix owns behavior + a11y; the
 * height collapse uses shadcn's accordion-up/down keyframes; Kussetsu is paint.
 */
export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = forwardRef<
  ElementRef<typeof AccordionPrimitive.Item>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <GlassPanel radius={12} color="#e6ebf2" className="block overflow-hidden">
      <AccordionPrimitive.Item
        ref={ref}
        className={cn("border-b border-white/15 last:border-b-0", className)}
        {...props}
      />
    </GlassPanel>
  );
});

export const AccordionTrigger = forwardRef<
  ElementRef<typeof AccordionPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          "flex flex-1 items-center justify-between px-5 py-4 text-left text-[0.95rem] font-semibold text-white",
          "[text-shadow:0_1px_6px_rgba(0,0,0,0.45)] outline-none transition-all hover:underline",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50",
          "disabled:pointer-events-none disabled:opacity-50",
          "[&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-white/80 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});

export const AccordionContent = forwardRef<
  ElementRef<typeof AccordionPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className="overflow-hidden text-[0.92rem] text-white/90 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn("px-5 pb-4 pt-0", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
});
