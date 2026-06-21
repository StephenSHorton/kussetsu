import { Skeleton } from "../ui/skeleton";

export const meta = {
  title: "Skeleton",
  description: "Frosted glass placeholders that hold a loading layout's shape.",
  minH: "min-h-[150px]",
};

export default function Demo() {
  return (
    <div className="flex flex-col gap-5">
      {/* Loading card: avatar disc beside two text lines */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 !rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-2/5" />
        </div>
      </div>

      {/* Stacked content lines of varied width */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    </div>
  );
}
