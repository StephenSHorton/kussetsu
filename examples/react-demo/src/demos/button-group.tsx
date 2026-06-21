import { useState } from "react";
import { ButtonGroup, ButtonGroupText, ButtonGroupSeparator } from "../ui/button-group";
import { Button } from "../ui/button";
import { AlignLeft, AlignCenter, AlignRight, Minus, Plus } from "lucide-react";

export const meta = {
  title: "Button Group",
  description: "Buttons butted edge-to-edge into one segmented glass control.",
  minH: "min-h-[180px]",
};

export default function Demo() {
  const [align, setAlign] = useState("left");
  const [qty, setQty] = useState(2);

  return (
    <div className="flex flex-col gap-4">
      {/* Segmented toggle */}
      <ButtonGroup>
        <Button
          variant={align === "left" ? "default" : "secondary"}
          size="sm"
          onClick={() => setAlign("left")}
        >
          <AlignLeft className="size-4" />
        </Button>
        <Button
          variant={align === "center" ? "default" : "secondary"}
          size="sm"
          onClick={() => setAlign("center")}
        >
          <AlignCenter className="size-4" />
        </Button>
        <Button
          variant={align === "right" ? "default" : "secondary"}
          size="sm"
          onClick={() => setAlign("right")}
        >
          <AlignRight className="size-4" />
        </Button>
      </ButtonGroup>

      {/* Stepper with a glass text chip + separator */}
      <ButtonGroup>
        <Button variant="secondary" size="sm" onClick={() => setQty((q) => Math.max(0, q - 1))}>
          <Minus className="size-4" />
        </Button>
        <ButtonGroupSeparator />
        <ButtonGroupText>{qty} seats</ButtonGroupText>
        <ButtonGroupSeparator />
        <Button variant="secondary" size="sm" onClick={() => setQty((q) => q + 1)}>
          <Plus className="size-4" />
        </Button>
      </ButtonGroup>
    </div>
  );
}
