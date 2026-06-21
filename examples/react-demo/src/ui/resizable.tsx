import * as React from "react";
import { GripVerticalIcon } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";
import { GlassPanel } from "@kussetsu/react";
import { cn } from "../lib/utils";

/**
 * shadcn Resizable — exact API (ResizablePanelGroup / ResizablePanel /
 * ResizableHandle) + Tailwind contract on "react-resizable-panels", rendered the
 * Kussetsu way. The library owns the drag behavior, keyboard a11y, and
 * persistence; Kussetsu owns the paint.
 *
 * Glass verdict: PARTIAL. A PanelGroup is a flex layout primitive and a Panel is
 * a content container — neither has a surface that should read as glass (tinting
 * every panel would just fog whatever the user drops inside). The meaningful
 * surface is the resize handle: the always-visible drag rail is a hairline so it
 * stays a thin tinted bar, and the optional `withHandle` grip nub — the one bit
 * you actually grab — is a real <GlassPanel> with a crisp grip icon on top.
 */

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        // The hairline rail: a thin white wash that brightens on focus. The
        // pseudo-element widens the hit area without thickening the visible line.
        "relative flex w-px items-center justify-center bg-white/20 outline-none transition-colors",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        "focus-visible:bg-white/50 focus-visible:ring-1 focus-visible:ring-white/60",
        "data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full",
        "data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2",
        "[&[data-panel-group-direction=vertical]>div]:rotate-90",
        className,
      )}
      {...props}
    >
      {withHandle && (
        // The grip nub — the surface you actually grab — is real refractive glass
        // with the icon rendered crisp on top.
        <GlassPanel
          radius={10}
          color="#e6ebf2"
          className="z-10 flex h-5 w-3 items-center justify-center overflow-hidden border border-white/30"
        >
          <span className="grid h-5 w-3 place-items-center text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">
            <GripVerticalIcon className="size-2.5" />
          </span>
        </GlassPanel>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
