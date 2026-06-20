import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass Tooltip — shadcn's API on Radix (positioning + a11y), the
 * animate-ui baseline (motion + forceMount + AnimatePresence) for the float, and
 * a Kussetsu <GlassPanel> as the refractive surface. Radix owns behavior; motion
 * owns the blur + scale/flip spring; Kussetsu owns the paint.
 */
type TooltipContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [TooltipProviderCtx, useTooltipContext] = getStrictContext<TooltipContextType>("Tooltip");

export const TooltipProvider = TooltipPrimitive.Provider;

type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root>;

export function Tooltip(props: TooltipProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <TooltipProviderCtx value={{ isOpen, setIsOpen }}>
      <TooltipPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </TooltipProviderCtx>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipPortal(
  props: Omit<React.ComponentProps<typeof TooltipPrimitive.Portal>, "forceMount">,
) {
  const { isOpen } = useTooltipContext();
  return (
    <AnimatePresence>{isOpen && <TooltipPrimitive.Portal forceMount {...props} />}</AnimatePresence>
  );
}

type TooltipFlipDirection = "top" | "bottom" | "left" | "right";

type TooltipContentProps = Omit<
  React.ComponentProps<typeof TooltipPrimitive.Content>,
  "forceMount" | "asChild"
> & {
  from?: TooltipFlipDirection;
  transition?: Transition;
} & Pick<HTMLMotionProps<"div">, "style">;

export function TooltipContent({
  className,
  children,
  from = "top",
  sideOffset = 6,
  transition = { type: "spring", stiffness: 150, damping: 25 },
  style,
  ...props
}: TooltipContentProps) {
  // Discrete transform props (NOT a `transform` string): motion compares these
  // by value across its internal re-renders, so completing the spring doesn't
  // mis-detect a "changed" target and restart from `initial` (a 1-frame flicker).
  const flipRotation = from === "bottom" || from === "left" ? 20 : -20;
  const isXAxis = from === "top" || from === "bottom";
  const rx = isXAxis ? flipRotation : 0;
  const ry = isXAxis ? 0 : flipRotation;

  return (
    <TooltipPortal>
      <TooltipPrimitive.Content asChild forceMount sideOffset={sideOffset} {...props}>
        <motion.div
          key="tooltip-content"
          className={cn("z-50 w-fit outline-none", className)}
          style={{ transformPerspective: 500, ...style }}
          initial={{ opacity: 0, scale: 0.8, rotateX: rx, rotateY: ry }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, rotateY: 0 }}
          exit={{ opacity: 0, scale: 0.8, rotateX: rx, rotateY: ry }}
          transition={transition}
        >
          <GlassPanel radius={10} color="#e6ebf2" className="block overflow-hidden">
            <div className="relative px-3 py-1.5 text-xs font-medium text-balance text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">
              {children}
            </div>
          </GlassPanel>
        </motion.div>
      </TooltipPrimitive.Content>
    </TooltipPortal>
  );
}
