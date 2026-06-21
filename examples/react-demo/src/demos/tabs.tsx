import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Layers, Sparkles, Sliders } from "lucide-react";

export const meta = {
  title: "Tabs",
  description: "Radix-driven tabs — the active trigger lights up as its own brighter glass chip.",
  minH: "min-h-[170px]",
};

const tabs = [
  {
    value: "material",
    label: "Material",
    icon: Layers,
    body: "Each panel is real WGSL glass that refracts the grass behind its card in real time.",
  },
  {
    value: "paint",
    label: "Paint",
    icon: Sparkles,
    body: "The DOM stays authoritative — the shader is opt-in refractive paint behind real elements.",
  },
  {
    value: "tune",
    label: "Tune",
    icon: Sliders,
    body: "Drag the Glass panel and every component, including this active chip, retunes live.",
  },
];

export default function Demo() {
  return (
    <Tabs defaultValue="material" className="w-96 max-w-full">
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            <t.icon className="mr-1.5 h-4 w-4" />
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.body}
        </TabsContent>
      ))}
    </Tabs>
  );
}
