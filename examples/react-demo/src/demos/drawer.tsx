import { useState } from "react";
import { Settings2 } from "lucide-react";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "../ui/drawer";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";

export const meta = {
  title: "Drawer",
  description: "A swipe-dismissable bottom sheet that paints as glass over the dimmed page.",
  minH: "min-h-[120px]",
};

export default function Demo() {
  const [goal, setGoal] = useState("350");

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="secondary">
          <Settings2 className="mr-2 size-4" /> Set daily goal
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Daily goal</DrawerTitle>
            <DrawerDescription>Set the calorie target you want to hit each day.</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4">
            <Label htmlFor="goal">Calories</Label>
            <Input id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="numeric" />
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button size="sm">Save</Button>
            </DrawerClose>
            <DrawerClose asChild>
              <Button size="sm" variant="ghost">
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
