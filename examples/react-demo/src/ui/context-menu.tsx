import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { Check, ChevronRight, Circle } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass ContextMenu — shadcn's exact API + Tailwind contract on
 * @radix-ui/react-context-menu, rendered the Kussetsu way. The floating
 * surfaces (content + sub-content) ride the animate-ui baseline (motion +
 * forceMount + AnimatePresence: a blur/scale/flip spring entrance) and paint
 * through a <GlassPanel>. Radix owns behavior + a11y (right-click to open);
 * motion owns the transitions; Kussetsu owns the paint.
 *
 * Note vs DropdownMenu: ContextMenu.Root is always uncontrolled (it opens on
 * right-click — no `open`/`defaultOpen` props), so AnimatePresence is driven
 * purely off Radix's onOpenChange callback. The transform-origin CSS var is
 * also context-menu-specific.
 */

// ---------------------------------------------------------------------------
// Root + open-state context (drives AnimatePresence on the content)
// ---------------------------------------------------------------------------

type ContextMenuContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [ContextMenuProvider, useContextMenuContext] =
  getStrictContext<ContextMenuContextType>("ContextMenu");

type ContextMenuProps = React.ComponentProps<typeof ContextMenuPrimitive.Root>;

function ContextMenu(props: ContextMenuProps) {
  // ContextMenu.Root has no controlled `open`; it's right-click driven. We
  // seed `false` and let Radix's onOpenChange feed the open-state context.
  const [isOpen, setIsOpen] = useControlledState({
    defaultValue: false,
    onChange: props.onOpenChange,
  });

  return (
    <ContextMenuProvider value={{ isOpen, setIsOpen }}>
      <ContextMenuPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </ContextMenuProvider>
  );
}

const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuPortal = ContextMenuPrimitive.Portal;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

// ---------------------------------------------------------------------------
// Sub menu + sub-open-state context
// ---------------------------------------------------------------------------

type ContextMenuSubContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [ContextMenuSubProvider, useContextMenuSubContext] =
  getStrictContext<ContextMenuSubContextType>("ContextMenuSub");

type ContextMenuSubProps = React.ComponentProps<typeof ContextMenuPrimitive.Sub>;

function ContextMenuSub(props: ContextMenuSubProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <ContextMenuSubProvider value={{ isOpen, setIsOpen }}>
      <ContextMenuPrimitive.Sub {...props} onOpenChange={setIsOpen} />
    </ContextMenuSubProvider>
  );
}

// ---------------------------------------------------------------------------
// Shared spring used by both floating surfaces
// ---------------------------------------------------------------------------

const menuTransition: Transition = { type: "spring", stiffness: 150, damping: 25 };

// ---------------------------------------------------------------------------
// SubTrigger
// ---------------------------------------------------------------------------

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(function ContextMenuSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.SubTrigger
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
    </ContextMenuPrimitive.SubTrigger>
  );
});

// ---------------------------------------------------------------------------
// SubContent — floating glass surface, animate-ui baseline
// ---------------------------------------------------------------------------

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  Omit<React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>, "forceMount" | "asChild"> & {
    transition?: Transition;
  }
>(function ContextMenuSubContent({ className, transition = menuTransition, ...props }, ref) {
  const { isOpen } = useContextMenuSubContext();
  return (
    <AnimatePresence>
      {isOpen && (
        <ContextMenuPrimitive.Portal forceMount>
          <ContextMenuPrimitive.SubContent ref={ref} asChild forceMount {...props}>
            <motion.div
              key="context-menu-sub-content"
              className={cn("z-50 min-w-[8rem] origin-[--radix-context-menu-content-transform-origin]", className)}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={transition}
            >
              <GlassPanel radius={12} color="#e6ebf2" className="block overflow-hidden border border-white/20">
                <div className="p-1">{props.children}</div>
              </GlassPanel>
            </motion.div>
          </ContextMenuPrimitive.SubContent>
        </ContextMenuPrimitive.Portal>
      )}
    </AnimatePresence>
  );
});

// ---------------------------------------------------------------------------
// Content — floating glass surface, animate-ui baseline (blur + flip spring)
// ---------------------------------------------------------------------------

type ContextMenuContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>,
  "forceMount" | "asChild"
> & {
  transition?: Transition;
} & Pick<HTMLMotionProps<"div">, "initial" | "animate" | "exit">;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  ContextMenuContentProps
>(function ContextMenuContent({ className, transition = menuTransition, children, ...props }, ref) {
  const { isOpen } = useContextMenuContext();
  return (
    <AnimatePresence>
      {isOpen && (
        <ContextMenuPrimitive.Portal forceMount>
          <ContextMenuPrimitive.Content ref={ref} asChild forceMount {...props}>
            <motion.div
              key="context-menu-content"
              className={cn("z-50 min-w-[8rem] origin-[--radix-context-menu-content-transform-origin]", className)}
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
          </ContextMenuPrimitive.Content>
        </ContextMenuPrimitive.Portal>
      )}
    </AnimatePresence>
  );
});

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(function ContextMenuItem({ className, inset, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Item
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

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(function ContextMenuCheckboxItem({ className, children, checked, ...props }, ref) {
  return (
    <ContextMenuPrimitive.CheckboxItem
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
        <ContextMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
});

// ---------------------------------------------------------------------------
// RadioItem
// ---------------------------------------------------------------------------

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(function ContextMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.RadioItem
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
        <ContextMenuPrimitive.ItemIndicator>
          <Circle className="h-2 w-2 fill-current" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
});

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(function ContextMenuLabel({ className, inset, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Label
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

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(function ContextMenuSeparator({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-white/20", className)}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Shortcut
// ---------------------------------------------------------------------------

function ContextMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest text-white/60", className)}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
