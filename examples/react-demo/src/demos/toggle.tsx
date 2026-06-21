import { useState } from "react";
import { Bold, Italic, Underline, Star } from "lucide-react";
import { Toggle } from "../ui/toggle";

export const meta = {
  title: "Toggle",
  description: "A two-state button — the glass tints blue while pressed, with full ARIA pressed-state.",
  minH: "min-h-[140px]",
};

export default function Demo() {
  const [marks, setMarks] = useState({ bold: true, italic: false, underline: false });
  const set = (k: keyof typeof marks) => (v: boolean) => setMarks((p) => ({ ...p, [k]: v }));

  return (
    <div className="flex w-full flex-col gap-4 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
      <div className="flex flex-wrap items-center gap-2">
        <Toggle aria-label="Bold" pressed={marks.bold} onPressedChange={set("bold")}>
          <Bold />
        </Toggle>
        <Toggle aria-label="Italic" pressed={marks.italic} onPressedChange={set("italic")}>
          <Italic />
        </Toggle>
        <Toggle aria-label="Underline" pressed={marks.underline} onPressedChange={set("underline")}>
          <Underline />
        </Toggle>
        <Toggle variant="outline" size="sm" defaultPressed aria-label="Favorite">
          <Star />
          Favorite
        </Toggle>
      </div>

      <p
        className="text-[0.95rem] font-medium"
        style={{
          fontWeight: marks.bold ? 700 : 400,
          fontStyle: marks.italic ? "italic" : "normal",
          textDecoration: marks.underline ? "underline" : "none",
        }}
      >
        The quick brown fox.
      </p>
    </div>
  );
}
