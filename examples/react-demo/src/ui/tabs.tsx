import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Tabs on Radix (roving focus, ARIA, keyboard all handled) rendered as
 * Kussetsu glass. The list is an off-white glass track; the active trigger
 * lights up as its own brighter glass chip via Radix's data-[state=active].
 * The behavior layer is real DOM; the glass is just paint. shadcn's Tabs has no
 * transitions, so neither does this.
 */

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <GlassPanel radius={12} color="#e6ebf2" tint={0.05} className="inline-flex overflow-hidden">
      <TabsPrimitive.List
        ref={ref}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-1 bg-transparent p-1 text-white",
          className,
        )}
        {...props}
      />
    </GlassPanel>
  );
});

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold",
        "cursor-pointer select-none outline-none transition-colors",
        "text-white/70 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        "hover:text-white focus-visible:ring-2 focus-visible:ring-white/60",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-white/20 data-[state=active]:text-white data-[state=active]:shadow-[0_1px_8px_rgba(0,0,0,0.25)]",
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        "mt-2 text-[0.95rem] text-white/90 outline-none [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]",
        "focus-visible:ring-2 focus-visible:ring-white/50",
        className,
      )}
      {...props}
    />
  );
});
