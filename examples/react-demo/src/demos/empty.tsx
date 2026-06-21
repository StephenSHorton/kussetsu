import { FolderOpen, Plus } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "../ui/empty";
import { Button } from "../ui/button";

export const meta = {
  title: "Empty",
  description: "A centered empty-state layout; only the icon media paints through glass.",
  minH: "min-h-[260px]",
};

export default function Demo() {
  return (
    <Empty className="w-96 max-w-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderOpen />
        </EmptyMedia>
        <EmptyTitle>No projects yet</EmptyTitle>
        <EmptyDescription>
          Create your first project to start refracting the grass behind it.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm">
          <Plus className="size-4" />
          New project
        </Button>
      </EmptyContent>
    </Empty>
  );
}
