import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Alert, rendered as a Kussetsu glass panel. Plain semantic DOM (no
 * Radix) — a `role="alert"` region with shadcn's grid layout for an optional
 * leading icon. The card-like surface is a <GlassPanel> (off-white by default,
 * red for the destructive variant); the inner content keeps the full Tailwind
 * contract and renders crisp on top.
 */
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 px-4 py-3 text-sm text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] has-[>svg]:grid-cols-[calc(theme(spacing.4)+0.75rem)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "",
        destructive: "[&_[data-slot=alert-description]]:text-white/90",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const glassColor: Record<string, string> = {
  default: "#e6ebf2",
  destructive: "#ff6b6b",
};

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, variant = "default", ...props },
  ref,
) {
  return (
    <GlassPanel radius={16} color={glassColor[variant ?? "default"]} className="block overflow-hidden">
      <div
        ref={ref}
        role="alert"
        data-slot="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      />
    </GlassPanel>
  );
});

export const AlertTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AlertTitle(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="alert-title"
      className={cn("col-start-2 line-clamp-1 min-h-4 font-semibold tracking-tight", className)}
      {...props}
    />
  );
});

export const AlertDescription = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function AlertDescription({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="alert-description"
        className={cn(
          "col-start-2 grid justify-items-start gap-1 text-sm text-white/80 [&_p]:leading-relaxed",
          className,
        )}
        {...props}
      />
    );
  },
);

export { alertVariants };
