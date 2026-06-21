import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";
import { cn } from "../lib/utils";

/**
 * shadcn AspectRatio on Radix (the canonical re-export of AspectRatioPrimitive.Root).
 *
 * This is a pure LAYOUT primitive: it constrains its child to a width/height
 * ratio via a padding-bottom wrapper and has no visual surface of its own — no
 * fill, border, radius, or text. There is nothing to refract, so it is NOT
 * glassified. Glass belongs on whatever *content* you drop inside it (an
 * <img>, a <Card>, a <GlassPanel>, …), not on the ratio box. We keep shadcn's
 * exact API, Tailwind contract, and behavior, forwarding className/ref straight
 * through to Radix.
 */
export const AspectRatio = forwardRef<
  ElementRef<typeof AspectRatioPrimitive.Root>,
  ComponentPropsWithoutRef<typeof AspectRatioPrimitive.Root>
>(function AspectRatio({ className, ...props }, ref) {
  return (
    <AspectRatioPrimitive.Root ref={ref} className={cn(className)} {...props} />
  );
});
