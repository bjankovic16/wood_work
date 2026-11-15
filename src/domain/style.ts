/** Finishes used to show the kitchen in 3D. They do not change any cut sizes. */

export type FrontFinish = 'white' | 'cream' | 'grey' | 'sage' | 'navy' | 'anthracite' | 'oak' | 'walnut';
export type WorktopFinish = 'stone' | 'oak' | 'concrete' | 'black';
export type HandleStyle = 'steel' | 'black' | 'brass' | 'none';

export interface KitchenStyle {
  front: FrontFinish;
  worktop: WorktopFinish;
  handles: HandleStyle;
}

/** How a finish looks; its name comes with the interface language. */
export interface Finish {
  color: string;
  /** Drawn with a wood grain. */
  wood?: boolean;
}

export const FRONT_FINISHES: Record<FrontFinish, Finish> = {
  white: { color: '#f2f1ec' },
  cream: { color: '#e9e2d0' },
  grey: { color: '#cfd0cc' },
  sage: { color: '#a3b49b' },
  navy: { color: '#2e3b52' },
  anthracite: { color: '#3b3c3e' },
  oak: { color: '#c69b6d', wood: true },
  walnut: { color: '#6e4b34', wood: true },
};

export const WORKTOP_FINISHES: Record<WorktopFinish, Finish> = {
  stone: { color: '#ecebe6' },
  oak: { color: '#b98955', wood: true },
  concrete: { color: '#9d9c97' },
  black: { color: '#262628' },
};

export const HANDLE_STYLES: Record<HandleStyle, { color: string | null; metal: boolean }> = {
  steel: { color: '#b8bcc2', metal: true },
  black: { color: '#1c1c1e', metal: false },
  brass: { color: '#b8955a', metal: true },
  none: { color: null, metal: false },
};

export const DEFAULT_STYLE: KitchenStyle = { front: 'white', worktop: 'stone', handles: 'steel' };

export function parseStyle(raw: unknown): KitchenStyle {
  const v = (raw ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, options: Record<T, unknown>, fallback: T): T =>
    typeof value === 'string' && value in options ? (value as T) : fallback;
  return {
    front: pick(v.front, FRONT_FINISHES, DEFAULT_STYLE.front),
    worktop: pick(v.worktop, WORKTOP_FINISHES, DEFAULT_STYLE.worktop),
    handles: pick(v.handles, HANDLE_STYLES, DEFAULT_STYLE.handles),
  };
}
