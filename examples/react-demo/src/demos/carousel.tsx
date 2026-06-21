import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "../ui/carousel";

export const meta = {
  title: "Carousel",
  description: "An embla scrollport with glass prev/next controls.",
  minH: "min-h-[200px]",
};

const SLIDES = ["1", "2", "3", "4", "5"];

export default function Demo() {
  return (
    <div className="px-12">
      <Carousel opts={{ align: "start" }} className="w-56 max-w-full">
        <CarouselContent>
          {SLIDES.map((n) => (
            <CarouselItem key={n}>
              <div className="grid aspect-square place-items-center rounded-xl border border-white/30 bg-white/10 text-4xl font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                {n}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
}
