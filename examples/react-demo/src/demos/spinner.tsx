import { Spinner } from "../ui/spinner";
import { Button } from "../ui/button";

export const meta = {
  title: "Spinner",
  description: "An animated loading indicator that inherits currentColor and stays crisp over glass.",
  minH: "min-h-[140px]",
};

export default function Demo() {
  const label = "[text-shadow:0_1px_8px_rgba(0,0,0,0.6)]";
  return (
    <div className="flex flex-col gap-5 text-white">
      {/* Sizes */}
      <div className="flex items-end gap-6">
        <Spinner className="size-4" />
        <Spinner className="size-6" />
        <Spinner className="size-8" />
      </div>

      {/* Tinted via text color + inline with a label */}
      <div className="flex items-center gap-3">
        <Spinner className="size-5 text-[#8ea2ff]" />
        <span className={`text-sm font-medium ${label}`}>Loading your session&hellip;</span>
      </div>

      {/* Inside a button */}
      <Button disabled className="gap-2">
        <Spinner className="size-4" />
        Please wait
      </Button>
    </div>
  );
}
