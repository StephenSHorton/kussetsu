import { type ComponentProps } from "react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Kbd as a Kussetsu glass keycap. Each <kbd> sits on a tiny off-white
 * <GlassPanel> so the refracted backdrop shows through the keycap, while the
 * label renders as crisp white DOM on top. Keeps shadcn's exact API
 * (React.ComponentProps<"kbd">), the data-slot contract, and the Tailwind
 * classes; the glass is just the refractive paint behind the key.
 *
 * KbdGroup is a pure layout primitive (no surface of its own), so it stays a
 * plain flex wrapper — glassing it would double-stack panels behind each key.
 */
function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <GlassPanel radius={6} color="#e6ebf2" className="inline-flex overflow-hidden align-middle">
      <kbd
        data-slot="kbd"
        className={cn(
          "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-transparent px-1 font-sans text-xs font-medium text-white select-none [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
          "[&_svg:not([class*='size-'])]:size-3",
          className,
        )}
        {...props}
      />
    </GlassPanel>
  );
}

function KbdGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
