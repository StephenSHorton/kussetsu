import { useState } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

export const meta = {
  title: "Toggle Group",
  description: "Radix single/multiple toggle bar — each pressed item paints its own tinted glass pill.",
  minH: "min-h-[170px]",
};

export default function Demo() {
  const [marks, setMarks] = useState<string[]>(["bold"]);
  const [align, setAlign] = useState("center");

  return (
    <div className="flex flex-col gap-5 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
      {/* Multiple — text formatting marks (any combination on) */}
      <div className="flex flex-col gap-2">
        <span className="text-[0.78rem] font-medium uppercase tracking-[0.12em] opacity-75">
          Format
        </span>
        <ToggleGroup type="multiple" value={marks} onValueChange={setMarks}>
          <ToggleGroupItem value="bold" aria-label="Bold">
            <Bold className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <Italic className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <Underline className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Single, outline variant — text alignment (exactly one on) */}
      <div className="flex flex-col gap-2">
        <span className="text-[0.78rem] font-medium uppercase tracking-[0.12em] opacity-75">
          Align
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          value={align}
          onValueChange={(v: string) => v && setAlign(v)}
        >
          <ToggleGroupItem value="left" aria-label="Left">
            <AlignLeft className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Center">
            <AlignCenter className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Right">
            <AlignRight className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
