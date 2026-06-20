import { forwardRef, type TextareaHTMLAttributes } from "react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/** shadcn Textarea, rendered over Kussetsu glass. The <textarea> keeps the full Tailwind contract. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <GlassPanel radius={10} color="#e6ebf2" className="block overflow-hidden">
        <textarea
          ref={ref}
          className={cn(
            "flex min-h-[80px] w-full resize-y bg-transparent px-3.5 py-2.5 text-[0.92rem] text-white outline-none",
            "placeholder:text-white/55 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]",
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
      </GlassPanel>
    );
  },
);
