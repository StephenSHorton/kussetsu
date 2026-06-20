import { forwardRef, useState, type ElementRef, type ReactNode } from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Toggle on Radix (keyboard, ARIA pressed-state, focus all handled) with
 * a Kussetsu glass surface that tints when pressed. Radix owns the behavior; the
 * <GlassPanel> is just the refractive paint. The cva variants/sizes match
 * shadcn's contract; the inner <Toggle.Root> keeps the Tailwind classes.
 */
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium cursor-pointer select-none bg-transparent text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] outline-none transition-transform active:translate-y-px focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "",
        outline: "",
      },
      size: {
        default: "h-10 min-w-10 px-3",
        sm: "h-9 min-w-9 px-2.5 text-sm",
        lg: "h-11 min-w-11 px-5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ToggleProps extends VariantProps<typeof toggleVariants> {
  className?: string;
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
  "aria-label"?: string;
}

export const Toggle = forwardRef<ElementRef<typeof TogglePrimitive.Root>, ToggleProps>(function Toggle(
  { className, variant = "default", size = "default", pressed, defaultPressed, onPressedChange, ...props },
  ref,
) {
  const [internal, setInternal] = useState(defaultPressed ?? false);
  const on = pressed ?? internal;

  return (
    <GlassPanel
      radius={10}
      color={on ? "#7c8cff" : "#e6ebf2"}
      tint={on ? 0.22 : 0.05}
      className={cn("inline-flex overflow-hidden", variant === "outline" && "border border-white/40")}
    >
      <TogglePrimitive.Root
        ref={ref}
        pressed={pressed}
        defaultPressed={defaultPressed}
        onPressedChange={(v: boolean) => {
          setInternal(v);
          onPressedChange?.(v);
        }}
        className={cn(toggleVariants({ variant, size }), className)}
        {...props}
      />
    </GlassPanel>
  );
});

export { toggleVariants };
