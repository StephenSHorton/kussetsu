import * as React from "react";
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";
import { getStrictContext } from "../lib/get-strict-context";

/**
 * shadcn Carousel — exact API (CarouselApi/Carousel/CarouselContent/
 * CarouselItem/CarouselPrevious/CarouselNext), Tailwind contract and
 * embla-carousel-react behavior, rendered the Kussetsu way. embla owns the
 * scroll/keyboard/a11y behavior; the prev/next controls paint through a
 * <GlassPanel> pill so the refractive material reads as the interactive surface.
 * The track + slides stay crisp DOM — they're a scrollport, not a glass surface.
 */

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: "horizontal" | "vertical";
  setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const [CarouselProvider, useCarousel] =
  getStrictContext<CarouselContextProps>("Carousel");

const Carousel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CarouselProps
>(function Carousel(
  {
    orientation = "horizontal",
    opts,
    setApi,
    plugins,
    className,
    children,
    ...props
  },
  ref,
) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === "horizontal" ? "x" : "y",
    },
    plugins,
  );
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const onSelect = React.useCallback((api: CarouselApi) => {
    if (!api) return;
    setCanScrollPrev(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const scrollNext = React.useCallback(() => {
    api?.scrollNext();
  }, [api]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext],
  );

  React.useEffect(() => {
    if (!api || !setApi) return;
    setApi(api);
  }, [api, setApi]);

  React.useEffect(() => {
    if (!api) return;
    onSelect(api);
    api.on("reInit", onSelect);
    api.on("select", onSelect);

    return () => {
      api?.off("select", onSelect);
    };
  }, [api, onSelect]);

  return (
    <CarouselProvider
      value={{
        carouselRef,
        api: api,
        opts,
        orientation:
          orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      }}
    >
      <div
        ref={ref}
        onKeyDownCapture={handleKeyDown}
        className={cn("relative", className)}
        role="region"
        aria-roledescription="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselProvider>
  );
});

const CarouselContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CarouselContent({ className, ...props }, ref) {
  const { carouselRef, orientation } = useCarousel();

  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div
        ref={ref}
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className,
        )}
        {...props}
      />
    </div>
  );
});

const CarouselItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CarouselItem({ className, ...props }, ref) {
  const { orientation } = useCarousel();

  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className,
      )}
      {...props}
    />
  );
});

type CarouselControlProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
};

const CarouselPrevious = React.forwardRef<
  HTMLButtonElement,
  CarouselControlProps
>(function CarouselPrevious(
  { className, variant = "outline", size = "icon", ...props },
  ref,
) {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel();

  return (
    <GlassPanel
      radius={999}
      color="#e6ebf2"
      className={cn(
        "absolute inline-flex overflow-hidden border border-white/50",
        orientation === "horizontal"
          ? "-left-12 top-1/2 -translate-y-1/2"
          : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        className,
      )}
    >
      <button
        ref={ref}
        data-variant={variant}
        data-size={size}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-full bg-transparent text-white outline-none",
          "[text-shadow:0_1px_6px_rgba(0,0,0,0.45)] cursor-pointer select-none",
          "transition-transform active:translate-y-px",
          "focus-visible:ring-2 focus-visible:ring-white/60",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
        disabled={!canScrollPrev}
        onClick={scrollPrev}
        {...props}
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="sr-only">Previous slide</span>
      </button>
    </GlassPanel>
  );
});

const CarouselNext = React.forwardRef<HTMLButtonElement, CarouselControlProps>(
  function CarouselNext(
    { className, variant = "outline", size = "icon", ...props },
    ref,
  ) {
    const { orientation, scrollNext, canScrollNext } = useCarousel();

    return (
      <GlassPanel
        radius={999}
        color="#e6ebf2"
        className={cn(
          "absolute inline-flex overflow-hidden border border-white/50",
          orientation === "horizontal"
            ? "-right-12 top-1/2 -translate-y-1/2"
            : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
          className,
        )}
      >
        <button
          ref={ref}
          data-variant={variant}
          data-size={size}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full bg-transparent text-white outline-none",
            "[text-shadow:0_1px_6px_rgba(0,0,0,0.45)] cursor-pointer select-none",
            "transition-transform active:translate-y-px",
            "focus-visible:ring-2 focus-visible:ring-white/60",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          disabled={!canScrollNext}
          onClick={scrollNext}
          {...props}
        >
          <ArrowRight className="h-4 w-4" />
          <span className="sr-only">Next slide</span>
        </button>
      </GlassPanel>
    );
  },
);

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
};
