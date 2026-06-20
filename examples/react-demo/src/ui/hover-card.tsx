import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass HoverCard — shadcn's API (HoverCard / HoverCardTrigger /
 * HoverCardContent) on Radix for behavior + a11y, painted as a Kussetsu
 * <GlassPanel>. The floating content uses the animate-ui baseline from
 * dialog.tsx: a controlled-state context drives <AnimatePresence>, which gates
 * a forceMount Radix Portal, and a motion.div applies the blur + scale/flip
 * spring. Radix owns behavior; motion owns the transition; Kussetsu owns paint.
 */
type HoverCardContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [HoverCardProvider, useHoverCardContext] = getStrictContext<HoverCardContextType>("HoverCard");

type HoverCardProps = React.ComponentProps<typeof HoverCardPrimitive.Root>;

export function HoverCard(props: HoverCardProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <HoverCardProvider value={{ isOpen, setIsOpen }}>
      <HoverCardPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </HoverCardProvider>
  );
}

export const HoverCardTrigger = HoverCardPrimitive.Trigger;

function HoverCardPortal(
  props: Omit<React.ComponentProps<typeof HoverCardPrimitive.Portal>, "forceMount">,
) {
  const { isOpen } = useHoverCardContext();
  return (
    <AnimatePresence>
      {isOpen && <HoverCardPrimitive.Portal forceMount {...props} />}
    </AnimatePresence>
  );
}

type HoverCardFlipDirection = "top" | "bottom" | "left" | "right";

type HoverCardContentProps = Omit<
  React.ComponentProps<typeof HoverCardPrimitive.Content>,
  "forceMount" | "asChild"
> & {
  from?: HoverCardFlipDirection;
  transition?: Transition;
} & Pick<HTMLMotionProps<"div">, "style">;

export function HoverCardContent({
  className,
  children,
  align = "center",
  sideOffset = 4,
  from = "top",
  transition = { type: "spring", stiffness: 150, damping: 25 },
  style,
  ...props
}: HoverCardContentProps) {
  // Discrete transform props (NOT a `transform` string): motion compares these
  // by value across its internal re-renders, so completing the spring doesn't
  // mis-detect a "changed" target and restart from `initial` (a 1-frame flicker).
  const flipRotation = from === "bottom" || from === "left" ? 20 : -20;
  const isXAxis = from === "top" || from === "bottom";
  const rx = isXAxis ? flipRotation : 0;
  const ry = isXAxis ? 0 : flipRotation;

  return (
    <HoverCardPortal>
      <HoverCardPrimitive.Content
        asChild
        forceMount
        align={align}
        sideOffset={sideOffset}
        {...props}
      >
        <motion.div
          key="hover-card-content"
          className={cn("z-50 w-64 outline-none", className)}
          style={{ ...style, transformPerspective: 500 }}
          initial={{ opacity: 0, scale: 0.8, rotateX: rx, rotateY: ry }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, rotateY: 0 }}
          exit={{ opacity: 0, scale: 0.8, rotateX: rx, rotateY: ry }}
          transition={transition}
        >
          <GlassPanel radius={16} color="#e6ebf2" className="block overflow-hidden">
            <div className="relative p-4 text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
              {children}
            </div>
          </GlassPanel>
        </motion.div>
      </HoverCardPrimitive.Content>
    </HoverCardPortal>
  );
}
