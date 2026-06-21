import { useState } from "react";
import { Checkbox } from "../ui/checkbox";

type CheckedState = boolean | "indeterminate";

export const meta = {
  title: "Checkbox",
  description: "Radix behavior — checked, indeterminate, and disabled states tint the glass box.",
  minH: "min-h-[200px]",
};

const SCOPES = ["Repositories", "Workflows", "Packages"];

export default function Demo() {
  const [scopes, setScopes] = useState<Record<string, boolean>>({
    Repositories: true,
    Workflows: false,
    Packages: true,
  });

  const checkedCount = SCOPES.filter((s) => scopes[s]).length;
  const allChecked = checkedCount === SCOPES.length;
  const allState = allChecked ? true : checkedCount === 0 ? false : "indeterminate";

  return (
    <div className="flex flex-col gap-4 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
      {/* Controlled group: parent reflects an indeterminate / all / none state. */}
      <label className="flex items-center gap-2.5 font-medium">
        <Checkbox
          checked={allState}
          onCheckedChange={(v: CheckedState) =>
            setScopes(Object.fromEntries(SCOPES.map((s) => [s, v === true])))
          }
        />
        Select all scopes
      </label>

      <div className="flex flex-col gap-2.5 pl-6 text-[0.92rem]">
        {SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-2.5">
            <Checkbox
              checked={scopes[scope]}
              onCheckedChange={(v: CheckedState) => setScopes((p) => ({ ...p, [scope]: v === true }))}
            />
            {scope}
          </label>
        ))}
      </div>

      {/* A disabled, locked-on box. */}
      <label className="flex items-center gap-2.5 text-[0.92rem] opacity-60">
        <Checkbox checked disabled />
        Audit log (required)
      </label>
    </div>
  );
}
