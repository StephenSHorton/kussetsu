import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { Toaster, toast } from "../ui/sonner";
import { Button } from "../ui/button";

export const meta = {
  title: "Sonner",
  description: "Glass toasts that stack, swipe to dismiss, and refract the page.",
  minH: "min-h-[150px]",
};

export default function Demo() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.82rem] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
        Trigger a toast — it slides in from the corner as live glass.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast.success("Profile saved", {
              description: "Your changes are live.",
              icon: <CheckCircle2 />,
            })
          }
        >
          Success
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast.error("Upload failed", {
              description: "The file was too large.",
              icon: <XCircle />,
              action: { label: "Retry", onClick: () => {} },
            })
          }
        >
          Error
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast.warning("Storage almost full", {
              description: "92% of your quota used.",
              icon: <TriangleAlert />,
            })
          }
        >
          Warning
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast.info("Update available", {
              description: "v2.4 is ready to install.",
              icon: <Info />,
              action: { label: "Update", onClick: () => {} },
            })
          }
        >
          Info
        </Button>
        <Button
          size="sm"
          onClick={() =>
            toast.promise(new Promise((res) => setTimeout(res, 1800)), {
              loading: "Syncing…",
              success: "All synced",
              error: "Sync failed",
            })
          }
        >
          Promise
        </Button>
      </div>
      <Toaster position="bottom-right" closeButton />
    </div>
  );
}
