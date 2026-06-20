import { useState } from "react";
import { GlassScene, GlassThemeContext } from "@kussetsu/react";
import { ControlPanel, type Control } from "./ControlPanel";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Checkbox } from "./ui/checkbox";
import { Slider } from "./ui/slider";
import { Progress } from "./ui/progress";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";

/**
 * One section per group: a brief title + description on the dark page, then a
 * contained grass "card" holding only the components (which refract that card's
 * grass). The title/description live OUTSIDE the grass.
 */
// Resolve the wallpaper under the deploy base path (root in dev, /kussetsu/ on
// GitHub Pages) so it loads in both — a CSS url("/grass.jpg") would 404 on Pages.
const GRASS_BG = `url(${import.meta.env.BASE_URL}grass.jpg)`;

function Stage({
  title,
  description,
  children,
  minH = "min-h-[110px]",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  /** Min-height floor on the grass card so it survives capture (see below). */
  minH?: string;
}) {
  // The title/description sit above the grass, on the dark page. They stay in
  // normal flow and use LITERAL colors (not Tailwind's `text-white/55`, which
  // compiles to color-mix(in oklab,…) — html2canvas can't parse that and the
  // whole capture throws). Being captured-but-in-flow, they bake harmlessly onto
  // the dark gap above the card (nothing refracts there) without shifting it.
  //
  // The grass card needs (1) a literal rgba border — same oklab reason — and
  // (2) a min-height floor: html2canvas drops the no-capture component content,
  // which would otherwise collapse the card to 0 and clip the grass to nothing
  // (clear glass would then refract black). The floor must clear the components.
  return (
    <section className="flex w-full flex-col gap-3">
      <div>
        <h2 className="m-0 text-sm font-bold uppercase tracking-[0.14em] text-white">{title}</h2>
        <p className="mt-1 text-[0.82rem] text-[rgba(255,255,255,0.55)]">{description}</p>
      </div>
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.12)] shadow-[0_24px_70px_rgba(0,0,0,0.55)] ${minH}`}
      >
        <div className="ks-stage-bg" style={{ backgroundImage: GRASS_BG }} />
        <div data-kussetsu-no-capture className="relative z-10 flex flex-col gap-4 p-6">
          {children}
        </div>
      </div>
    </section>
  );
}

const GLASS_DEFAULTS = {
  radius: 20,
  blur: 0,
  pageBlur: 3, // visible wallpaper blur (CSS) — NOT a glass material, ignored by the theme
  bgBlur: 3, // depth-of-field blur of the backdrop seen THROUGH the glass (shader)
  refraction: 0.05,
  dispersion: 0.006,
  rim: 0.05,
  tint: 0.04,
  specular: 1,
};
const GLASS_CONTROLS: Control[] = [
  { key: "radius", label: "Radius", min: 0, max: 60, step: 1 },
  { key: "blur", label: "Frost", min: 0, max: 20, step: 0.5 },
  { key: "pageBlur", label: "BG blur", min: 0, max: 20, step: 0.5 },
  { key: "bgBlur", label: "Glass BG blur", min: 0, max: 20, step: 0.5 },
  { key: "refraction", label: "Refraction", min: 0, max: 0.15, step: 0.005 },
  { key: "dispersion", label: "Dispersion", min: 0, max: 0.03, step: 0.001 },
  { key: "rim", label: "Rim width", min: 0.01, max: 0.2, step: 0.005 },
  { key: "tint", label: "Tint", min: 0, max: 0.4, step: 0.01 },
  { key: "specular", label: "Specular", min: 0, max: 2, step: 0.05 },
];

export function App() {
  const [name, setName] = useState("Ada Lovelace");
  const [glass, setGlass] = useState<Record<string, number>>({ ...GLASS_DEFAULTS });
  const resetGlass = () => setGlass({ ...GLASS_DEFAULTS });

  return (
    <div
      className="min-h-screen bg-[#05060c]"
      style={{ "--ks-bg-blur": `${glass.pageBlur}px` } as React.CSSProperties}
    >
      {/* Page scene: one capture, with a grass box behind each stage card. */}
      <GlassScene style={{ position: "relative" }}>
        {/* Every <GlassPanel> below inherits these material values from the
            control panel — radius, frost, refraction, etc. — live. */}
        <GlassThemeContext.Provider value={glass}>
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-14">
          {/* Captured in flow (literal colors, no oklab) so it doesn't shift the
              grass cards below it during capture — see Stage. */}
          <header className="pb-2 text-center">
            <h1 className="m-0 text-[clamp(1.8rem,4vw,2.6rem)] font-bold tracking-tight text-white">
              Kussetsu UI · React
            </h1>
            <p className="mt-2 text-[rgba(255,255,255,0.7)]">
              shadcn components, rendered as live glass on <code>@kussetsu/react</code>.
            </p>
          </header>

          <Stage title="Buttons" description="Emphasis variants — every one real, refractive glass.">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Delete</Button>
            </div>
          </Stage>

          <Stage title="Badges" description="Saturated, translucent chips.">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </Stage>

          <Stage title="Switches" description="Radix behavior; the track tints when on." minH="min-h-[120px]">
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                <Switch defaultChecked /> Notifications
              </label>
              <label className="flex items-center gap-3 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                <Switch /> Auto-sync
              </label>
            </div>
          </Stage>

          <Stage title="Input" description="Type straight into glass.">
            <div className="w-80 max-w-full">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
          </Stage>

          <Stage title="Card" description="Composed glass surfaces." minH="min-h-[250px]">
            <Card className="w-96 max-w-full">
              <CardHeader>
                <CardTitle>Upgrade to Pro</CardTitle>
                <CardDescription>Unlimited glass components for React.</CardDescription>
              </CardHeader>
              <CardContent>$8 / month, billed annually. Cancel anytime.</CardContent>
              <CardFooter>
                <Button size="sm">Upgrade</Button>
                <Button size="sm" variant="ghost">
                  Maybe later
                </Button>
              </CardFooter>
            </Card>
          </Stage>

          <Stage title="Dialog" description="A portaled glass dialog over the dimmed page.">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Edit profile</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit profile</DialogTitle>
                  <DialogDescription>Make changes to your profile. Click save when you're done.</DialogDescription>
                </DialogHeader>
                <div className="mt-4 flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-white/85">Display name</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
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
          </Stage>

          <Stage title="Tabs" description="Switch between glass panels." minH="min-h-[150px]">
            <Tabs defaultValue="account" className="w-96 max-w-full">
              <TabsList>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="password">Password</TabsTrigger>
              </TabsList>
              <TabsContent value="account" className="pt-3 text-white/85">Manage your account here.</TabsContent>
              <TabsContent value="password" className="pt-3 text-white/85">Change your password here.</TabsContent>
            </Tabs>
          </Stage>

          <Stage title="Select & Popover" description="Floating glass overlays, motion-animated.">
            <div className="flex flex-wrap items-center gap-4">
              <Select>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Pick a fruit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apple">Apple</SelectItem>
                  <SelectItem value="banana">Banana</SelectItem>
                  <SelectItem value="cherry">Cherry</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary">Open popover</Button>
                </PopoverTrigger>
                <PopoverContent>A glass popover — Radix-positioned, motion-animated.</PopoverContent>
              </Popover>
            </div>
          </Stage>

          <Stage title="Checkbox · Radio · Slider · Progress" description="Form controls, all glass." minH="min-h-[210px]">
            <div className="flex flex-col gap-4 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
              <label className="flex items-center gap-2.5">
                <Checkbox defaultChecked /> Accept terms
              </label>
              <RadioGroup defaultValue="a" className="flex gap-5">
                <label className="flex items-center gap-2">
                  <RadioGroupItem value="a" /> Option A
                </label>
                <label className="flex items-center gap-2">
                  <RadioGroupItem value="b" /> Option B
                </label>
              </RadioGroup>
              <div className="w-80 max-w-full pt-1">
                <Slider defaultValue={[40]} max={100} />
              </div>
              <div className="w-80 max-w-full">
                <Progress value={62} />
              </div>
            </div>
          </Stage>

          <Stage title="Accordion · Avatar" description="Disclosure and identity." minH="min-h-[220px]">
            <Accordion type="single" collapsible className="w-96 max-w-full">
              <AccordionItem value="1">
                <AccordionTrigger>Is every surface glass?</AccordionTrigger>
                <AccordionContent>Yes — each refracts the grass behind its card.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="2">
                <AccordionTrigger>Is it accessible?</AccordionTrigger>
                <AccordionContent>Radix owns keyboard, focus, and ARIA.</AccordionContent>
              </AccordionItem>
            </Accordion>
            <Avatar>
              <AvatarFallback>KU</AvatarFallback>
            </Avatar>
          </Stage>
        </div>
        </GlassThemeContext.Provider>
      </GlassScene>

      {/* Pinned control panel — retunes every component's glass live via the
          GlassTheme provider wrapping the gallery. Follows the scroll. */}
      <div className="fixed right-5 top-5 z-30 hidden max-h-[calc(100vh-2.5rem)] w-[230px] flex-col gap-3 overflow-y-auto xl:flex">
        <ControlPanel
          title="Glass"
          note="Tunes every component →"
          controls={GLASS_CONTROLS}
          values={glass}
          onChange={(k, v) => setGlass((prev) => ({ ...prev, [k]: v }))}
          onReset={resetGlass}
        />
      </div>
    </div>
  );
}
