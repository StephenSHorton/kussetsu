import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { toggleVariants } from "./toggle";

/**
 * shadcn ToggleGroup on @radix-ui/react-toggle-group (single/multiple, roving
 * focus, ARIA pressed-state all handled), rendered the Kussetsu way. The group
 * itself is one off-white glass bar (a segmented control); each pressed item
 * paints its own tinted <GlassPanel> highlight on top — same tint trick as
 * toggle.tsx. Radix owns behavior + a11y; Kussetsu owns the paint. The cva
 * variant/size context is shadcn's exact contract: items inherit the group's
 * variant/size unless they override.
 */

// ---------------------------------------------------------------------------
// variant/size context — items inherit from the group (shadcn's pattern)
// ---------------------------------------------------------------------------

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: "default",
  variant: "default",
});

// ---------------------------------------------------------------------------
// Root — off-white glass bar wrapping the roving-focus group
// ---------------------------------------------------------------------------

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
    VariantProps<typeof toggleVariants>
>(function ToggleGroup({ className, variant, size, children, ...props }, ref) {
  return (
    <GlassPanel radius={12} color="#e6ebf2" tint={0.05} className="inline-flex overflow-hidden">
      <ToggleGroupPrimitive.Root
        ref={ref}
        className={cn("flex items-center justify-center gap-1 p-1", className)}
        {...props}
      >
        <ToggleGroupContext.Provider value={{ variant, size }}>
          {children}
        </ToggleGroupContext.Provider>
      </ToggleGroupPrimitive.Root>
    </GlassPanel>
  );
});

// ---------------------------------------------------------------------------
// Item — Radix toggle item; pressed state tints its own glass highlight
// ---------------------------------------------------------------------------

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    VariantProps<typeof toggleVariants>
>(function ToggleGroupItem({ className, children, variant, size, ...props }, ref) {
  const context = React.useContext(ToggleGroupContext);
  const resolvedVariant = context.variant ?? variant;
  const resolvedSize = context.size ?? size;

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        toggleVariants({ variant: resolvedVariant, size: resolvedSize }),
        "relative rounded-[8px] data-[state=on]:[text-shadow:0_1px_6px_rgba(0,0,0,0.55)]",
        resolvedVariant === "outline" &&
          "data-[state=on]:border data-[state=on]:border-white/40",
        className,
      )}
      {...props}
    >
      {/* tinted glass highlight, only painted when this item is pressed
          (Radix sets data-state="on" on the item button; this child reacts) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity [[data-state=on]>&]:opacity-100"
      >
        <GlassPanel radius={8} color="#7c8cff" tint={0.22} className="block h-full w-full" />
      </span>
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
      </span>
    </ToggleGroupPrimitive.Item>
  );
});

export { ToggleGroup, ToggleGroupItem };
