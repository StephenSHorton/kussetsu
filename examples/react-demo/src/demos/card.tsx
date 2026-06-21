import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Star, GitFork } from "lucide-react";

export const meta = {
  title: "Card",
  description: "Composed glass surface stacking header, content, and footer actions.",
  minH: "min-h-[260px]",
};

export default function Demo() {
  return (
    <Card className="w-96 max-w-full">
      <CardHeader className="flex-row items-center gap-3">
        <Avatar>
          <AvatarFallback>KU</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <CardTitle>kussetsu/core</CardTitle>
          <CardDescription>WGSL glass, rendered as paint.</CardDescription>
        </div>
        <Badge variant="secondary" className="ml-auto">
          v0.1
        </Badge>
      </CardHeader>
      <CardContent>Refractive UI surfaces that sit behind real DOM elements.</CardContent>
      <CardFooter className="justify-between">
        <div className="flex items-center gap-4 text-sm text-white/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          <span className="flex items-center gap-1.5">
            <Star className="h-4 w-4" /> 1.2k
          </span>
          <span className="flex items-center gap-1.5">
            <GitFork className="h-4 w-4" /> 84
          </span>
        </div>
        <Button size="sm">Star</Button>
      </CardFooter>
    </Card>
  );
}
