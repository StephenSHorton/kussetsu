import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * shadcn's canonical date-picker, rendered as Kussetsu glass. This is purely a
 * styled COMPOSITION — it imports the already-glassified Popover, Calendar, and
 * Button from this folder and wires them together with a tiny amount of glue
 * (controlled/uncontrolled selected date + the trigger label). All of the glass
 * is inherited from those composed surfaces: the trigger is a glass <Button>,
 * the floating panel is the glass <PopoverContent>, and the month grid is the
 * glass <Calendar>. This file owns no <GlassPanel> of its own — only layout.
 *
 * The exported name (`DatePicker`) matches shadcn's docs example. Faithful to
 * shadcn's behavior + Tailwind contract: `variant="outline"` trigger, a
 * CalendarIcon, `format(date, "PPP")` for the label, a "w-auto p-0" content, and
 * `mode="single"` on the calendar. Adds optional controlled props (value /
 * onValueChange) so it is actually usable, while defaulting to uncontrolled like
 * the docs.
 */
export interface DatePickerProps {
  /** Controlled selected date. */
  value?: Date;
  /** Uncontrolled initial selected date. */
  defaultValue?: Date;
  /** Fired with the new date (or undefined when cleared). */
  onValueChange?: (date: Date | undefined) => void;
  /** Trigger label shown when no date is selected. */
  placeholder?: string;
  /** Disable the trigger. */
  disabled?: boolean;
  /** Merged onto the trigger <Button> (keeps shadcn's "w-[240px]" contract). */
  className?: string;
}

export function DatePicker({
  value,
  defaultValue,
  onValueChange,
  placeholder = "Pick a date",
  disabled,
  className,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<Date | undefined>(defaultValue);
  const [open, setOpen] = React.useState(false);

  const date = isControlled ? value : internal;

  const handleSelect = (next: Date | undefined) => {
    if (!isControlled) setInternal(next);
    onValueChange?.(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          disabled={disabled}
          className={cn(
            "w-[240px] justify-start gap-2 text-left font-normal",
            !date && "text-white/60",
            className,
          )}
          aria-label={date ? format(date, "PPP") : placeholder}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {/* Cancel PopoverContent's inner p-4 so the glass Calendar sits flush. */}
        <div className="-m-4">
          <Calendar mode="single" selected={date} onSelect={handleSelect} autoFocus />
        </div>
      </PopoverContent>
    </Popover>
  );
}
