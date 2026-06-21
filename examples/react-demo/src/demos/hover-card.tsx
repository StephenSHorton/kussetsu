import { CalendarDays } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../ui/hover-card";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";

export const meta = {
  title: "Hover Card",
  description: "Hover a trigger to float a glass card of preview detail.",
  minH: "min-h-[120px]",
};

export default function Demo() {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Button variant="ghost">@kussetsu</Button>
      </HoverCardTrigger>
      <HoverCardContent from="bottom">
        <div className="flex gap-3">
          <Avatar>
            <AvatarFallback>KU</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Kussetsu</p>
            <p className="text-sm text-white/85">
              Reactive, accessible UI painted as live WGSL glass.
            </p>
            <div className="flex items-center gap-1.5 pt-1 text-xs text-white/70">
              <CalendarDays className="size-3.5" />
              Shipping since June 2026
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
