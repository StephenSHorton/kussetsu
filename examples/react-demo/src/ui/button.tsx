import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn-faithful Button: the familiar cva variants/sizes, rendered as Kussetsu
 * glass. The inner <button> keeps the Tailwind contract; <GlassPanel> provides
 * the refractive material behind it (colored per variant).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-semibold cursor-pointer select-none outline-none transition-transform active:translate-y-px focus-visible:ring-2 focus-visible:ring-white/60 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "text-white bg-gradient-to-b from-[#7e8cff]/80 to-[#5c66eb]/85",
        secondary: "text-white bg-white/15",
        ghost: "text-[#eef0fb]",
        destructive: "text-white bg-gradient-to-b from-[#ff6b6b]/80 to-[#dc3c3c]/[0.88]",
      },
      size: {
        sm: "h-8 px-3.5 text-sm",
        default: "h-10 px-[1.15rem] text-[0.92rem]",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const glassByVariant: Record<string, { color: string; panelClass?: string }> = {
  default: { color: "#7c8cff" },
  secondary: { color: "#e6ebf2", panelClass: "border border-white/20" },
  ghost: { color: "#e6ebf2", panelClass: "border border-white/50" },
  destructive: { color: "#ff6b6b" },
};

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", ...props },
  ref,
) {
  const g = glassByVariant[variant ?? "default"];
  return (
    <GlassPanel radius={12} color={g.color} className={cn("inline-flex overflow-hidden", g.panelClass)}>
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    </GlassPanel>
  );
});

export { buttonVariants };
