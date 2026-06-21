import { useState } from "react";
import { Zap, Gauge, Leaf } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

export const meta = {
  title: "Radio Group",
  description: "Radix single-select — the chosen item's glass pill tints and shows a crisp white dot.",
  minH: "min-h-[210px]",
};

const PLANS = [
  { value: "performance", label: "Performance", hint: "Max throughput", Icon: Zap },
  { value: "balanced", label: "Balanced", hint: "Smart defaults", Icon: Gauge },
  { value: "eco", label: "Eco", hint: "Lowest power", Icon: Leaf },
];

export default function Demo() {
  const [plan, setPlan] = useState("balanced");

  return (
    <RadioGroup
      value={plan}
      onValueChange={setPlan}
      className="text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]"
    >
      {PLANS.map(({ value, label, hint, Icon }) => (
        <label key={value} className="flex cursor-pointer items-center gap-3">
          <RadioGroupItem value={value} id={value} />
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-medium">{label}</span>
          <span className="ml-auto text-[0.8rem] opacity-70">{hint}</span>
        </label>
      ))}

      {/* A disabled, unavailable option. */}
      <label className="flex items-center gap-3 opacity-50">
        <RadioGroupItem value="turbo" disabled />
        <span className="text-[0.92rem]">Turbo (coming soon)</span>
      </label>
    </RadioGroup>
  );
}
