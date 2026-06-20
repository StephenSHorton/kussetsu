import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass Dialog — the animate-ui baseline (motion + forceMount +
 * AnimatePresence): a blur/fade overlay and a 3D-flip + blur + scale spring for
 * the content, with a Kussetsu <GlassPanel> as the surface. Radix owns behavior
 * + a11y; motion owns the transitions; Kussetsu owns the paint.
 */
type DialogContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [DialogProvider, useDialogContext] = getStrictContext<DialogContextType>("Dialog");

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;

export function Dialog(props: DialogProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <DialogProvider value={{ isOpen, setIsOpen }}>
      <DialogPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </DialogProvider>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function DialogPortal(props: Omit<React.ComponentProps<typeof DialogPrimitive.Portal>, "forceMount">) {
  const { isOpen } = useDialogContext();
  return (
    <AnimatePresence>{isOpen && <DialogPrimitive.Portal forceMount {...props} />}</AnimatePresence>
  );
}

function DialogOverlay({
  className,
  transition = { duration: 0.2, ease: "easeInOut" },
  ...props
}: HTMLMotionProps<"div"> & { transition?: Transition }) {
  return (
    <DialogPrimitive.Overlay asChild forceMount>
      <motion.div
        key="dialog-overlay"
        className={cn("fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]", className)}
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(4px)" }}
        transition={transition}
        {...props}
      />
    </DialogPrimitive.Overlay>
  );
}

type DialogFlipDirection = "top" | "bottom" | "left" | "right";

type DialogContentProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Content>,
  "forceMount" | "asChild"
> & {
  from?: DialogFlipDirection;
  transition?: Transition;
};

export function DialogContent({
  className,
  children,
  from = "top",
  transition = { type: "spring", stiffness: 150, damping: 25 },
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: DialogContentProps) {
  // Discrete transform props (NOT a `transform` string): motion compares these
  // by value across its internal re-renders, so completing the spring doesn't
  // mis-detect a "changed" target and restart from `initial` (a 1-frame flicker).
  const flipRotation = from === "bottom" || from === "left" ? 20 : -20;
  const isXAxis = from === "top" || from === "bottom";
  const rx = isXAxis ? flipRotation : 0;
  const ry = isXAxis ? 0 : flipRotation;

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        asChild
        forceMount
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
        onPointerDownOutside={onPointerDownOutside}
        onInteractOutside={onInteractOutside}
        {...props}
      >
        <motion.div
          key="dialog-content"
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 outline-none",
            className,
          )}
          style={{ transformPerspective: 500 }}
          initial={{ opacity: 0, scale: 0.8, rotateX: rx, rotateY: ry }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, rotateY: 0 }}
          exit={{ opacity: 0, scale: 0.8, rotateX: rx, rotateY: ry }}
          transition={transition}
        >
          <GlassPanel radius={20} color="#e6ebf2" className="block overflow-hidden">
            <div className="relative p-6 text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
              {children}
              <DialogPrimitive.Close
                className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-md text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label="Close"
              >
                ✕
              </DialogPrimitive.Close>
            </div>
          </GlassPanel>
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-5 flex items-center justify-end gap-2.5", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-none", className)} {...props} />;
});

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn("text-sm text-white/80", className)} {...props} />;
});
