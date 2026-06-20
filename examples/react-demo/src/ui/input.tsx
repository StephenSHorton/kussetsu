import { forwardRef, type InputHTMLAttributes } from "react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/** shadcn Input, rendered over Kussetsu glass. The <input> keeps the full Tailwind contract. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <GlassPanel radius={10} color="#e6ebf2" className="block overflow-hidden">
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex h-10 w-full bg-transparent px-3.5 text-[0.92rem] text-white outline-none",
          "placeholder:text-white/55 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </GlassPanel>
  );
});
