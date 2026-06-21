import { useState } from "react";
import { Plane, Bell, Moon } from "lucide-react";
import { Switch } from "../ui/switch";

export const meta = {
  title: "Switch",
  description: "Radix toggle — the glass track tints green when on, and locks when disabled.",
  minH: "min-h-[190px]",
};

type Row = { id: string; icon: typeof Bell; label: string };

const ROWS: Row[] = [
  { id: "airplane", icon: Plane, label: "Airplane mode" },
  { id: "notify", icon: Bell, label: "Notifications" },
  { id: "night", icon: Moon, label: "Night shift" },
];

export default function Demo() {
  const [on, setOn] = useState<Record<string, boolean>>({
    airplane: false,
    notify: true,
    night: true,
  });

  // Airplane mode silences notifications: a controlled, derived switch state.
  const notifyOn = on.airplane ? false : on.notify;

  return (
    <div className="flex w-full max-w-xs flex-col gap-3.5 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
      {ROWS.map(({ id, icon: Icon, label }) => {
        const checked = id === "notify" ? notifyOn : on[id];
        const disabled = id === "notify" && on.airplane;
        return (
          <label key={id} className="flex items-center justify-between gap-3 font-medium">
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4 opacity-90" />
              {label}
            </span>
            <Switch
              checked={checked}
              disabled={disabled}
              onCheckedChange={(v: boolean) => setOn((p) => ({ ...p, [id]: v }))}
            />
          </label>
        );
      })}
    </div>
  );
}
