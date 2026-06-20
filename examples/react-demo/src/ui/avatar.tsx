import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Avatar on Radix (image-load state machine + fallback handled) with a
 * Kussetsu glass disc as the surface. The root is the visible circle, so it gets
 * the <GlassPanel>; the image/fallback render as crisp DOM on top. Off-white
 * "#e6ebf2" glass, pill radius, white fallback text with the reference shadow.
 */
export const Avatar = forwardRef<
  ElementRef<typeof AvatarPrimitive.Root>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(function Avatar({ className, ...props }, ref) {
  return (
    <GlassPanel radius={999} color="#e6ebf2" className="inline-flex overflow-hidden">
      <AvatarPrimitive.Root
        ref={ref}
        className={cn(
          "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
          className,
        )}
        {...props}
      />
    </GlassPanel>
  );
});

export const AvatarImage = forwardRef<
  ElementRef<typeof AvatarPrimitive.Image>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(function AvatarImage({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  );
});

export const AvatarFallback = forwardRef<
  ElementRef<typeof AvatarPrimitive.Fallback>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(function AvatarFallback({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        className,
      )}
      {...props}
    />
  );
});
