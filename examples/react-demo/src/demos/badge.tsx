import { Badge } from "../ui/badge";
import { Check, Sparkles, AlertTriangle, Bell } from "lucide-react";

export const meta = {
  title: "Badge",
  description: "Saturated, translucent glass chips for status, counts, and labels.",
  minH: "min-h-[140px]",
};

export default function Demo() {
  return (
    <div className="flex flex-col gap-4">
      {/* All four variants as a row of glass chips. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>

      {/* Badges carrying icons read crisply over the grass. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge>
          <Sparkles className="mr-1 h-3 w-3" /> New
        </Badge>
        <Badge variant="secondary">
          <Check className="mr-1 h-3 w-3" /> Verified
        </Badge>
        <Badge variant="destructive">
          <AlertTriangle className="mr-1 h-3 w-3" /> Failed
        </Badge>
        <Badge variant="outline">
          <Bell className="mr-1 h-3 w-3" /> 12
        </Badge>
      </div>

      {/* Inline next to a label — the common "title + count" pairing. */}
      <div className="flex items-center gap-2.5 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        <span className="text-sm font-medium">Inbox</span>
        <Badge>3 unread</Badge>
      </div>
    </div>
  );
}
