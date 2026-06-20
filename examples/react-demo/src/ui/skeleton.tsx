import { type ComponentProps } from "react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Skeleton, rendered as a Kussetsu glass placeholder. The familiar
 * `animate-pulse rounded-md` Tailwind contract lives on the inner <div>; the
 * <GlassPanel> supplies the off-white refractive surface so the loading block
 * reads as frosted glass instead of a flat gray box. Pure CSS pulse — no motion.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <GlassPanel radius={10} color="#e6ebf2" className="block overflow-hidden">
      <div
        className={cn("h-full w-full animate-pulse rounded-md bg-white/20", className)}
        {...props}
      />
    </GlassPanel>
  );
}
