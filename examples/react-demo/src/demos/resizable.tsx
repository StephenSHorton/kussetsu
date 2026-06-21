import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "../ui/resizable";

export const meta = {
  title: "Resizable",
  description: "Drag the glass grip handles to repartition the panels.",
  minH: "min-h-[220px]",
};

const cell =
  "flex h-full items-center justify-center p-3 text-center text-sm font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]";

export default function Demo() {
  return (
    <div className="h-44 w-full overflow-hidden rounded-xl border border-white/30">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={35} minSize={20}>
          <span className={cell}>Sidebar</span>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={65}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={60}>
              <span className={cell}>Content</span>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40}>
              <span className={cell}>Console</span>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
