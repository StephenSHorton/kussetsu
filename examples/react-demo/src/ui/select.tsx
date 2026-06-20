import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * shadcn-faithful Select on Radix (keyboard, typeahead, ARIA all handled),
 * rendered as Kussetsu glass. The trigger is a glass control surface; the
 * floating list uses the animate-ui motion baseline (forceMount + AnimatePresence
 * + a blur/scale spring) wrapped in a <GlassPanel>. Radix owns behavior; motion
 * owns the transitions; Kussetsu owns the paint.
 */

type SelectContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [SelectProvider, useSelectContext] = getStrictContext<SelectContextType>("Select");

export function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <SelectProvider value={{ isOpen, setIsOpen }}>
      <SelectPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </SelectProvider>
  );
}

export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <GlassPanel radius={10} color="#e6ebf2" className="block overflow-hidden">
      <SelectPrimitive.Trigger
        ref={ref}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 bg-transparent px-3.5 text-[0.92rem] text-white outline-none",
          "[text-shadow:0_1px_6px_rgba(0,0,0,0.4)] [&>span]:line-clamp-1",
          "data-[placeholder]:text-white/55",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-70" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
    </GlassPanel>
  );
});

export const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(function SelectScrollUpButton({ className, ...props }, ref) {
  return (
    <SelectPrimitive.ScrollUpButton
      ref={ref}
      className={cn("flex cursor-default items-center justify-center py-1 text-white/80", className)}
      {...props}
    >
      <ChevronUpIcon className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
  );
});

export const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(function SelectScrollDownButton({ className, ...props }, ref) {
  return (
    <SelectPrimitive.ScrollDownButton
      ref={ref}
      className={cn("flex cursor-default items-center justify-center py-1 text-white/80", className)}
      {...props}
    >
      <ChevronDownIcon className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
  );
});

function SelectPortal(props: Omit<React.ComponentProps<typeof SelectPrimitive.Portal>, "forceMount">) {
  const { isOpen } = useSelectContext();
  return (
    <AnimatePresence>{isOpen && <SelectPrimitive.Portal forceMount {...props} />}</AnimatePresence>
  );
}

type SelectContentProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Content>,
  "forceMount" | "asChild"
> &
  Pick<HTMLMotionProps<"div">, "onAnimationComplete"> & {
    transition?: Transition;
  };

export function SelectContent({
  className,
  children,
  position = "popper",
  transition = { type: "spring", stiffness: 150, damping: 25 },
  onAnimationComplete,
  ...props
}: SelectContentProps) {
  return (
    <SelectPortal>
      <SelectPrimitive.Content asChild forceMount position={position} {...props}>
        <motion.div
          key="select-content"
          className={cn(
            "relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[8rem] origin-[var(--radix-select-content-transform-origin)]",
            position === "popper" &&
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
            className,
          )}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={transition}
          onAnimationComplete={onAnimationComplete}
        >
          <GlassPanel radius={12} color="#e6ebf2" className="block overflow-hidden">
            <div className="text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]">
              <SelectScrollUpButton />
              <SelectPrimitive.Viewport
                className={cn(
                  "p-1",
                  position === "popper" &&
                    "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
                )}
              >
                {children}
              </SelectPrimitive.Viewport>
              <SelectScrollDownButton />
            </div>
          </GlassPanel>
        </motion.div>
      </SelectPrimitive.Content>
    </SelectPortal>
  );
}

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn("px-2 py-1.5 text-xs font-semibold text-white/70", className)}
      {...props}
    />
  );
});

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-8 pr-2 text-[0.92rem] text-white outline-none",
        "focus:bg-white/20 data-[highlighted]:bg-white/20",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-white/20", className)}
      {...props}
    />
  );
});

/* ---- inline icons (no icon-set dependency) ---- */

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
