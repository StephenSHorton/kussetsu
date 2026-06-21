import { Avatar, AvatarImage, AvatarFallback } from "../ui/avatar";

export const meta = {
  title: "Avatar",
  description: "A glass identity disc with image and crisp-text fallback.",
  minH: "min-h-[140px]",
};

export default function Demo() {
  return (
    <div className="flex flex-col gap-5">
      {/* Image, fallback initials, and a stacked group */}
      <div className="flex items-center gap-4">
        <Avatar>
          <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="Ada" />
          <AvatarFallback>AL</AvatarFallback>
        </Avatar>
        <Avatar>
          {/* No src -> Radix shows the fallback */}
          <AvatarFallback>KU</AvatarFallback>
        </Avatar>
        <Avatar className="h-12 w-12">
          <AvatarImage src="https://i.pravatar.cc/96?img=32" alt="Grace" />
          <AvatarFallback>GH</AvatarFallback>
        </Avatar>
      </div>

      {/* Overlapping roster */}
      <div className="flex items-center -space-x-3">
        {[5, 8, 15, 24].map((id, i) => (
          <Avatar key={id} className="h-9 w-9 ring-2 ring-white/30" style={{ zIndex: 4 - i }}>
            <AvatarImage src={`https://i.pravatar.cc/72?img=${id}`} alt="" />
            <AvatarFallback>U{i + 1}</AvatarFallback>
          </Avatar>
        ))}
        <Avatar className="h-9 w-9 ring-2 ring-white/30">
          <AvatarFallback className="text-xs">+9</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}
