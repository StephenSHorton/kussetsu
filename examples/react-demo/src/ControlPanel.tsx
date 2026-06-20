/**
 * Live glass control panel — the React port of the showcase's tuning panel. A
 * dark, readable aside of labelled sliders (plus a color swatch and Reset) that
 * drives a <GlassPanel>'s material props in real time. Kept opaque on purpose so
 * the controls stay legible over the wallpaper while the preview refracts it.
 */
export interface Control {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

interface ControlPanelProps {
  title?: string;
  note?: string;
  controls: Control[];
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
  color?: string;
  onColorChange?: (color: string) => void;
  onReset: () => void;
}

export function ControlPanel({
  title = "Glass",
  note,
  controls,
  values,
  onChange,
  color,
  onColorChange,
  onReset,
}: ControlPanelProps) {
  return (
    <aside className="box-border w-full rounded-[14px] border border-[#1d2236] bg-[rgba(10,13,24,0.92)] p-[0.9rem_1rem_1.1rem] text-[0.82rem] shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between">
        <strong className="text-white">{title}</strong>
        <button
          type="button"
          onClick={onReset}
          className="cursor-pointer rounded-lg border border-[#2a3050] bg-[#161b2e] px-2.5 py-1 text-[#c9cde0] transition-colors hover:bg-[#1e2440]"
        >
          Reset
        </button>
      </div>
      {note && <p className="mt-1 mb-0.5 text-[0.72rem] text-[#8b90a8]">{note}</p>}

      {color !== undefined && onColorChange && (
        <label className="mt-2.5 block">
          <span className="mb-0.5 flex justify-between text-[#c9cde0]">
            Color<b className="font-medium text-white tabular-nums">{color}</b>
          </span>
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className="h-7 w-full cursor-pointer rounded-lg border border-[#2a3050] bg-transparent p-0"
          />
        </label>
      )}

      {controls.map((c) => (
        <label key={c.key} className="mt-2.5 block">
          <span className="mb-0.5 flex justify-between text-[#c9cde0]">
            {c.label}
            <b className="font-medium text-white tabular-nums">{values[c.key]}</b>
          </span>
          <input
            type="range"
            min={c.min}
            max={c.max}
            step={c.step}
            value={values[c.key]}
            onChange={(e) => onChange(c.key, Number(e.target.value))}
            className="w-full accent-[#7c8cff]"
          />
        </label>
      ))}
    </aside>
  );
}
