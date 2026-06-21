import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass Collapsible — shadcn's exact API (Collapsible / CollapsibleTrigger /
 * CollapsibleContent) + Tailwind contract on @radix-ui/react-collapsible, rendered
 * the Kussetsu way. The two real surfaces (the trigger control + the content panel)
 * paint through a <GlassPanel>; the expand/collapse rides the animate-ui baseline
 * (motion + forceMount + AnimatePresence) animating height so the glass panel grows
 * and shrinks smoothly. Radix owns behavior + a11y; motion owns the transition;
 * Kussetsu owns the paint.
 */

// ---------------------------------------------------------------------------
// Root + open-state context (drives AnimatePresence on the content)
// ---------------------------------------------------------------------------

type CollapsibleContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [CollapsibleProvider, useCollapsibleContext] = getStrictContext<CollapsibleContextType>("Collapsible");

type CollapsibleProps = React.ComponentProps<typeof CollapsiblePrimitive.Root>;

function Collapsible(props: CollapsibleProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <CollapsibleProvider value={{ isOpen, setIsOpen }}>
      <CollapsiblePrimitive.Root {...props} onOpenChange={setIsOpen} />
    </CollapsibleProvider>
  );
}

// ---------------------------------------------------------------------------
// Trigger — a real interactive control, painted as glass
// ---------------------------------------------------------------------------

const CollapsibleTrigger = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger>
>(function CollapsibleTrigger({ className, ...props }, ref) {
  return (
    <GlassPanel radius={12} color="#e6ebf2" className="block overflow-hidden">
      <CollapsiblePrimitive.Trigger
        ref={ref}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-2 bg-transparent px-3.5 py-2 text-left text-[0.92rem] font-medium",
          "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] outline-none transition-transform active:translate-y-px",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60",
          "disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          className,
        )}
        {...props}
      />
    </GlassPanel>
  );
});

// ---------------------------------------------------------------------------
// Content — the expanding glass panel, animate-ui baseline (height spring)
// ---------------------------------------------------------------------------

type CollapsibleContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>,
  "forceMount" | "asChild"
> & {
  transition?: Transition;
} & Pick<HTMLMotionProps<"div">, "initial" | "animate" | "exit">;

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  CollapsibleContentProps
>(function CollapsibleContent(
  { className, children, transition = { type: "spring", stiffness: 150, damping: 22 }, ...props },
  ref,
) {
  const { isOpen } = useCollapsibleContext();
  return (
    <AnimatePresence>
      {isOpen && (
        <CollapsiblePrimitive.Content ref={ref} asChild forceMount {...props}>
          <motion.div
            key="collapsible-content"
            // Animating `height` (not a discrete transform) is the right model
            // for a vertical reveal; motion measures the auto height and springs
            // to/from 0 while `overflow-hidden` clips the glass during the run.
            className={cn("overflow-hidden", className)}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
          >
            <GlassPanel radius={12} color="#e6ebf2" className="mt-2 block overflow-hidden border border-white/20">
              <div className="px-3.5 py-2 text-[0.92rem] text-white/90 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">
                {children}
              </div>
            </GlassPanel>
          </motion.div>
        </CollapsiblePrimitive.Content>
      )}
    </AnimatePresence>
  );
});

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
