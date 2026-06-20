import { forwardRef, useState, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Checkbox on Radix (keyboard, ARIA, focus, indeterminate all handled)
 * with a Kussetsu glass box that tints blue when checked. Radix owns behavior +
 * a11y; the glass is just paint and the check/indicator renders crisp on top.
 */
export const Checkbox = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) {
  const [internal, setInternal] = useState(defaultChecked ?? false);
  const state = checked ?? internal;
  const on = state === true || state === "indeterminate";

  return (
    <GlassPanel
      radius={6}
      color={on ? "#7c8cff" : "#e6ebf2"}
      tint={on ? 0.22 : 0.05}
      className="inline-flex overflow-hidden border border-white/20"
    >
      <CheckboxPrimitive.Root
        ref={ref}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(v: boolean | "indeterminate") => {
          setInternal(v === true);
          onCheckedChange?.(v);
        }}
        className={cn(
          "peer grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[3px] bg-transparent outline-none",
          "focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator
          className={cn("flex items-center justify-center text-white [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.45))]")}
        >
          {state === "indeterminate" ? (
            <Minus className="h-3.5 w-3.5" strokeWidth={3} />
          ) : (
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    </GlassPanel>
  );
});
