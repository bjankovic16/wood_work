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
      <div className="flex min-w-0 flex-1 items-center rounded-md border border-zinc-200 bg-white shadow-xs lg:h-8">
        <TooltipButton
          tooltip={fewerLabel}
          aria-label={fewerLabel}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="h-11 w-11 lg:h-8 lg:w-10"
        >
          <Minus className="size-4" />
        </TooltipButton>
        <span role="spinbutton" aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
          className="flex-1 rounded text-center text-sm font-medium tabular-nums text-zinc-900 focus-visible:outline-2 focus-visible:outline-studio-accent"
          onKeyDown={(e) => {
            const next = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? Math.min(value + 1, max)
              : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? Math.max(value - 1, min)
              : e.key === 'Home' ? min : e.key === 'End' ? max : null;
            if (next === null) return;
            e.preventDefault(); e.stopPropagation();
            if (next !== value) onChange(next);
          }}>
          {value}
        </span>
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
