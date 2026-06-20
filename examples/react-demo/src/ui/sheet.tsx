import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass Sheet (side drawer) — shadcn's Radix-dialog-based sheet rendered
 * as Kussetsu glass. Radix owns behavior + a11y; motion owns the slide/blur/fade
 * transitions via the animate-ui baseline (forceMount + AnimatePresence); the
 * <GlassPanel> surface is the refractive paint. Keeps shadcn's `side` cva variants.
 */
type SheetContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [SheetProvider, useSheetContext] = getStrictContext<SheetContextType>("Sheet");

type SheetProps = React.ComponentProps<typeof SheetPrimitive.Root>;

export function Sheet(props: SheetProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <SheetProvider value={{ isOpen, setIsOpen }}>
      <SheetPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </SheetProvider>
  );
}

export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

function SheetPortal(props: Omit<React.ComponentProps<typeof SheetPrimitive.Portal>, "forceMount">) {
  const { isOpen } = useSheetContext();
  return (
    <AnimatePresence>{isOpen && <SheetPrimitive.Portal forceMount {...props} />}</AnimatePresence>
  );
}

function SheetOverlay({
  className,
  transition = { duration: 0.2, ease: "easeInOut" },
  ...props
}: HTMLMotionProps<"div"> & { transition?: Transition }) {
  return (
    <SheetPrimitive.Overlay asChild forceMount>
      <motion.div
        key="sheet-overlay"
        className={cn("fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]", className)}
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(4px)" }}
        transition={transition}
        {...props}
      />
    </SheetPrimitive.Overlay>
  );
}

const sheetVariants = cva("fixed z-50 flex flex-col gap-4 outline-none", {
  variants: {
    side: {
      top: "inset-x-0 top-0 h-auto w-full",
      bottom: "inset-x-0 bottom-0 h-auto w-full",
      left: "inset-y-0 left-0 h-full w-3/4 max-w-sm",
      right: "inset-y-0 right-0 h-full w-3/4 max-w-sm",
    },
  },
  defaultVariants: { side: "right" },
});

type SheetSide = "top" | "bottom" | "left" | "right";

const offscreenBySide: Record<SheetSide, { x?: string; y?: string }> = {
  top: { y: "-100%" },
  bottom: { y: "100%" },
  left: { x: "-100%" },
  right: { x: "100%" },
};

const panelRadiusBySide: Record<SheetSide, number> = {
  top: 20,
  bottom: 20,
  left: 20,
  right: 20,
};

type SheetContentProps = Omit<
  React.ComponentProps<typeof SheetPrimitive.Content>,
  "forceMount" | "asChild"
> &
  VariantProps<typeof sheetVariants> & {
    transition?: Transition;
  };

export function SheetContent({
  className,
  children,
  side = "right",
  transition = { type: "spring", stiffness: 150, damping: 25 },
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: SheetContentProps) {
  const resolvedSide: SheetSide = side ?? "right";
  const offscreen = offscreenBySide[resolvedSide];

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
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
          key="sheet-content"
          className={cn(sheetVariants({ side }), className)}
          initial={{ opacity: 0, x: offscreen.x ?? 0, y: offscreen.y ?? 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: offscreen.x ?? 0, y: offscreen.y ?? 0 }}
          transition={transition}
        >
          <GlassPanel
            radius={panelRadiusBySide[resolvedSide]}
            color="#e6ebf2"
            className="block h-full w-full overflow-hidden border border-white/15"
          >
            <div className="relative flex h-full w-full flex-col gap-4 p-6 text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
              {children}
              <SheetPrimitive.Close
                className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-md text-white/80 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none"
                aria-label="Close"
              >
                ✕
              </SheetPrimitive.Close>
            </div>
          </GlassPanel>
        </motion.div>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 pr-8 text-left", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mt-auto flex flex-col gap-2 sm:flex-row sm:justify-end", className)} {...props} />
  );
}

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold leading-none text-white", className)}
      {...props}
    />
  );
});

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(function SheetDescription({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Description ref={ref} className={cn("text-sm text-white/80", className)} {...props} />
  );
});
