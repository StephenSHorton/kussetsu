import { useState } from "react";
import { Settings2 } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "../ui/sheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export const meta = {
  title: "Sheet",
  description: "A side drawer that slides in over the page for edits and settings.",
  minH: "min-h-[120px]",
};

export default function Demo() {
  const [name, setName] = useState("Ada Lovelace");
  const [handle, setHandle] = useState("@ada");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">
          <Settings2 className="mr-2 h-4 w-4" />
          Edit profile
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>Update your details. Save when you're done.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sheet-name">Name</Label>
            <Input id="sheet-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sheet-handle">Username</Label>
            <Input id="sheet-handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
        </div>

        <SheetFooter>
          <SheetClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SheetClose>
          <SheetClose asChild>
            <Button>Save changes</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
