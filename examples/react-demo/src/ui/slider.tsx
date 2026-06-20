import { forwardRef, useMemo, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Slider on Radix (keyboard, ARIA, drag, multi-thumb all handled) with a
 * Kussetsu glass track and glass thumbs. The track tints toward the brand hue as
 * the filled <Range> overlays it; each draggable thumb is its own little glass
 * pill. Radix owns behavior + a11y; Kussetsu owns the paint.
 *
 * Mirrors the canonical shadcn structure: a single <Track> with one filled
 * <Range>, and one <Thumb> per value (derived from value / defaultValue).
 */
export const Slider = forwardRef<
  ElementRef<typeof SliderPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(function Slider(
  { className, defaultValue, value, min = 0, max = 100, orientation = "horizontal", ...props },
  ref,
) {
  // Derive the thumb count exactly like canonical shadcn does.
  const _values = useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  const isVertical = orientation === "vertical";

  return (
    <SliderPrimitive.Root
      ref={ref}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      orientation={orientation}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <GlassPanel
        radius={999}
        color="#e6ebf2"
        tint={0.05}
        className={cn(
          "block overflow-hidden",
          isVertical ? "h-full w-1.5" : "h-1.5 w-full",
        )}
      >
        <SliderPrimitive.Track
          className={cn(
            "relative grow overflow-hidden rounded-full bg-transparent",
            "data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full",
            "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
          )}
        >
          <SliderPrimitive.Range
            className={cn(
              "absolute rounded-full bg-gradient-to-r from-[#7e8cff]/85 to-[#5c66eb]/90",
              "data-[orientation=horizontal]:h-full",
              "data-[orientation=vertical]:w-full data-[orientation=vertical]:bg-gradient-to-t",
            )}
          />
        </SliderPrimitive.Track>
      </GlassPanel>

      {_values.map((_, i) => (
        <GlassPanel
          key={i}
          radius={999}
          color="#e6ebf2"
          tint={0.12}
          className="block overflow-hidden border border-white/40 shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
        >
          <SliderPrimitive.Thumb
            className={cn(
              "block h-4 w-4 shrink-0 cursor-grab rounded-full bg-transparent outline-none",
              "transition-transform active:scale-110 active:cursor-grabbing",
              "focus-visible:ring-2 focus-visible:ring-white/60",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          />
        </GlassPanel>
      ))}
    </SliderPrimitive.Root>
  );
});
