import { useState } from "react";
import { Volume2 } from "lucide-react";
import { Slider } from "../ui/slider";

export const meta = {
  title: "Slider",
  description: "Radix drag, keyboard, and multi-thumb behavior over a Kussetsu glass track with glass thumbs.",
  minH: "min-h-[200px]",
};

export default function Demo() {
  const [volume, setVolume] = useState([60]);
  const [price, setPrice] = useState([25, 75]);

  return (
    <div className="flex flex-col gap-7 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
      {/* Single-thumb slider with a live readout. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm font-medium">
          <span className="inline-flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            Volume
          </span>
          <span className="tabular-nums">{volume[0]}%</span>
        </div>
        <Slider value={volume} onValueChange={setVolume} min={0} max={100} step={1} />
      </div>

      {/* Two-thumb range slider. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Price range</span>
          <span className="tabular-nums">
            ${price[0]} – ${price[1]}
          </span>
        </div>
        <Slider value={price} onValueChange={setPrice} min={0} max={100} step={5} />
      </div>
    </div>
  );
}
