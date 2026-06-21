import { Kbd, KbdGroup } from "../ui/kbd";

export const meta = {
  title: "Kbd",
  description: "Keyboard keycaps — each <kbd> a tiny refractive glass key.",
  minH: "min-h-[140px]",
};

export default function Demo() {
  return (
    <div className="flex flex-col gap-4 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <span className="flex items-center gap-2">
          Save
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>S</Kbd>
          </KbdGroup>
        </span>
        <span className="flex items-center gap-2">
          Command palette
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </span>
        <span className="flex items-center gap-2">
          Quit
          <KbdGroup>
            <Kbd>⌃</Kbd>
            <Kbd>Q</Kbd>
          </KbdGroup>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Kbd>Esc</Kbd>
        <Kbd>Tab</Kbd>
        <Kbd>⏎</Kbd>
        <Kbd>⌫</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>⌥</Kbd>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
      </div>
    </div>
  );
}
