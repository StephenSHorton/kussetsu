import * as React from "react";
import {
  DayButton,
  DayPicker,
  getDefaultClassNames,
  type ChevronProps,
} from "react-day-picker";
import { cva, type VariantProps } from "class-variance-authority";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Calendar (react-day-picker v9), rendered as Kussetsu glass. The whole
 * month surface sits on an off-white <GlassPanel> card; the grid, captions, and
 * day buttons render as crisp white-on-glass DOM on top. Nav arrows and the
 * selected/today day reuse `calendarButtonVariants` (a small cva, mirroring how
 * shadcn reuses its `buttonVariants`). No overlay/portal, so no motion — rdp owns
 * keyboard + ARIA, Kussetsu owns the paint.
 */

const calendarButtonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium select-none outline-none transition-colors cursor-pointer [text-shadow:0_1px_6px_rgba(0,0,0,0.4)] focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        ghost: "text-white hover:bg-white/15 rounded-md",
        selected:
          "text-[#14172e] bg-white/80 [text-shadow:0_1px_0_rgba(255,255,255,0.25)] rounded-md",
        nav: "text-white hover:bg-white/15 rounded-md",
      },
      size: {
        icon: "h-8 w-8",
        cell: "h-8 w-8 text-sm p-0",
      },
    },
    defaultVariants: { variant: "ghost", size: "cell" },
  },
);

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  /** Glass color of the calendar surface. Defaults to off-white "#e6ebf2". */
  glassColor?: string;
  buttonVariant?: VariantProps<typeof calendarButtonVariants>["variant"];
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  glassColor = "#e6ebf2",
  components,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <GlassPanel radius={20} color={glassColor} className="inline-block overflow-hidden">
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn(
          "p-4 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] [--cell-size:2rem]",
          className,
        )}
        classNames={{
          root: cn("w-fit", defaultClassNames.root),
          months: cn("relative flex flex-col gap-4 sm:flex-row", defaultClassNames.months),
          month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
          nav: cn(
            "absolute inset-x-0 top-0 flex w-full items-center justify-between",
            defaultClassNames.nav,
          ),
          button_previous: cn(
            calendarButtonVariants({ variant: "nav", size: "icon" }),
            defaultClassNames.button_previous,
          ),
          button_next: cn(
            calendarButtonVariants({ variant: "nav", size: "icon" }),
            defaultClassNames.button_next,
          ),
          month_caption: cn(
            "flex h-8 w-full items-center justify-center px-8 font-semibold",
            defaultClassNames.month_caption,
          ),
          caption_label: cn("select-none text-sm font-semibold", defaultClassNames.caption_label),
          dropdowns: cn(
            "flex h-8 w-full items-center justify-center gap-1.5 text-sm font-semibold",
            defaultClassNames.dropdowns,
          ),
          dropdown_root: cn(
            "relative rounded-md border border-white/25 bg-white/10",
            defaultClassNames.dropdown_root,
          ),
          dropdown: cn(
            "absolute inset-0 bg-transparent text-sm opacity-0",
            defaultClassNames.dropdown,
          ),
          month_grid: "w-full border-collapse",
          weekdays: cn("flex", defaultClassNames.weekdays),
          weekday: cn(
            "flex-1 select-none rounded-md text-[0.8rem] font-normal text-white/70",
            defaultClassNames.weekday,
          ),
          week: cn("mt-2 flex w-full", defaultClassNames.week),
          week_number_header: cn(
            "w-[--cell-size] select-none",
            defaultClassNames.week_number_header,
          ),
          week_number: cn(
            "select-none text-[0.8rem] text-white/60",
            defaultClassNames.week_number,
          ),
          day: cn(
            "group/day relative aspect-square h-full w-full select-none p-0 text-center",
            defaultClassNames.day,
          ),
          range_start: cn("rounded-l-md", defaultClassNames.range_start),
          range_middle: cn("rounded-none", defaultClassNames.range_middle),
          range_end: cn("rounded-r-md", defaultClassNames.range_end),
          today: cn(
            "rounded-md ring-1 ring-inset ring-white/60 data-[selected=true]:ring-0",
            defaultClassNames.today,
          ),
          outside: cn("text-white/35 aria-selected:text-white/50", defaultClassNames.outside),
          disabled: cn("text-white/30 opacity-50", defaultClassNames.disabled),
          hidden: cn("invisible", defaultClassNames.hidden),
          ...classNames,
        }}
        components={{
          Chevron: ({ className: chevronClassName, orientation, ...chevronProps }: ChevronProps) => {
            const path =
              orientation === "left"
                ? "M15 18l-6-6 6-6"
                : orientation === "right"
                  ? "M9 18l6-6-6-6"
                  : "M6 9l6 6 6-6";
            return (
              <svg
                className={cn("h-4 w-4", chevronClassName)}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                {...chevronProps}
              >
                <path d={path} />
              </svg>
            );
          },
          DayButton: CalendarDayButton,
          ...components,
        }}
        {...props}
      />
    </GlassPanel>
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const selected =
    modifiers.selected ||
    modifiers.range_start ||
    modifiers.range_end ||
    modifiers.range_middle;

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected={modifiers.selected || undefined}
      data-range-start={modifiers.range_start || undefined}
      data-range-end={modifiers.range_end || undefined}
      data-range-middle={modifiers.range_middle || undefined}
      data-today={modifiers.today || undefined}
      className={cn(
        calendarButtonVariants({
          variant: selected ? "selected" : "ghost",
          size: "cell",
        }),
        "h-full w-full leading-none",
        modifiers.range_middle && "rounded-none bg-white/40 text-white",
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton, calendarButtonVariants };
