import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";
import { buttonVariants } from "./button";

/**
 * Animated glass AlertDialog — shadcn's API + Radix behavior/a11y on the
 * animate-ui baseline (motion + forceMount + AnimatePresence): a blur/fade
 * overlay and a 3D-flip + blur + scale spring for the content, with a Kussetsu
 * <GlassPanel> as the surface. Radix owns the modal/focus-trap behavior; motion
 * owns the transitions; Kussetsu owns the paint.
 */
type AlertDialogContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [AlertDialogProvider, useAlertDialogContext] =
  getStrictContext<AlertDialogContextType>("AlertDialog");

type AlertDialogProps = React.ComponentProps<typeof AlertDialogPrimitive.Root>;

export function AlertDialog(props: AlertDialogProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <AlertDialogProvider value={{ isOpen, setIsOpen }}>
      <AlertDialogPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </AlertDialogProvider>
  );
}

export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export function AlertDialogPortal(
  props: Omit<React.ComponentProps<typeof AlertDialogPrimitive.Portal>, "forceMount">,
) {
  const { isOpen } = useAlertDialogContext();
  return (
    <AnimatePresence>
      {isOpen && <AlertDialogPrimitive.Portal forceMount {...props} />}
    </AnimatePresence>
  );
}

export function AlertDialogOverlay({
  className,
  transition = { duration: 0.2, ease: "easeInOut" },
  ...props
}: HTMLMotionProps<"div"> & { transition?: Transition }) {
  return (
    <AlertDialogPrimitive.Overlay asChild forceMount>
      <motion.div
        key="alert-dialog-overlay"
        className={cn("fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]", className)}
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(4px)" }}
        transition={transition}
        {...props}
      />
    </AlertDialogPrimitive.Overlay>
  );
}

type AlertDialogFlipDirection = "top" | "bottom" | "left" | "right";

type AlertDialogContentProps = Omit<
  React.ComponentProps<typeof AlertDialogPrimitive.Content>,
  "forceMount" | "asChild"
> & {
  from?: AlertDialogFlipDirection;
  transition?: Transition;
};

export function AlertDialogContent({
  className,
  children,
  from = "top",
  transition = { type: "spring", stiffness: 150, damping: 25 },
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  ...props
}: AlertDialogContentProps) {
  // Discrete transform props (NOT a `transform` string): motion compares these
  // by value across its internal re-renders, so completing the spring doesn't
  // mis-detect a "changed" target and restart from `initial` (a 1-frame flicker).
  const flipRotation = from === "bottom" || from === "left" ? 20 : -20;
  const isXAxis = from === "top" || from === "bottom";
  const rx = isXAxis ? flipRotation : 0;
  const ry = isXAxis ? 0 : flipRotation;

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        asChild
        forceMount
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
        {...props}
      >
        <motion.div
          key="alert-dialog-content"
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
            <div className="relative flex flex-col gap-2 p-6 text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
              {children}
            </div>
          </GlassPanel>
        </motion.div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold leading-none", className)}
      {...props}
    />
  );
});

export const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-white/80", className)}
      {...props}
    />
  );
});

export const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(function AlertDialogAction({ className, ...props }, ref) {
  return (
    <GlassPanel radius={12} color="#7c8cff" className="inline-flex overflow-hidden">
      <AlertDialogPrimitive.Action
        ref={ref}
        className={cn(buttonVariants({ variant: "default" }), className)}
        {...props}
      />
    </GlassPanel>
  );
});

export const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(function AlertDialogCancel({ className, ...props }, ref) {
  return (
    <GlassPanel
      radius={12}
      color="#e6ebf2"
      className="inline-flex overflow-hidden border border-white/20"
    >
      <AlertDialogPrimitive.Cancel
        ref={ref}
        className={cn(buttonVariants({ variant: "secondary" }), className)}
        {...props}
      />
    </GlassPanel>
  );
});
