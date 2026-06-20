import { forwardRef, useState, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Switch on Radix (keyboard, ARIA, focus all handled) with a Kussetsu
 * glass track that tints green when on. The behavior layer is real DOM; the
 * glass is just paint.
 */
export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) {
  const [internal, setInternal] = useState(defaultChecked ?? false);
  const on = checked ?? internal;

  return (
    <GlassPanel
      radius={999}
      color={on ? "#8fffc4" : "#e6ebf2"}
      tint={on ? 0.22 : 0.05}
      className="inline-flex overflow-hidden"
    >
      <SwitchPrimitive.Root
        ref={ref}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(v: boolean) => {
          setInternal(v);
          onCheckedChange?.(v);
        }}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-transparent outline-none",
          "focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.4)]",
            "transition-transform data-[state=checked]:translate-x-[1.35rem]",
          )}
        />
      </SwitchPrimitive.Root>
    </GlassPanel>
  );
});
