import { Minus, Plus } from 'lucide-react';
import { TooltipButton } from '../ui';

interface StepperProps {
  label: string;
  /** Names of the − and + buttons, e.g. "Fewer doors" and "More doors". */
  fewerLabel: string;
  moreLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/** A small count control: − value +. */
export function Stepper({ label, fewerLabel, moreLabel, value, min, max, onChange }: StepperProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[104px] shrink-0 text-xs text-zinc-500">{label}</span>
      <div className="flex h-11 flex-1 items-center overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xs lg:h-8">
        <TooltipButton
          tooltip={fewerLabel}
          aria-label={fewerLabel}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="h-11 w-11 lg:h-8 lg:w-10"
        >
          <Minus className="size-4" />
        </TooltipButton>
        <output aria-label={label} className="flex-1 text-center text-sm font-medium tabular-nums text-zinc-900">
          {value}
        </output>
        <TooltipButton
          tooltip={moreLabel}
          aria-label={moreLabel}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="h-11 w-11 lg:h-8 lg:w-10"
        >
          <Plus className="size-4" />
        </TooltipButton>
      </div>
    </div>
  );
}
