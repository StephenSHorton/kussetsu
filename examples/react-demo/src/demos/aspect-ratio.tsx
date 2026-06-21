import { AspectRatio } from "../ui/aspect-ratio";
import { GlassPanel } from "@kussetsu/react";
import { ImageIcon, Play } from "lucide-react";

export const meta = {
  title: "Aspect Ratio",
  description: "Layout primitive that locks content to a fixed width/height ratio; glass lives on the content.",
  minH: "min-h-[200px]",
};

export default function Demo() {
  return (
    <div className="flex flex-wrap items-start gap-5">
      {/* 16:9 — the canonical media/video frame, filled with glass content. */}
      <div className="w-64 max-w-full">
        <AspectRatio ratio={16 / 9}>
          <GlassPanel radius={12} color="#7c8cff" className="block h-full w-full overflow-hidden">
            <div className="flex h-full w-full items-center justify-center text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
              <Play className="h-7 w-7" />
            </div>
          </GlassPanel>
        </AspectRatio>
        <p className="mt-1.5 text-xs font-medium text-white/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">16 / 9</p>
      </div>

      {/* 1:1 — a square thumbnail tile. */}
      <div className="w-32 max-w-full">
        <AspectRatio ratio={1}>
          <GlassPanel radius={12} color="#e6ebf2" className="block h-full w-full overflow-hidden">
            <div className="flex h-full w-full items-center justify-center text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
              <ImageIcon className="h-6 w-6" />
            </div>
          </GlassPanel>
        </AspectRatio>
        <p className="mt-1.5 text-xs font-medium text-white/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">1 / 1</p>
      </div>
    </div>
  );
}
