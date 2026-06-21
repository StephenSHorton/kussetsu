import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export const meta = {
  title: "Input",
  description: "Type straight into glass — every HTML input contract intact.",
  minH: "min-h-[230px]",
};

export default function Demo() {
  const [name, setName] = useState("Ada Lovelace");
  const [query, setQuery] = useState("");

  return (
    <div className="flex w-80 max-w-full flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          Display name
        </span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          Password
        </span>
        <Input type="password" defaultValue="hunter2" />
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
            Search
          </span>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter…" />
        </div>
        <Button size="default">
          <Search className="size-4" />
        </Button>
      </div>

      <Input disabled placeholder="Disabled" />
    </div>
  );
}
