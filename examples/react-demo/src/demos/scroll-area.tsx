import { Fragment } from "react";
import { ScrollArea } from "../ui/scroll-area";

export const meta = {
  title: "Scroll Area",
  description: "Custom cross-browser scrollbars on Radix — drag the glass thumb to scroll.",
  minH: "min-h-[260px]",
};

const tags = Array.from({ length: 24 }, (_, i) => `Glass layer ${i + 1}.refract.wgsl`);

export default function Demo() {
  return (
    <ScrollArea className="h-52 w-72 max-w-full">
      <div className="p-4">
        <h4 className="mb-3 text-sm font-semibold leading-none">Shader passes</h4>
        {tags.map((tag, i) => (
          <Fragment key={tag}>
            {i > 0 && <div className="my-2 h-px bg-white/15" />}
            <div className="text-[0.82rem] text-white/90">{tag}</div>
          </Fragment>
        ))}
      </div>
    </ScrollArea>
  );
}
