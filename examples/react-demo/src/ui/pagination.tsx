import { forwardRef, type ComponentProps, type HTMLAttributes } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { buttonVariants } from "./button";

/**
 * shadcn Pagination — exact API + Tailwind contract, built from plain semantic
 * HTML (no Radix/library). The interactive page links are the glassifiable
 * surface: each <PaginationLink> renders an anchor over a Kussetsu <GlassPanel>,
 * tinted like a ghost button (off-white) and like a secondary button when it is
 * the active page. Layout primitives (<nav>, <ul>, <li>) and the ellipsis carry
 * no surface, so they stay plain DOM. Kussetsu owns the paint; the anchor keeps
 * the full Tailwind contract.
 */

// ---------------------------------------------------------------------------
// Pagination — <nav> wrapper (layout primitive, no glass)
// ---------------------------------------------------------------------------

function Pagination({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// PaginationContent — <ul> (layout primitive, no glass)
// ---------------------------------------------------------------------------

const PaginationContent = forwardRef<HTMLUListElement, HTMLAttributes<HTMLUListElement>>(
  function PaginationContent({ className, ...props }, ref) {
    return <ul ref={ref} className={cn("flex flex-row items-center gap-1", className)} {...props} />;
  },
);

// ---------------------------------------------------------------------------
// PaginationItem — <li> (layout primitive, no glass)
// ---------------------------------------------------------------------------

const PaginationItem = forwardRef<HTMLLIElement, HTMLAttributes<HTMLLIElement>>(
  function PaginationItem({ className, ...props }, ref) {
    return <li ref={ref} className={cn("", className)} {...props} />;
  },
);

// ---------------------------------------------------------------------------
// PaginationLink — the glass surface: an anchor over a <GlassPanel>, painted
// like a ghost button (or secondary when active).
// ---------------------------------------------------------------------------

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<VariantProps<typeof buttonVariants>, "size"> &
  ComponentProps<"a">;

function PaginationLink({
  className,
  isActive,
  size = "default",
  children,
  ...props
}: PaginationLinkProps) {
  return (
    <GlassPanel
      radius={12}
      color="#e6ebf2"
      tint={isActive ? 0.18 : 0.05}
      className={cn(
        "inline-flex overflow-hidden",
        isActive ? "border border-white/20" : "border border-white/50",
      )}
    >
      <a
        aria-current={isActive ? "page" : undefined}
        data-active={isActive ? "" : undefined}
        className={cn(
          buttonVariants({ variant: isActive ? "secondary" : "ghost", size }),
          "bg-transparent",
          className,
        )}
        {...props}
      >
        {children}
      </a>
    </GlassPanel>
  );
}

// ---------------------------------------------------------------------------
// PaginationPrevious — labelled previous link (glass via PaginationLink)
// ---------------------------------------------------------------------------

function PaginationPrevious({ className, ...props }: ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("gap-1 pl-2.5", className)}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>Previous</span>
    </PaginationLink>
  );
}

// ---------------------------------------------------------------------------
// PaginationNext — labelled next link (glass via PaginationLink)
// ---------------------------------------------------------------------------

function PaginationNext({ className, ...props }: ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("gap-1 pr-2.5", className)}
      {...props}
    >
      <span>Next</span>
      <ChevronRight className="h-4 w-4" />
    </PaginationLink>
  );
}

// ---------------------------------------------------------------------------
// PaginationEllipsis — a gap marker, not interactive: plain DOM, no glass
// ---------------------------------------------------------------------------

function PaginationEllipsis({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-10 w-10 items-center justify-center text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        className,
      )}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
