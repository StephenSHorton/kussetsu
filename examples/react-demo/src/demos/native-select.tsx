import { useState } from "react";
import { NativeSelect } from "../ui/native-select";

export const meta = {
  title: "Native Select",
  description: "A real OS <select> on glass — the browser owns the popup, the surface is full glass.",
  minH: "min-h-[210px]",
};

export default function Demo() {
  const [fruit, setFruit] = useState("peach");

  return (
    <div className="flex w-72 max-w-full flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          Favorite fruit
        </span>
        <NativeSelect value={fruit} onChange={(e) => setFruit(e.target.value)}>
          <option value="peach">Peach</option>
          <option value="plum">Plum</option>
          <option value="apricot">Apricot</option>
          <option value="cherry">Cherry</option>
        </NativeSelect>
        <span className="text-xs text-white/70 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          Selected: {fruit}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          Timezone
        </span>
        <NativeSelect defaultValue="jst">
          <option value="pst">Pacific (PST)</option>
          <option value="utc">Coordinated (UTC)</option>
          <option value="jst">Japan (JST)</option>
        </NativeSelect>
      </div>

      <NativeSelect disabled defaultValue="locked">
        <option value="locked">Disabled select</option>
      </NativeSelect>
    </div>
  );
}
