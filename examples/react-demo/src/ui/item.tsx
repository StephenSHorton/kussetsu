import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { Separator } from "./separator";

/**
 * shadcn Item — the exact API (Item / ItemGroup / ItemSeparator / ItemMedia /
 * ItemContent / ItemTitle / ItemDescription / ItemActions / ItemHeader /
 * ItemFooter + itemVariants / itemMediaVariants) and Tailwind contract, built
 * from plain semantic DOM (role="list", data-slot attrs — no Radix/library for
 * the row itself).
 *
 * Glass verdict: PARTIAL. The card-like surfaces become Kussetsu glass; the
 * layout primitives stay transparent DOM:
 *   - Item: its `outline` and `muted` variants are real surfaces → off-white
 *     "#e6ebf2" <GlassPanel> (outline gets a brighter border, muted a softer
 *     tint). The `default` variant is `bg-transparent` in shadcn — a bare row in
 *     a list — so it stays transparent DOM (no surface to glassify; also avoids
 *     stacking a second pane of glass when rows sit inside a glass ItemGroup /
 *     Card).
 *   - ItemMedia: its `icon` and `image` variants are small surfaces (the chip /
 *     thumbnail) → <GlassPanel>; the `default` variant is transparent DOM.
 *   - ItemSeparator reuses the local glass ./separator.
 *   - ItemGroup / ItemContent / ItemTitle / ItemDescription / ItemActions /
 *     ItemHeader / ItemFooter are layout primitives with no surface of their own
 *     → transparent DOM, keeping their full Tailwind contract.
 *
 * Children render crisp on top; the <GlassPanel> is just the refractive paint.
 */

// ---------------------------------------------------------------------------
// ItemGroup — layout primitive (no surface)
// ---------------------------------------------------------------------------

function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="list"
      data-slot="item-group"
      className={cn("group/item-group flex flex-col", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ItemSeparator — reuses the glass ./separator
// ---------------------------------------------------------------------------

function ItemSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      className={cn("my-0", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Item — the card-like row; outline/muted variants paint glass
// ---------------------------------------------------------------------------

const itemVariants = cva(
  "group/item flex flex-wrap items-center rounded-md border border-transparent text-sm text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-white/60 [a]:transition-colors [a]:hover:bg-white/10",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-white/40",
        muted: "",
      },
      size: {
        default: "gap-4 p-4",
        sm: "gap-2.5 px-4 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ItemVariant = NonNullable<VariantProps<typeof itemVariants>["variant"]>;

const glassByVariant: Record<ItemVariant, { color: string; tint?: number; panelClass?: string } | null> = {
  default: null,
  outline: { color: "#e6ebf2", tint: 0.05, panelClass: "border border-white/30" },
  muted: { color: "#e6ebf2", tint: 0.14 },
};

function Item({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";
  const row = (
    <Comp
      data-slot="item"
      data-variant={variant}
      data-size={size}
      className={cn(itemVariants({ variant, size, className }))}
      {...props}
    />
  );

  const g = glassByVariant[variant ?? "default"];
  if (!g) return row;

  return (
    <GlassPanel
      radius={10}
      color={g.color}
      tint={g.tint}
      className={cn("block overflow-hidden", g.panelClass)}
    >
      {row}
    </GlassPanel>
  );
}

// ---------------------------------------------------------------------------
// ItemMedia — icon/image variants are small surfaces → glass
// ---------------------------------------------------------------------------

const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-[[data-slot=item-description]]/item:translate-y-0.5 group-has-[[data-slot=item-description]]/item:self-start [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "size-8 rounded-sm text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] [&_svg:not([class*='size-'])]:size-4",
        image: "size-10 overflow-hidden rounded-sm [&_img]:size-full [&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type ItemMediaVariant = NonNullable<VariantProps<typeof itemMediaVariants>["variant"]>;

function ItemMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>) {
  const media = (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  );

  // `icon` and `image` are real surfaces (chip / thumbnail) → glass.
  // `default` is transparent DOM (no surface).
  if (variant === "default") return media;

  const radius = variant === "image" ? 8 : 6;
  return (
    <GlassPanel
      radius={radius}
      color="#e6ebf2"
      tint={(variant as Exclude<ItemMediaVariant, "default">) === "icon" ? 0.08 : 0.03}
      className="inline-flex shrink-0 overflow-hidden border border-white/20"
    >
      {media}
    </GlassPanel>
  );
}

// ---------------------------------------------------------------------------
// ItemContent / ItemTitle / ItemDescription — layout primitives (no surface)
// ---------------------------------------------------------------------------

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-content"
      className={cn("flex flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none", className)}
      {...props}
    />
  );
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn(
        "flex w-fit items-center gap-2 text-sm leading-snug font-medium text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        className,
      )}
      {...props}
    />
  );
}

function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="item-description"
      className={cn(
        "line-clamp-2 text-sm leading-normal font-normal text-balance text-white/70 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-white",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// ItemActions / ItemHeader / ItemFooter — layout primitives (no surface)
// ---------------------------------------------------------------------------

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-actions" className={cn("flex items-center gap-2", className)} {...props} />;
}

function ItemHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-header"
      className={cn("flex basis-full items-center justify-between gap-2", className)}
      {...props}
    />
  );
}

function ItemFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-footer"
      className={cn("flex basis-full items-center justify-between gap-2", className)}
      {...props}
    />
  );
}

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemFooter,
  itemVariants,
  itemMediaVariants,
};
