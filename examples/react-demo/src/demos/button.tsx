import { useState } from "react";
import { Heart, Loader2, Plus } from "lucide-react";
import { Button } from "../ui/button";

export const meta = {
  title: "Button",
  description: "Emphasis variants, sizes, and icons — every one real, refractive glass.",
  minH: "min-h-[180px]",
};

export default function Demo() {
  const [likes, setLikes] = useState(2);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Delete</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm">Small</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setLikes((n) => n + 1)}>
          <Heart className="mr-2 h-4 w-4" /> Like · {likes}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setTimeout(() => setBusy(false), 1200);
          }}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {busy ? "Adding…" : "Add item"}
        </Button>
        <Button variant="ghost" disabled>
          Disabled
        </Button>
      </div>
    </div>
  );
}
