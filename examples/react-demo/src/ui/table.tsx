import { forwardRef, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Table, rendered as a Kussetsu glass panel. The scroll container — the
 * one visible surface — becomes the off-white glass; the <table> and all its
 * sub-parts keep shadcn's exact Tailwind contract and render crisp on top.
 * Plain DOM, no Radix, no animation (shadcn's table has none).
 */
export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  ref,
) {
  return (
    <GlassPanel radius={16} color="#e6ebf2" className="block overflow-hidden">
      <div className="relative w-full overflow-auto">
        <table
          ref={ref}
          className={cn(
            "w-full caption-bottom text-sm text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
            className,
          )}
          {...props}
        />
      </div>
    </GlassPanel>
  );
});

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader({ className, ...props }, ref) {
    return <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-white/20", className)} {...props} />;
  },
);

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...props }, ref) {
    return <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
  },
);

export const TableFooter = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableFooter({ className, ...props }, ref) {
    return (
      <tfoot
        ref={ref}
        className={cn("border-t border-white/20 bg-white/10 font-medium [&>tr]:last:border-b-0", className)}
        {...props}
      />
    );
  },
);

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(function TableRow(
  { className, ...props },
  ref,
) {
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b border-white/15 transition-colors hover:bg-white/10 data-[state=selected]:bg-white/15",
        className,
      )}
      {...props}
    />
  );
});

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(function TableHead(
  { className, ...props },
  ref,
) {
  return (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-semibold text-white/80 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
});

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(function TableCell(
  { className, ...props },
  ref,
) {
  return (
    <td
      ref={ref}
      className={cn("p-4 align-middle text-white/90 [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
});

export const TableCaption = forwardRef<HTMLTableCaptionElement, HTMLAttributes<HTMLTableCaptionElement>>(
  function TableCaption({ className, ...props }, ref) {
    return <caption ref={ref} className={cn("mt-4 text-sm text-white/70", className)} {...props} />;
  },
);
