import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Badge as a translucent colored glass chip: the saturated hue sits at
 * ~70% so the refracted backdrop shows through, with dark text for contrast.
 */
const badgeVariants = cva(
  "inline-flex items-center px-2.5 py-1 text-xs font-bold tracking-wide whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-[#7c8cff]/70 text-[#14172e] [text-shadow:0_1px_0_rgba(255,255,255,0.25)]",
        secondary: "bg-white/65 text-[#14172e]",
        destructive: "bg-[#ff6b6b]/72 text-[#14172e] [text-shadow:0_1px_0_rgba(255,255,255,0.2)]",
        outline: "border border-white/50 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const glassColor: Record<string, string> = {
  default: "#7c8cff",
  secondary: "#e6ebf2",
  destructive: "#ff6b6b",
  outline: "#e6ebf2",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <GlassPanel radius={999} color={glassColor[variant ?? "default"]} className="inline-flex overflow-hidden">
      <span className={cn(badgeVariants({ variant }), className)} {...props} />
    </GlassPanel>
  );
}

export { badgeVariants };
