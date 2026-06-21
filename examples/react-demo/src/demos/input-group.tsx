import { useState } from "react";
import { Search, Mail, Eye, EyeOff, Send } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
} from "../ui/input-group";

export const meta = {
  title: "Input Group",
  description: "Inputs fused with addons, buttons, and text on one sheet of glass.",
  minH: "min-h-[280px]",
};

export default function Demo() {
  const [show, setShow] = useState(false);

  return (
    <div className="flex w-80 max-w-full flex-col gap-3">
      {/* Leading icon addon */}
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search components…" />
      </InputGroup>

      {/* Leading icon + text suffix */}
      <InputGroup>
        <InputGroupAddon>
          <Mail />
        </InputGroupAddon>
        <InputGroupInput placeholder="username" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>@kussetsu.dev</InputGroupText>
        </InputGroupAddon>
      </InputGroup>

      {/* Trailing toggle button */}
      <InputGroup>
        <InputGroupInput type={show ? "text" : "password"} placeholder="Password" defaultValue="glass-pane" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" onClick={() => setShow((s) => !s)} aria-label="Toggle password">
            {show ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      {/* Textarea with block-end action row */}
      <InputGroup>
        <InputGroupTextarea placeholder="Write a message…" className="min-h-[64px]" />
        <InputGroupAddon align="block-end" className="border-t border-white/15">
          <InputGroupText className="text-xs">280 left</InputGroupText>
          <InputGroupButton size="sm" variant="default" className="ml-auto">
            <Send /> Send
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
