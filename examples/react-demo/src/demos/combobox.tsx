import { useState } from "react";
import { Combobox, type ComboboxOption } from "../ui/combobox";

const FRAMEWORKS: ComboboxOption[] = [
  { value: "next", label: "Next.js" },
  { value: "svelte", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
];

export const meta = {
  title: "Combobox",
  description: "An autocomplete popover — search and select from glass options.",
  minH: "min-h-[120px]",
};

export default function Demo() {
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        Framework
      </span>
      <Combobox
        options={FRAMEWORKS}
        value={value}
        onValueChange={setValue}
        placeholder="Select framework..."
        searchPlaceholder="Search framework..."
        emptyMessage="No framework found."
        width={220}
      />
    </div>
  );
}
