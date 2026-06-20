import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Breadcrumb, rendered as a Kussetsu glass track. The semantic
 * <nav>/<ol>/<li> structure and the full Tailwind contract are preserved; the
 * visible surface (the breadcrumb list) sits inside a pill-shaped <GlassPanel>,
 * with crisp white text on top. No Radix primitive and no motion — shadcn's
 * breadcrumb is plain DOM, so this is just paint.
 */

export const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"nav"> & {
    separator?: React.ReactNode;
  }
>(function Breadcrumb({ ...props }, ref) {
  return <nav ref={ref} aria-label="breadcrumb" {...props} />;
});

export const BreadcrumbList = React.forwardRef<
  HTMLOListElement,
  React.ComponentPropsWithoutRef<"ol">
>(function BreadcrumbList({ className, ...props }, ref) {
  return (
    <GlassPanel radius={999} color="#e6ebf2" className="inline-flex overflow-hidden border border-white/20">
      <ol
        ref={ref}
        className={cn(
          "flex flex-wrap items-center gap-1.5 px-3.5 py-1.5 text-sm break-words text-white/70",
          "[text-shadow:0_1px_6px_rgba(0,0,0,0.45)] sm:gap-2.5",
          className,
        )}
        {...props}
      />
    </GlassPanel>
  );
});

export const BreadcrumbItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<"li">
>(function BreadcrumbItem({ className, ...props }, ref) {
  return <li ref={ref} className={cn("inline-flex items-center gap-1.5", className)} {...props} />;
});

export const BreadcrumbLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a"> & {
    asChild?: boolean;
  }
>(function BreadcrumbLink({ asChild, className, ...props }, ref) {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      ref={ref}
      className={cn("transition-colors hover:text-white", className)}
      {...props}
    />
  );
});

export const BreadcrumbPage = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span">
>(function BreadcrumbPage({ className, ...props }, ref) {
  return (
    <span
      ref={ref}
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-medium text-white", className)}
      {...props}
    />
  );
});

export function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5 text-white/50", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

export function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-9 items-center justify-center text-white/70", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  );
}
