import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn NativeSelect, rendered over Kussetsu glass. Plain DOM — a real
 * <select> wrapped in a relative container with a chevron painted on the
 * right. No Radix, no portal: the browser owns the popup, the OS draws the
 * options. The <select> keeps the full Tailwind contract; the surface is a
 * <GlassPanel> matching the glass <Input>. The native popup can't be
 * glassified (the OS renders it), so glass coverage is partial — but the
 * control's own surface (the thing you see in the layout) is full glass.
 *
 * The <option> children get explicit dark text-on-light so the OS-rendered
 * menu stays legible regardless of the page theme.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function NativeSelect({ className, children, ...props }, ref) {
    return (
      <GlassPanel radius={10} color="#e6ebf2" className="relative block w-full overflow-hidden">
        <select
          ref={ref}
          className={cn(
            "flex h-10 w-full appearance-none bg-transparent py-2 pl-3.5 pr-9 text-[0.92rem] text-white outline-none",
            "[text-shadow:0_1px_6px_rgba(0,0,0,0.4)]",
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            // OS-rendered options: dark text on light so the native popup stays legible.
            "[&_option]:bg-[#e6ebf2] [&_option]:text-[#14172e]",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-white/70 [filter:drop-shadow(0_1px_4px_rgba(0,0,0,0.4))]"
        />
      </GlassPanel>
    );
  },
);
