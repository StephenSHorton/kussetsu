import {
  Item,
  ItemGroup,
  ItemSeparator,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "../ui/item";
import { Button } from "../ui/button";
import { FileText, Image as ImageIcon, ChevronRight } from "lucide-react";

export const meta = {
  title: "Item",
  description: "Card-like rows — outline/muted surfaces and icon chips paint glass; layout stays crisp DOM.",
  minH: "min-h-[230px]",
};

export default function Demo() {
  return (
    <ItemGroup className="w-96 max-w-full gap-2">
      <Item variant="outline">
        <ItemMedia variant="icon">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>quarterly-report.pdf</ItemTitle>
          <ItemDescription>2.4 MB · updated 3 days ago</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </ItemActions>
      </Item>

      <Item variant="muted" size="sm">
        <ItemMedia variant="icon">
          <ImageIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>cover-art.png</ItemTitle>
          <ItemDescription>1280 × 720</ItemDescription>
        </ItemContent>
        <ItemActions>
          <ChevronRight className="size-4 text-white/70" />
        </ItemActions>
      </Item>

      <ItemSeparator />

      <Item size="sm">
        <ItemContent>
          <ItemTitle>Bare row</ItemTitle>
          <ItemDescription>The default variant is transparent DOM — no second pane of glass.</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  );
}
