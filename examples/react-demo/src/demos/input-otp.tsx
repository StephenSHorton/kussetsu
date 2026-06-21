import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "../ui/input-otp";

export const meta = {
  title: "Input OTP",
  description: "One-time-code input — each digit is its own refractive glass slot.",
  minH: "min-h-[150px]",
};

export default function Demo() {
  const [value, setValue] = useState("");
  const complete = value.length === 6;

  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        Enter the 6-digit code
      </span>
      <InputOTP maxLength={6} value={value} onChange={setValue}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
      <span className="flex items-center gap-1.5 text-[0.82rem] text-white/80 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        {complete && <ShieldCheck className="h-4 w-4" />}
        {complete ? "Code complete — verifying…" : "Sent to your phone."}
      </span>
    </div>
  );
}
