import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * Glass Drawer — shadcn's exact API + Tailwind contract on top of `vaul`,
 * rendered the Kussetsu way. vaul owns the behavior, the swipe-to-dismiss
 * physics, a11y, and (importantly) the drag/translate animation of the panel,
 * so unlike Dialog/DropdownMenu we do NOT layer motion/AnimatePresence on the
 * surface — fighting vaul's transforms would break the drag. The panel just
 * paints through a <GlassPanel>; vaul translates the wrapper around it.
 *
 * The overlay stays a plain DOM scrim (vaul fades it via data-state), and the
 * content sheet paints as off-white "#e6ebf2" glass with white text. Both the
 * grab handle and the surface keep their familiar shadcn Tailwind classes.
 */

function Drawer({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />;
}

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(function DrawerOverlay({ className, ...props }, ref) {
  return (
    <DrawerPrimitive.Overlay
      ref={ref}
      className={cn("fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]", className)}
      {...props}
    />
  );
});

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(function DrawerContent({ className, children, ...props }, ref) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col outline-none",
          className,
        )}
        {...props}
      >
        {/*
         * vaul translates this wrapper; GlassPanel is the static surface inside
         * it. No `filter` on the glass (it would clip the refraction); the grab
         * handle + content render crisp on top. Rounded only at the top to read
         * as a bottom sheet, matching shadcn's `rounded-t-[10px]`.
         */}
        <GlassPanel
          radius={20}
          color="#e6ebf2"
          className="block overflow-hidden rounded-b-none border border-white/20"
        >
          <div className="relative flex flex-col p-4 text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
            <div className="mx-auto mb-4 h-2 w-[100px] shrink-0 rounded-full bg-white/40" />
            {children}
          </div>
        </GlassPanel>
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
});

function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />;
}

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(function DrawerTitle({ className, ...props }, ref) {
  return (
    <DrawerPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
});

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(function DrawerDescription({ className, ...props }, ref) {
  return (
    <DrawerPrimitive.Description
      ref={ref}
      className={cn("text-sm text-white/80", className)}
      {...props}
    />
  );
});

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
