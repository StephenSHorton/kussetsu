import { useState } from "react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

export const meta = {
  title: "Label",
  description: "A glass-chip label that clicks to focus its associated control (Radix a11y).",
  minH: "min-h-[200px]",
};

export default function Demo() {
  const [email, setEmail] = useState("ada@kussetsu.dev");
  return (
    <div className="flex w-80 max-w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="demo-email">Email address</Label>
        <Input
          id="demo-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div className="flex items-center gap-3">
        <Switch id="demo-notify" defaultChecked />
        <Label htmlFor="demo-notify">Email notifications</Label>
      </div>
    </div>
  );
}
