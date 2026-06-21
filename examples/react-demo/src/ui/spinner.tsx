import { type ComponentProps } from "react";
import { Loader2Icon } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * shadcn Spinner — verbatim API (a single <Spinner> over lucide's Loader2Icon
 * with `animate-spin`, keeping shadcn's Tailwind contract and the `role=status`
 * / `aria-label` a11y).
 *
 * Glass verdict: NONE. A spinner is a spinning stroke, not a surface — there's
 * no panel to refract, so wrapping it in a <GlassPanel> would only add a
 * meaningless rounded backdrop. Instead it inherits `currentColor`, so it reads
 * crisp white when dropped onto a Kussetsu glass surface (text is white there)
 * and tints to whatever `text-*` / `color` the caller sets. A subtle drop-shadow
 * keeps the stroke legible over the bright refracted backdrop, matching the
 * `[text-shadow:...]` treatment the rest of the system uses for crisp-on-glass.
 */
function Spinner({ className, ...props }: ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn(
        "size-4 animate-spin [filter:drop-shadow(0_1px_4px_rgba(0,0,0,0.45))]",
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
