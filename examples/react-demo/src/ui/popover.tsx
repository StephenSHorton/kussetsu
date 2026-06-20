import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass Popover — shadcn's API on Radix (anchor positioning, focus,
 * a11y, dismiss-on-outside) with the animate-ui motion baseline (forceMount +
 * AnimatePresence) and a Kussetsu <GlassPanel> as the floating surface. The
 * content does a blur + scale/flip spring; Radix owns behavior, Kussetsu owns
 * the paint.
 */
type PopoverContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [PopoverProvider, usePopoverContext] = getStrictContext<PopoverContextType>("Popover");

type PopoverProps = React.ComponentProps<typeof PopoverPrimitive.Root>;

export function Popover(props: PopoverProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <PopoverProvider value={{ isOpen, setIsOpen }}>
      <PopoverPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </PopoverProvider>
  );
}

export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverPortal(props: Omit<React.ComponentProps<typeof PopoverPrimitive.Portal>, "forceMount">) {
  const { isOpen } = usePopoverContext();
  return (
    <AnimatePresence>{isOpen && <PopoverPrimitive.Portal forceMount {...props} />}</AnimatePresence>
  );
}

type PopoverFlipDirection = "top" | "bottom" | "left" | "right";

type PopoverContentProps = Omit<
  React.ComponentProps<typeof PopoverPrimitive.Content>,
  "forceMount" | "asChild"
> &
  Pick<HTMLMotionProps<"div">, "initial" | "animate" | "exit"> & {
    from?: PopoverFlipDirection;
    transition?: Transition;
  };

export function PopoverContent({
  className,
  children,
  align = "center",
  sideOffset = 4,
  from = "top",
  transition = { type: "spring", stiffness: 150, damping: 25 },
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onFocusOutside,
  onInteractOutside,
  ...props
}: PopoverContentProps) {
  // Discrete transform props (NOT a `transform` string): motion compares these
  // by value across its internal re-renders, so completing the spring doesn't
  // mis-detect a "changed" target and restart from `initial` (a 1-frame flicker).
  const flipRotation = from === "bottom" || from === "left" ? 20 : -20;
  const isXAxis = from === "top" || from === "bottom";
  const rx = isXAxis ? flipRotation : 0;
  const ry = isXAxis ? 0 : flipRotation;

  return (
    <PopoverPortal>
      <PopoverPrimitive.Content
        asChild
        forceMount
        align={align}
        sideOffset={sideOffset}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
        onPointerDownOutside={onPointerDownOutside}
        onFocusOutside={onFocusOutside}
        onInteractOutside={onInteractOutside}
        {...props}
      >
        <motion.div
          key="popover-content"
          className={cn("z-50 w-72 outline-none", className)}
          style={{ transformPerspective: 500 }}
          initial={{ opacity: 0, scale: 0.8, rotateX: rx, rotateY: ry }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, rotateY: 0 }}
          exit={{ opacity: 0, scale: 0.8, rotateX: rx, rotateY: ry }}
          transition={transition}
        >
          <GlassPanel radius={12} color="#e6ebf2" className="block overflow-hidden border border-white/20">
            <div className="relative p-4 text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">{children}</div>
          </GlassPanel>
        </motion.div>
      </PopoverPrimitive.Content>
    </PopoverPortal>
  );
}
