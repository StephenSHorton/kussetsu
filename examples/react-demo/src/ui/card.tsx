import { forwardRef, type HTMLAttributes } from "react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/** shadcn Card, rendered as a Kussetsu glass panel. Sub-parts keep their Tailwind contract. */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, children, ...props },
  ref,
) {
  return (
    <GlassPanel radius={16} color="#e6ebf2" className="block overflow-hidden">
      <div
        ref={ref}
        className={cn("flex flex-col gap-1.5 p-6 text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]", className)}
        {...props}
      >
        {children}
      </div>
    </GlassPanel>
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("flex flex-col gap-1", className)} {...props} />;
});

export const CardTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardTitle(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />;
});

export const CardDescription = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardDescription(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("text-sm text-white/80", className)} {...props} />;
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("text-[0.95rem] text-white/90", className)} {...props} />;
});

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("flex items-center gap-2.5 pt-2", className)} {...props} />;
});
