import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Empty — the canonical empty-state layout primitive, ported faithfully.
 *
 * Empty is a LAYOUT primitive: a centered flex column (`Empty`), a header group
 * (`EmptyHeader` + `EmptyTitle`/`EmptyDescription`), and a content slot
 * (`EmptyContent`). These have no real visual surface, so they stay as plain
 * Tailwind and are NOT glassified — forcing glass on a transparent layout box
 * would be paint with nothing to refract.
 *
 * The one exception is `EmptyMedia` with `variant="icon"`: shadcn renders that
 * as a bordered, rounded, filled box framing an icon — a genuine little surface.
 * That single variant paints through a Kussetsu <GlassPanel>; the `default`
 * media variant (which shadcn leaves chrome-less, for raw avatars/illustrations)
 * stays plain. Same exported names, same Tailwind contract, same data-slots.
 */

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12",
        className,
      )}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-2 text-center", className)}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center mb-2 [&_svg:not([class*='size-'])]:size-6",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "text-white size-10 rounded-lg [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function EmptyMedia({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  // The `icon` variant is the only media with a real surface (bordered, filled,
  // rounded), so it paints through glass; `default` is chrome-less and stays plain.
  if (variant === "icon") {
    return (
      <GlassPanel radius={12} color="#e6ebf2" className="inline-flex overflow-hidden">
        <div
          data-slot="empty-icon"
          data-variant={variant}
          className={cn(
            emptyMediaVariants({ variant, className }),
            "[text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
          )}
          {...props}
        >
          {children}
        </div>
      </GlassPanel>
    );
  }

  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    >
      {children}
    </div>
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn(
        "text-lg font-medium tracking-tight text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]",
        className,
      )}
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn(
        "text-sm/relaxed text-white/80 [&>a:hover]:text-white [&>a]:underline [&>a]:underline-offset-4",
        className,
      )}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance text-white/90",
        className,
      )}
      {...props}
    />
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
  emptyMediaVariants,
};
