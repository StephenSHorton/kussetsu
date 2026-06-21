import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn ButtonGroup — the exact API (ButtonGroup / ButtonGroupText /
 * ButtonGroupSeparator + buttonGroupVariants) and Tailwind contract, built from
 * plain semantic DOM (role="group", data-slot attrs — no Radix/library for the
 * grouping itself).
 *
 * Glass verdict: PARTIAL. ButtonGroup is a layout primitive — it has no surface
 * of its own, it just butts already-glassified children (Button, Input, etc.)
 * edge-to-edge, so it stays transparent DOM. The two parts that ARE real
 * surfaces become Kussetsu glass: ButtonGroupText is an off-white "#e6ebf2"
 * glass chip, and ButtonGroupSeparator is a thin glass divider strip (matching
 * ./separator). Children keep their full Tailwind contract; the <GlassPanel> is
 * just the refractive paint behind them.
 */

const buttonGroupVariants = cva(
  "flex w-fit items-stretch [&>*]:focus-within:z-10 [&>*]:focus-visible:z-10 [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1 has-[>[data-slot=button-group]]:gap-2",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
        vertical:
          "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

export interface ButtonGroupProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof buttonGroupVariants> {}

function ButtonGroup({ className, orientation = "horizontal", ...props }: ButtonGroupProps) {
  return (
    <div
      data-slot="button-group"
      data-orientation={orientation}
      role="group"
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

export interface ButtonGroupTextProps extends React.ComponentProps<"div"> {
  asChild?: boolean;
}

function ButtonGroupText({ className, asChild = false, children, ...props }: ButtonGroupTextProps) {
  const Comp = asChild ? Slot : "div";
  return (
    <GlassPanel radius={10} color="#e6ebf2" className="inline-flex overflow-hidden border border-white/20">
      <Comp
        data-slot="button-group-text"
        className={cn(
          "flex items-center gap-2 px-4 text-sm font-medium text-white shadow-none [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
          "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    </GlassPanel>
  );
}

export interface ButtonGroupSeparatorProps extends React.ComponentProps<"div"> {
  orientation?: "horizontal" | "vertical";
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: ButtonGroupSeparatorProps) {
  return (
    <GlassPanel
      radius={999}
      color="#e6ebf2"
      className={cn(
        "relative !m-0 block shrink-0 self-stretch overflow-hidden",
        orientation === "vertical" ? "h-auto w-px" : "h-px w-full",
        className,
      )}
    >
      <div
        data-slot="button-group-separator"
        data-orientation={orientation}
        role="separator"
        aria-orientation={orientation}
        className={cn(
          "shrink-0 bg-white/25",
          orientation === "vertical" ? "h-full w-px" : "h-px w-full",
        )}
        {...props}
      />
    </GlassPanel>
  );
}

export { ButtonGroup, ButtonGroupText, ButtonGroupSeparator, buttonGroupVariants };
