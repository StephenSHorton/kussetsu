import { Plus, Settings, Trash2 } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Button } from "../ui/button";

export const meta = {
  title: "Tooltip",
  description: "Hover a control to float a small glass label, flipped from its side.",
  minH: "min-h-[120px]",
};

export default function Demo() {
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="sm">
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent from="top">Add item</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm">
              <Settings className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent from="bottom">Settings</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent from="bottom" side="right">
            Delete forever
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
