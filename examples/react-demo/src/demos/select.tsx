import { useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "../ui/select";
import { Label } from "../ui/label";

export const meta = {
  title: "Select",
  description: "A glass dropdown that refracts the grass, with grouped, labelled options.",
  minH: "min-h-[150px]",
};

export default function Demo() {
  const [fruit, setFruit] = useState("blueberry");

  return (
    <div className="flex flex-col gap-2.5">
      <Label htmlFor="fruit" className="self-start">
        Favorite fruit
      </Label>
      <Select value={fruit} onValueChange={setFruit}>
        <SelectTrigger id="fruit" className="w-[200px]">
          <SelectValue placeholder="Pick one…" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Berries</SelectLabel>
            <SelectItem value="blueberry">Blueberry</SelectItem>
            <SelectItem value="strawberry">Strawberry</SelectItem>
            <SelectItem value="raspberry">Raspberry</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Citrus</SelectLabel>
            <SelectItem value="orange">Orange</SelectItem>
            <SelectItem value="lemon">Lemon</SelectItem>
            <SelectItem value="grapefruit" disabled>
              Grapefruit
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-[0.82rem] text-white/80 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        Selected: <span className="font-semibold capitalize">{fruit}</span>
      </p>
    </div>
  );
}
