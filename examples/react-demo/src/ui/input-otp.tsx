import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { Minus } from "lucide-react";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn InputOTP — same exported API + Tailwind contract — on the `input-otp`
 * library, rendered the Kussetsu way. `input-otp` owns the (hidden) real input,
 * caret, paste, and keyboard behavior + a11y; each visible slot is painted as a
 * refractive <GlassPanel> (off-white "#e6ebf2" glass, control radius). The slot
 * char + fake caret render as crisp white DOM on top of the glass.
 *
 * Unlike shadcn's slot, each slot here is its OWN glass surface (rounded-md) so
 * the refraction reads per-digit; the group just lays them out with a small gap
 * (instead of shadcn's shared-border `first/last:rounded` run, which assumes a
 * single bordered strip).
 */
const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput>
>(function InputOTP({ className, containerClassName, ...props }, ref) {
  return (
    <OTPInput
      ref={ref}
      containerClassName={cn(
        "flex items-center gap-2 has-[:disabled]:opacity-50",
        containerClassName,
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
});

const InputOTPGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(function InputOTPGroup({ className, ...props }, ref) {
  return <div ref={ref} className={cn("flex items-center gap-2", className)} {...props} />;
});

const InputOTPSlot = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & { index: number }
>(function InputOTPSlot({ index, className, ...props }, ref) {
  // input-otp types its context value as {} in some versions; cast to the render shape.
  const inputOTPContext = React.useContext(OTPInputContext) as {
    slots?: { char: string | null; hasFakeCaret: boolean; isActive: boolean }[];
  };
  const slot = inputOTPContext?.slots?.[index];
  const char = slot?.char;
  const hasFakeCaret = slot?.hasFakeCaret;
  const isActive = slot?.isActive;

  return (
    <GlassPanel
      radius={10}
      color="#e6ebf2"
      tint={isActive ? 0.18 : 0.05}
      className={cn(
        "inline-flex overflow-hidden transition-all",
        isActive && "border border-white/60 ring-2 ring-white/40",
        className,
      )}
    >
      <div
        ref={ref}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center bg-transparent text-[0.95rem] font-medium text-white outline-none",
          "[text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
        )}
        {...props}
      >
        {char}
        {hasFakeCaret && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-5 w-px animate-caret-blink bg-white duration-1000" />
          </div>
        )}
      </div>
    </GlassPanel>
  );
});

const InputOTPSeparator = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(function InputOTPSeparator({ ...props }, ref) {
  return (
    <div
      ref={ref}
      role="separator"
      className="text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]"
      {...props}
    >
      <Minus className="h-4 w-4" />
    </div>
  );
});

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
