import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../ui/chart";

export const meta = {
  title: "Chart",
  description: "Recharts data-viz with a glass hover tooltip refracting the grass.",
  minH: "min-h-[300px]",
};

const data = [
  { month: "Jan", desktop: 186, mobile: 80 },
  { month: "Feb", desktop: 305, mobile: 200 },
  { month: "Mar", desktop: 237, mobile: 120 },
  { month: "Apr", desktop: 173, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "Jun", desktop: 264, mobile: 140 },
];

const config = {
  desktop: { label: "Desktop", color: "#7c8cff" },
  mobile: { label: "Mobile", color: "#5ce0c4" },
} satisfies ChartConfig;

export default function Demo() {
  return (
    <div className="w-full max-w-md">
      <div className="mb-1 flex items-center justify-between text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        <span className="text-sm font-semibold">Visitors · last 6 months</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: config.desktop.color }} />
            {config.desktop.label}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: config.mobile.color }} />
            {config.mobile.label}
          </span>
        </div>
      </div>
      <ChartContainer config={config} className="h-[200px] w-full">
        <BarChart accessibilityLayer data={data} margin={{ top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          <Bar dataKey="desktop" fill="var(--color-desktop)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="mobile" fill="var(--color-mobile)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
