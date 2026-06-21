import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export const meta = {
  title: "Popover",
  description: "A glass surface that springs open from its trigger to hold rich content.",
  minH: "min-h-[120px]",
};

export default function Demo() {
  const [dims, setDims] = useState({ width: "100%", height: "25px" });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">
          <Settings2 className="mr-2 size-4" /> Dimensions
        </Button>
      </PopoverTrigger>
      <PopoverContent from="bottom" align="start" className="w-72">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold leading-none">Dimensions</h4>
          <p className="text-xs text-white/75">Set the dimensions for the layer.</p>
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <Label htmlFor="pop-width" className="w-20 justify-end">
              Width
            </Label>
            <Input
              id="pop-width"
              value={dims.width}
              onChange={(e) => setDims((d) => ({ ...d, width: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="pop-height" className="w-20 justify-end">
              Height
            </Label>
            <Input
              id="pop-height"
              value={dims.height}
              onChange={(e) => setDims((d) => ({ ...d, height: e.target.value }))}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
