import { useEffect, useState } from "react";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";
import { Download, RotateCw } from "lucide-react";

export const meta = {
  title: "Progress",
  description: "A glass track with a tinted indicator that slides on Radix's value transform.",
  minH: "min-h-[180px]",
};

export default function Demo() {
  // A self-running upload that loops, so the indicator animates over the grass.
  const [value, setValue] = useState(12);

  useEffect(() => {
    const id = setInterval(() => {
      setValue((v) => (v >= 100 ? 0 : Math.min(100, v + 8)));
    }, 700);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Live, looping upload bar with a running readout. */}
      <div className="flex flex-col gap-2 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Uploading assets
          </span>
          <span className="tabular-nums">{value}%</span>
        </div>
        <Progress value={value} />
      </div>

      {/* A static set of fixed milestones for contrast. */}
      <div className="grid grid-cols-3 gap-3">
        {[33, 66, 100].map((v) => (
          <div
            key={v}
            className="flex flex-col gap-1.5 text-xs font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]"
          >
            <span className="tabular-nums">{v}%</span>
            <Progress value={v} className="h-2" />
          </div>
        ))}
      </div>

      <Button size="sm" variant="secondary" onClick={() => setValue(0)} className="self-start gap-1.5">
        <RotateCw className="h-3.5 w-3.5" /> Restart
      </Button>
    </div>
  );
}
