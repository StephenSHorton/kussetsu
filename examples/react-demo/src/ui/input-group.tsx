import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { Button } from "./button";

/**
 * shadcn InputGroup — the exact API (InputGroup / InputGroupAddon /
 * InputGroupButton / InputGroupText / InputGroupInput / InputGroupTextarea +
 * inputGroupAddonVariants / inputGroupButtonVariants) and Tailwind contract,
 * built from plain semantic DOM (role="group", data-slot / data-align attrs —
 * no Radix/library for the grouping itself).
 *
 * Glass verdict: PARTIAL. The InputGroup container is the ONE shared surface —
 * a single off-white "#e6ebf2" Kussetsu <GlassPanel> wraps the whole control so
 * the input + its addons sit on one continuous sheet of glass (radius 10, like
 * ./input + ./textarea). The control fields (InputGroupInput / InputGroupTextarea)
 * therefore render as BARE transparent <input>/<textarea> — they deliberately do
 * NOT each spin up their own GlassPanel (that would double-stack glass inside one
 * group); they keep shadcn's "border-0 bg-transparent shadow-none" contract plus
 * our white-text-over-glass treatment. InputGroupButton reuses the already-glass
 * ./button (ghost = a faint glass chip). InputGroupAddon / InputGroupText are
 * layout + label primitives with no surface of their own, so they stay
 * transparent DOM rendering crisp white content on top of the group's glass.
 */

function InputGroup({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <GlassPanel radius={10} color="#e6ebf2" className="block w-full overflow-hidden">
      <div
        data-slot="input-group"
        role="group"
        className={cn(
          "group/input-group relative flex w-full items-center bg-transparent text-white transition-[color,box-shadow] outline-none [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
          "h-10 min-w-0 has-[>textarea]:h-auto",

          // Variants based on alignment.
          "has-[>[data-align=inline-start]]:[&>input]:pl-2",
          "has-[>[data-align=inline-end]]:[&>input]:pr-2",
          "has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3",
          "has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3",

          // Focus state — glass-friendly inset ring instead of shadcn's box-shadow ring.
          "has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-inset has-[[data-slot=input-group-control]:focus-visible]:ring-white/50",

          // Error state.
          "has-[[data-slot][aria-invalid=true]]:ring-2 has-[[data-slot][aria-invalid=true]]:ring-inset has-[[data-slot][aria-invalid=true]]:ring-[#ff6b6b]/70",

          className,
        )}
        {...props}
      >
        {children}
      </div>
    </GlassPanel>
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-white/70 select-none [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start": "order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]",
        "inline-end": "order-last pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]",
        "block-start":
          "order-first w-full justify-start px-3 pt-3 group-has-[>input]/input-group:pt-2.5 [.border-b]:pb-3",
        "block-end":
          "order-last w-full justify-start px-3 pb-3 group-has-[>input]/input-group:pb-2.5 [.border-t]:pt-3",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  },
);

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return;
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva("flex items-center gap-2 text-sm shadow-none", {
  variants: {
    size: {
      xs: "h-6 gap-1 rounded-[calc(var(--radius)-5px)] px-2 has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",
      sm: "h-8 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2.5",
      "icon-xs": "size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0",
      "icon-sm": "size-8 p-0 has-[>svg]:p-0",
    },
  },
  defaultVariants: {
    size: "xs",
  },
});

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> & VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-white/70 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        "flex h-10 w-full flex-1 rounded-none border-0 bg-transparent px-3.5 text-[0.92rem] text-white shadow-none outline-none",
        "placeholder:text-white/55 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]",
        "focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        "flex min-h-[80px] w-full flex-1 resize-none rounded-none border-0 bg-transparent px-3.5 py-3 text-[0.92rem] text-white shadow-none outline-none",
        "placeholder:text-white/55 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]",
        "focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
  inputGroupAddonVariants,
  inputGroupButtonVariants,
};
