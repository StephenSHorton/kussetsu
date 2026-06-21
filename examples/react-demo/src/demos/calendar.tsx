import { useState } from "react";
import { Calendar } from "../ui/calendar";

export const meta = {
  title: "Calendar",
  description: "A react-day-picker month grid rendered as a single refractive glass surface.",
  minH: "min-h-[360px]",
};

export default function Demo() {
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 5, 20));

  return (
    <div className="flex flex-col gap-3">
      <Calendar mode="single" selected={date} onSelect={setDate} />
      <p className="text-sm text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        Selected:{" "}
        {date
          ? date.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "none"}
      </p>
    </div>
  );
}
