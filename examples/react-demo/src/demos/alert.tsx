import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "../ui/alert";

export const meta = {
  title: "Alert",
  description: "An inline glass callout with an optional icon — default and destructive.",
  minH: "min-h-[180px]",
};

export default function Demo() {
  return (
    <div className="flex w-96 max-w-full flex-col gap-3">
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Changes saved</AlertTitle>
        <AlertDescription>Your profile was updated successfully.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Payment failed</AlertTitle>
        <AlertDescription>Your card was declined. Update your billing details.</AlertDescription>
      </Alert>
    </div>
  );
}
