import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { Check, ChevronRight, Circle } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass DropdownMenu — shadcn's exact API + Tailwind contract on
 * @radix-ui/react-dropdown-menu, rendered the Kussetsu way. The floating
 * surfaces (content + sub-content) ride the animate-ui baseline (motion +
 * forceMount + AnimatePresence: blur/fade overlay-style entrance with a
 * blur + scale/flip spring) and paint through a <GlassPanel>. Radix owns
 * behavior + a11y; motion owns the transitions; Kussetsu owns the paint.
 */

// ---------------------------------------------------------------------------
// Root + open-state context (drives AnimatePresence on the content)
// ---------------------------------------------------------------------------

type DropdownMenuContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [DropdownMenuProvider, useDropdownMenuContext] =
  getStrictContext<DropdownMenuContextType>("DropdownMenu");

type DropdownMenuProps = React.ComponentProps<typeof DropdownMenuPrimitive.Root>;

function DropdownMenu(props: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <DropdownMenuProvider value={{ isOpen, setIsOpen }}>
      <DropdownMenuPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </DropdownMenuProvider>
  );
}

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

// ---------------------------------------------------------------------------
// Sub menu + sub-open-state context
// ---------------------------------------------------------------------------

type DropdownMenuSubContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [DropdownMenuSubProvider, useDropdownMenuSubContext] =
  getStrictContext<DropdownMenuSubContextType>("DropdownMenuSub");

type DropdownMenuSubProps = React.ComponentProps<typeof DropdownMenuPrimitive.Sub>;

function DropdownMenuSub(props: DropdownMenuSubProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <DropdownMenuSubProvider value={{ isOpen, setIsOpen }}>
      <DropdownMenuPrimitive.Sub {...props} onOpenChange={setIsOpen} />
    </DropdownMenuSubProvider>
  );
}

// ---------------------------------------------------------------------------
// Shared spring used by both floating surfaces
// ---------------------------------------------------------------------------

const menuTransition: Transition = { type: "spring", stiffness: 150, damping: 25 };

// ---------------------------------------------------------------------------
// SubTrigger
// ---------------------------------------------------------------------------

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(function DropdownMenuSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        "flex cursor-default select-none items-center rounded-md px-2 py-1.5 text-sm outline-none",
        "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        "focus:bg-white/15 data-[state=open]:bg-white/15",
        inset && "pl-8",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4" />
    </DropdownMenuPrimitive.SubTrigger>
  );
});

// ---------------------------------------------------------------------------
// SubContent — floating glass surface, animate-ui baseline
// ---------------------------------------------------------------------------

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>, "forceMount" | "asChild"> & {
    transition?: Transition;
  }
>(function DropdownMenuSubContent({ className, transition = menuTransition, ...props }, ref) {
  const { isOpen } = useDropdownMenuSubContext();
  return (
    <AnimatePresence>
      {isOpen && (
        <DropdownMenuPrimitive.Portal forceMount>
          <DropdownMenuPrimitive.SubContent ref={ref} asChild forceMount {...props}>
            <motion.div
              key="dropdown-menu-sub-content"
              className={cn("z-50 min-w-[8rem] origin-[--radix-dropdown-menu-content-transform-origin]", className)}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={transition}
            >
              <GlassPanel radius={12} color="#e6ebf2" className="block overflow-hidden border border-white/20">
                <div className="p-1">{props.children}</div>
              </GlassPanel>
            </motion.div>
          </DropdownMenuPrimitive.SubContent>
        </DropdownMenuPrimitive.Portal>
      )}
    </AnimatePresence>
  );
});

// ---------------------------------------------------------------------------
// Content — floating glass surface, animate-ui baseline (blur + flip spring)
// ---------------------------------------------------------------------------

type DropdownMenuContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>,
  "forceMount" | "asChild"
> & {
  transition?: Transition;
} & Pick<HTMLMotionProps<"div">, "initial" | "animate" | "exit">;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(function DropdownMenuContent(
  { className, sideOffset = 4, transition = menuTransition, children, ...props },
  ref,
) {
  const { isOpen } = useDropdownMenuContext();
  return (
    <AnimatePresence>
      {isOpen && (
        <DropdownMenuPrimitive.Portal forceMount>
          <DropdownMenuPrimitive.Content ref={ref} asChild forceMount sideOffset={sideOffset} {...props}>
            <motion.div
              key="dropdown-menu-content"
              className={cn("z-50 min-w-[8rem] origin-[--radix-dropdown-menu-content-transform-origin]", className)}
              style={{ transformPerspective: 500 }}
              initial={{ opacity: 0, scale: 0.9, rotateX: -12, rotateY: 0 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0, rotateY: 0 }}
              exit={{ opacity: 0, scale: 0.9, rotateX: -12, rotateY: 0 }}
              transition={transition}
            >
              <GlassPanel radius={12} color="#e6ebf2" className="block overflow-hidden border border-white/20">
                <div className="p-1 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">{children}</div>
              </GlassPanel>
            </motion.div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      )}
    </AnimatePresence>
  );
});

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(function DropdownMenuItem({ className, inset, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
        "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        "focus:bg-white/15 focus:text-white",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&>svg]:size-4 [&>svg]:shrink-0",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// CheckboxItem
// ---------------------------------------------------------------------------

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className, children, checked, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none transition-colors",
        "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        "focus:bg-white/15 focus:text-white",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

// ---------------------------------------------------------------------------
// RadioItem
// ---------------------------------------------------------------------------

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none transition-colors",
        "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        "focus:bg-white/15 focus:text-white",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="h-2 w-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
});

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(function DropdownMenuLabel({ className, inset, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        "px-2 py-1.5 text-sm font-semibold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-white/20", className)}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Shortcut
// ---------------------------------------------------------------------------

function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest text-white/60", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
