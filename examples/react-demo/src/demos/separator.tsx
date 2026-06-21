import { Separator } from "../ui/separator";

export const meta = {
  title: "Separator",
  description: "A thin refractive glass divider — horizontal between blocks, vertical between inline items.",
  minH: "min-h-[140px]",
};

const label = "[text-shadow:0_1px_8px_rgba(0,0,0,0.6)]";

export default function Demo() {
  return (
    <div className="flex flex-col gap-1 text-white">
      <div className={`text-sm font-semibold ${label}`}>Kussetsu UI</div>
      <div className={`text-[0.82rem] text-white/80 ${label}`}>
        Glass-as-paint component catalog.
      </div>

      <Separator className="my-4" />

      <div className={`flex h-5 items-center gap-3 text-[0.82rem] ${label}`}>
        <span>Docs</span>
        <Separator orientation="vertical" />
        <span>Source</span>
        <Separator orientation="vertical" />
        <span>Blog</span>
      </div>
    </div>
  );
}
