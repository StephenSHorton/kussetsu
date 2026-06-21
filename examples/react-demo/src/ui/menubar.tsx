import * as React from "react";
import * as MenubarPrimitive from "@radix-ui/react-menubar";
import { AnimatePresence, motion, type HTMLMotionProps, type Transition } from "motion/react";
import { Check, ChevronRight, Circle } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass Menubar — shadcn's exact API + Tailwind contract on
 * @radix-ui/react-menubar, rendered the Kussetsu way. The static menubar
 * itself is a glass pill; every floating surface (content + sub-content)
 * rides the animate-ui baseline (motion + forceMount + AnimatePresence:
 * a blur/scale/flip spring) and paints through a <GlassPanel>. Radix owns
 * behavior + a11y; motion owns the transitions; Kussetsu owns the paint.
 */

// ---------------------------------------------------------------------------
// Shared spring used by both floating surfaces
// ---------------------------------------------------------------------------

const menuTransition: Transition = { type: "spring", stiffness: 150, damping: 25 };

// ---------------------------------------------------------------------------
// Per-menu open-state context (drives AnimatePresence on the content)
// ---------------------------------------------------------------------------

type MenubarMenuContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [MenubarMenuProvider, useMenubarMenuContext] =
  getStrictContext<MenubarMenuContextType>("MenubarMenu");

type MenubarMenuProps = React.ComponentProps<typeof MenubarPrimitive.Menu>;

function MenubarMenu(props: MenubarMenuProps) {
  // Radix's <Menubar.Menu> does not expose open/onOpenChange; its open state is
  // owned by the parent <Menubar>. We mirror it via the data-state on the
  // trigger so AnimatePresence can gate the portal exit animation.
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <MenubarMenuProvider value={{ isOpen, setIsOpen }}>
      <MenubarPrimitive.Menu {...props} />
    </MenubarMenuProvider>
  );
}

// ---------------------------------------------------------------------------
// Sub menu + sub-open-state context
// ---------------------------------------------------------------------------

type MenubarSubContextType = { isOpen: boolean; setIsOpen: (open: boolean) => void };
const [MenubarSubProvider, useMenubarSubContext] =
  getStrictContext<MenubarSubContextType>("MenubarSub");

type MenubarSubProps = React.ComponentProps<typeof MenubarPrimitive.Sub>;

function MenubarSub(props: MenubarSubProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props.open,
    defaultValue: props.defaultOpen,
    onChange: props.onOpenChange,
  });

  return (
    <MenubarSubProvider value={{ isOpen, setIsOpen }}>
      <MenubarPrimitive.Sub {...props} onOpenChange={setIsOpen} />
    </MenubarSubProvider>
  );
}

const MenubarGroup = MenubarPrimitive.Group;
const MenubarPortal = MenubarPrimitive.Portal;
const MenubarRadioGroup = MenubarPrimitive.RadioGroup;

// ---------------------------------------------------------------------------
// Menubar — static glass pill that holds the triggers
// ---------------------------------------------------------------------------

const Menubar = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Root>
>(function Menubar({ className, ...props }, ref) {
  return (
    <GlassPanel radius={12} color="#e6ebf2" className="inline-flex overflow-hidden border border-white/20">
      <MenubarPrimitive.Root
        ref={ref}
        className={cn(
          "flex h-10 items-center gap-1 bg-transparent px-1.5",
          "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
          className,
        )}
        {...props}
      />
    </GlassPanel>
  );
});

// ---------------------------------------------------------------------------
// Trigger — syncs its open data-state into the menu context for AnimatePresence
// ---------------------------------------------------------------------------

const MenubarTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Trigger>
>(function MenubarTrigger({ className, ...props }, ref) {
  const { setIsOpen } = useMenubarMenuContext();
  const innerRef = React.useRef<HTMLButtonElement | null>(null);
  // Radix's <Menubar.Menu> exposes no open/onOpenChange — the active menu is
  // owned centrally by <Menubar.Root>. The trigger's data-state IS the source
  // of truth, so we observe it and bridge it into the per-menu context that
  // gates AnimatePresence (matching the dropdown-menu baseline's open signal).
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const sync = () => setIsOpen(node.getAttribute("data-state") === "open");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(node, { attributes: true, attributeFilter: ["data-state"] });
    return () => observer.disconnect();
  }, [setIsOpen]);

  const composedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    },
    [ref],
  );

  return (
    <MenubarPrimitive.Trigger
      ref={composedRef}
      className={cn(
        "flex cursor-default select-none items-center rounded-md px-3 py-1 text-sm font-medium outline-none",
        "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        "focus:bg-white/15 data-[state=open]:bg-white/15",
        className,
      )}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// SubTrigger
// ---------------------------------------------------------------------------

const MenubarSubTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(function MenubarSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <MenubarPrimitive.SubTrigger
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
    </MenubarPrimitive.SubTrigger>
  );
});

// ---------------------------------------------------------------------------
// SubContent — floating glass surface, animate-ui baseline
// ---------------------------------------------------------------------------

const MenubarSubContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.SubContent>,
  Omit<React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubContent>, "forceMount" | "asChild"> & {
    transition?: Transition;
  }
>(function MenubarSubContent({ className, transition = menuTransition, children, ...props }, ref) {
  const { isOpen } = useMenubarSubContext();
  return (
    <AnimatePresence>
      {isOpen && (
        <MenubarPrimitive.Portal forceMount>
          <MenubarPrimitive.SubContent ref={ref} asChild forceMount {...props}>
            <motion.div
              key="menubar-sub-content"
              className={cn(
                "z-50 min-w-[8rem] origin-[--radix-menubar-content-transform-origin]",
                className,
              )}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={transition}
            >
              <GlassPanel radius={12} color="#e6ebf2" className="block overflow-hidden border border-white/20">
                <div className="p-1 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">{children}</div>
              </GlassPanel>
            </motion.div>
          </MenubarPrimitive.SubContent>
        </MenubarPrimitive.Portal>
      )}
    </AnimatePresence>
  );
});

// ---------------------------------------------------------------------------
// Content — floating glass surface, animate-ui baseline (blur + flip spring)
// ---------------------------------------------------------------------------

type MenubarContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Content>,
  "forceMount" | "asChild"
> & {
  transition?: Transition;
} & Pick<HTMLMotionProps<"div">, "initial" | "animate" | "exit">;

const MenubarContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Content>,
  MenubarContentProps
>(function MenubarContent(
  { className, align = "start", alignOffset = -4, sideOffset = 8, transition = menuTransition, children, ...props },
  ref,
) {
  const { isOpen } = useMenubarMenuContext();
  return (
    <AnimatePresence>
      {isOpen && (
        <MenubarPrimitive.Portal forceMount>
          <MenubarPrimitive.Content
            ref={ref}
            asChild
            forceMount
            align={align}
            alignOffset={alignOffset}
            sideOffset={sideOffset}
            {...props}
          >
            <motion.div
              key="menubar-content"
              className={cn(
                "z-50 min-w-[12rem] origin-[--radix-menubar-content-transform-origin]",
                className,
              )}
              // Discrete transform props (NOT a `transform` string): motion
              // compares these by value across its internal re-renders, so the
              // settled spring isn't mis-detected as a changed target and
              // restarted from `initial` (a 1-frame flicker).
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
          </MenubarPrimitive.Content>
        </MenubarPrimitive.Portal>
      )}
    </AnimatePresence>
  );
});

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const MenubarItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Item> & {
    inset?: boolean;
  }
>(function MenubarItem({ className, inset, ...props }, ref) {
  return (
    <MenubarPrimitive.Item
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

const MenubarCheckboxItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.CheckboxItem>
>(function MenubarCheckboxItem({ className, children, checked, ...props }, ref) {
  return (
    <MenubarPrimitive.CheckboxItem
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
        <MenubarPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.CheckboxItem>
  );
});

// ---------------------------------------------------------------------------
// RadioItem
// ---------------------------------------------------------------------------

const MenubarRadioItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.RadioItem>
>(function MenubarRadioItem({ className, children, ...props }, ref) {
  return (
    <MenubarPrimitive.RadioItem
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
        <MenubarPrimitive.ItemIndicator>
          <Circle className="h-2 w-2 fill-current" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.RadioItem>
  );
});

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

const MenubarLabel = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Label> & {
    inset?: boolean;
  }
>(function MenubarLabel({ className, inset, ...props }, ref) {
  return (
    <MenubarPrimitive.Label
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

const MenubarSeparator = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Separator>
>(function MenubarSeparator({ className, ...props }, ref) {
  return (
    <MenubarPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-white/20", className)}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Shortcut
// ---------------------------------------------------------------------------

function MenubarShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest text-white/60", className)}
      {...props}
    />
  );
}

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarLabel,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarPortal,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarGroup,
  MenubarSub,
  MenubarShortcut,
};
