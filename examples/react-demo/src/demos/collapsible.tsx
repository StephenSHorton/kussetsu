import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../ui/collapsible";

export const meta = {
  title: "Collapsible",
  description: "A single glass disclosure that springs open and shut, animating its height.",
  minH: "min-h-[180px]",
};

const releases = [
  "v0.3.0 — dispersion + rim controls",
  "v0.2.1 — Safari backdrop fix",
  "v0.2.0 — React adapter",
];

export default function Demo() {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex w-80 max-w-full flex-col">
      <CollapsibleTrigger>
        <span>What changed recently?</span>
        <ChevronsUpDown />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-1.5">
          {releases.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
