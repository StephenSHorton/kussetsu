import * as React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { ChevronDown } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * Animated glass NavigationMenu — shadcn's exact API + Tailwind contract on
 * @radix-ui/react-navigation-menu, rendered the Kussetsu way. The floating
 * surface (the Viewport that hosts the active item's Content) rides the
 * animate-ui baseline (motion + forceMount + AnimatePresence: a blur/scale/flip
 * spring with DISCRETE transform props — never a `transform` string — and no
 * `filter` on the glass) and paints through a <GlassPanel>. Radix owns behavior
 * + a11y; motion owns the transitions; Kussetsu owns the paint.
 */

// ---------------------------------------------------------------------------
// Root + open-state context (drives AnimatePresence on the viewport)
// ---------------------------------------------------------------------------

type NavigationMenuContextType = { value: string; setValue: (value: string) => void };
const [NavigationMenuProvider, useNavigationMenuContext] =
  getStrictContext<NavigationMenuContextType>("NavigationMenu");

const navigationMenuTransition: Transition = { type: "spring", stiffness: 150, damping: 25 };

type NavigationMenuProps = React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean;
};

const NavigationMenu = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  NavigationMenuProps
>(function NavigationMenu({ className, children, viewport = true, ...props }, ref) {
  // Mirror Radix's controlled/uncontrolled value so AnimatePresence can gate the
  // viewport: a non-empty value means some item's content is open.
  const [value, setValue] = useControlledState({
    value: props.value,
    defaultValue: props.defaultValue ?? "",
    onChange: props.onValueChange,
  });

  return (
    <NavigationMenuProvider value={{ value, setValue }}>
      <NavigationMenuPrimitive.Root
        ref={ref}
        data-slot="navigation-menu"
        data-viewport={viewport}
        className={cn(
          "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
          className,
        )}
        {...props}
        value={props.value}
        onValueChange={setValue}
      >
        {children}
        {viewport && <NavigationMenuViewport />}
      </NavigationMenuPrimitive.Root>
    </NavigationMenuProvider>
  );
});

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(function NavigationMenuList({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.List
      ref={ref}
      data-slot="navigation-menu-list"
      className={cn("group flex flex-1 list-none items-center justify-center gap-1", className)}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const NavigationMenuItem = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Item>
>(function NavigationMenuItem({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Item
      ref={ref}
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Trigger — a glass pill, like our other controls
// ---------------------------------------------------------------------------

const navigationMenuTriggerStyle = () =>
  cn(
    "group inline-flex h-9 w-max items-center justify-center gap-1 rounded-full bg-transparent px-4 py-2 text-sm font-medium",
    "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] outline-none transition-colors",
    "hover:bg-white/15 focus:bg-white/15 data-[state=open]:bg-white/15",
    "disabled:pointer-events-none disabled:opacity-50",
  );

const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(function NavigationMenuTrigger({ className, children, ...props }, ref) {
  return (
    <GlassPanel radius={999} color="#e6ebf2" className="inline-flex overflow-hidden">
      <NavigationMenuPrimitive.Trigger
        ref={ref}
        data-slot="navigation-menu-trigger"
        className={cn(navigationMenuTriggerStyle(), "group/trigger", className)}
        {...props}
      >
        {children}{" "}
        <ChevronDown
          className="relative top-px ml-1 h-3 w-3 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180"
          aria-hidden="true"
        />
      </NavigationMenuPrimitive.Trigger>
    </GlassPanel>
  );
});

// ---------------------------------------------------------------------------
// Content — sits inside the (glass) Viewport, so it renders crisp, not glass.
// When the menu has no Viewport, Content is itself the floating surface and is
// wrapped in its own <GlassPanel> with the animate-ui baseline.
// ---------------------------------------------------------------------------

const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(function NavigationMenuContent({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Content
      ref={ref}
      data-slot="navigation-menu-content"
      className={cn(
        "left-0 top-0 w-full p-2 pr-2.5 text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out",
        "data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out",
        "data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52",
        "data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52",
        "md:absolute md:w-auto",
        // No-viewport mode: Content is the floating glass surface itself.
        "group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5",
        "group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-2xl",
        className,
      )}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

const NavigationMenuLink = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Link>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Link>
>(function NavigationMenuLink({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Link
      ref={ref}
      data-slot="navigation-menu-link"
      className={cn(
        "flex flex-col gap-1 rounded-lg p-2 text-sm outline-none transition-colors",
        "text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        "hover:bg-white/15 focus:bg-white/15 data-[active=true]:bg-white/15 data-[active=true]:focus:bg-white/15 data-[active=true]:hover:bg-white/15",
        "focus-visible:ring-2 focus-visible:ring-white/50",
        "[&_svg:not([class*='text-'])]:text-white/80 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Viewport — the floating glass surface, animate-ui baseline (blur + flip spring)
// ---------------------------------------------------------------------------

const NavigationMenuViewport = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Viewport>,
  Omit<
    React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>,
    "forceMount"
  > & {
    transition?: Transition;
  }
>(function NavigationMenuViewport({ className, transition = navigationMenuTransition, ...props }, ref) {
  const { value } = useNavigationMenuContext();
  const isOpen = value !== "";

  return (
    <div className={cn("absolute left-0 top-full isolate z-50 flex justify-center")}>
      <AnimatePresence>
        {isOpen && (
          <NavigationMenuPrimitive.Viewport
            ref={ref}
            data-slot="navigation-menu-viewport"
            forceMount
            asChild
            {...props}
          >
            <motion.div
              key="navigation-menu-viewport"
              className={cn(
                "relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full origin-top-center md:w-[var(--radix-navigation-menu-viewport-width)]",
                className,
              )}
              style={{ transformPerspective: 600 }}
              initial={{ opacity: 0, scale: 0.95, rotateX: -12 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, scale: 0.95, rotateX: -12 }}
              transition={transition}
            >
              <GlassPanel
                radius={16}
                color="#e6ebf2"
                className="block h-full w-full overflow-hidden border border-white/20"
              />
            </motion.div>
          </NavigationMenuPrimitive.Viewport>
        )}
      </AnimatePresence>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Indicator — the little arrow that points at the active trigger
// ---------------------------------------------------------------------------

const NavigationMenuIndicator = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Indicator>
>(function NavigationMenuIndicator({ className, ...props }, ref) {
  return (
    <NavigationMenuPrimitive.Indicator
      ref={ref}
      data-slot="navigation-menu-indicator"
      className={cn(
        "top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
        "data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in",
        className,
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-white/70 shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />
    </NavigationMenuPrimitive.Indicator>
  );
});

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
};
