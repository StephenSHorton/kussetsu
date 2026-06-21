import { useState } from "react";
import { format } from "date-fns";
import { DatePicker } from "../ui/date-picker";

export const meta = {
  title: "Date Picker",
  description: "A glass Popover + Calendar composition for picking a single date.",
  minH: "min-h-[120px]",
};

export default function Demo() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="flex flex-col gap-3">
      <DatePicker value={date} onValueChange={setDate} placeholder="Pick a date" />
      <p className="text-sm text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        {date ? `Selected: ${format(date, "PPP")}` : "No date selected"}
      </p>
    </div>
  );
}
