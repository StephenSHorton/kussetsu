import { useState } from "react";
import { UserPen } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export const meta = {
  title: "Dialog",
  description: "A portaled glass dialog that 3D-flips in over the dimmed page.",
  minH: "min-h-[120px]",
};

export default function Demo() {
  const [name, setName] = useState("Ada Lovelace");
  const [email, setEmail] = useState("ada@analytical.engine");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <UserPen className="mr-2 size-4" /> Edit profile
        </Button>
      </DialogTrigger>
      <DialogContent from="bottom">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="dlg-name" className="w-20 justify-end">
              Name
            </Label>
            <Input
              id="dlg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="dlg-email" className="w-20 justify-end">
              Email
            </Label>
            <Input
              id="dlg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button size="sm">Save changes</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
