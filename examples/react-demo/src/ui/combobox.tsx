import { forwardRef, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "../lib/utils";
import { useControlledState } from "../hooks/use-controlled-state";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

/**
 * shadcn's combobox is a recipe — an autocomplete <Popover> + <Command> driven
 * by a <Button> trigger — rather than a registry component with its own exports.
 * This file ships that recipe two ways, both as Kussetsu glass:
 *
 *  1. The composition primitives re-exported (Popover/Command/Button/icons),
 *     so you can hand-assemble a combobox exactly like the shadcn docs.
 *  2. A batteries-included <Combobox> that wires the recipe up for you.
 *
 * No new behavior dep: this is pure styling + glue over ./popover (Radix) and
 * ./command (cmdk), which already own positioning, filtering, keyboard nav and
 * a11y. The glass comes entirely from those composed surfaces — glass: "full".
 */

// ---------------------------------------------------------------------------
// Re-exported composition primitives (the shadcn combobox building blocks)
// ---------------------------------------------------------------------------

export {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Button,
  Check,
  ChevronsUpDown,
};

// ---------------------------------------------------------------------------
// Batteries-included <Combobox>
// ---------------------------------------------------------------------------

export interface ComboboxOption {
  value: string;
  label: ReactNode;
  /** Optional override for what cmdk matches against (defaults to `value`). */
  keywords?: string[];
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  /** Controlled selected value. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Controlled open state of the popover. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: ReactNode;
  searchPlaceholder?: string;
  emptyMessage?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Width of the trigger (and, by default, the popover). */
  width?: number | string;
}

export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  {
    options,
    value,
    defaultValue = "",
    onValueChange,
    open,
    defaultOpen,
    onOpenChange,
    placeholder = "Select option...",
    searchPlaceholder = "Search...",
    emptyMessage = "No option found.",
    disabled,
    className,
    width = 200,
  },
  ref,
) {
  const [isOpen, setIsOpen] = useControlledState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const [selected, setSelected] = useControlledState({
    value,
    defaultValue,
    onChange: onValueChange,
  });

  const widthStyle = typeof width === "number" ? `${width}px` : width;
  const current = options.find((o) => o.value === selected);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="secondary"
          role="combobox"
          aria-expanded={isOpen}
          disabled={disabled}
          style={{ width: widthStyle }}
          className={cn("justify-between font-normal", className)}
        >
          <span className={cn("truncate", !current && "text-white/55")}>
            {current ? current.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" style={{ width: widthStyle }}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={option.keywords}
                  disabled={option.disabled}
                  onSelect={(nextValue: string) => {
                    // cmdk lowercases the matched value; resolve back to the option.
                    const match =
                      options.find((o) => o.value.toLowerCase() === nextValue.toLowerCase())?.value ??
                      nextValue;
                    setSelected(match === selected ? "" : match);
                    setIsOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
