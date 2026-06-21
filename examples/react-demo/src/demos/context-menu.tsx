import { useState } from "react";
import { Copy, Scissors, ClipboardPaste, Trash2, Share2, Star } from "lucide-react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "../ui/context-menu";

export const meta = {
  title: "Context Menu",
  description: "Right-click the panel to open a portaled glass menu, with checkboxes, radios, and a submenu.",
  minH: "min-h-[150px]",
};

export default function Demo() {
  const [starred, setStarred] = useState(true);
  const [tone, setTone] = useState("cool");

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-24 w-80 max-w-full select-none items-center justify-center rounded-xl border border-dashed border-white/35 bg-white/5 text-sm text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        Right-click here
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem>
          <Copy /> Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          <Scissors /> Cut
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          <ClipboardPaste /> Paste
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked={starred} onCheckedChange={setStarred}>
          <Star className="mr-2 h-4 w-4" /> Starred
        </ContextMenuCheckboxItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Share2 className="mr-2 h-4 w-4" /> Tone
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuLabel>Pick a tone</ContextMenuLabel>
            <ContextMenuRadioGroup value={tone} onValueChange={setTone}>
              <ContextMenuRadioItem value="cool">Cool</ContextMenuRadioItem>
              <ContextMenuRadioItem value="warm">Warm</ContextMenuRadioItem>
              <ContextMenuRadioItem value="neutral">Neutral</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-red-300 focus:text-red-200">
          <Trash2 /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
