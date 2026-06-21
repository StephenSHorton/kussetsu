import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";

export const meta = {
  title: "Textarea",
  description: "A multi-line text input rendered over live glass, with a label and live character counter.",
  minH: "min-h-[220px]",
};

const MAX = 240;

export default function Demo() {
  const [value, setValue] = useState("Glass is just paint — the DOM stays in charge.");

  return (
    <div className="flex w-full flex-col gap-2.5">
      <label
        htmlFor="ks-feedback"
        className="flex items-center gap-1.5 text-sm font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]"
      >
        <MessageSquare className="h-4 w-4" />
        Your feedback
      </label>

      <Textarea
        id="ks-feedback"
        value={value}
        maxLength={MAX}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tell us what you think…"
        className="min-h-[88px]"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-[rgba(255,255,255,0.7)] [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          {value.length}/{MAX}
        </span>
        <Button size="sm" disabled={value.trim().length === 0} onClick={() => setValue("")}>
          Send
        </Button>
      </div>

      <Textarea disabled defaultValue="Disabled — read only." className="min-h-[44px]" />
    </div>
  );
}
