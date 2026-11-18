import { sizeLimits } from './catalog';
import { against, RunSection, topOf, type Envelope, type Run, type Span } from './fitEnvelope';
import type { FitReason } from './fitLayout';
import type { ItemKind, KitchenItem } from './types';

/** Source position is in run coordinates, measured from the joint, never in the measured room. */
export interface Module { item: KitchenItem; from: number }
export interface Prepared extends Module { preferred: number; hood?: KitchenItem }
interface Placement { item: KitchenItem; from: number }

const STANDARD = [1200, 900, 800, 600, 500, 450, 400, 300];
const adjustable = new Set<ItemKind>(['base', 'drawer', 'wall', 'glassWall', 'tall', 'shelf', 'pullOut', 'filler']);
export const floorUnit = (item: KitchenItem) => item.elevation <= 100;
export const cooker = (item: KitchenItem) => item.kind === 'hob' || item.kind === 'oven';

/** Keep sink/cooking/refrigeration before optional storage, even when later in the sequence. */
export function value(item: KitchenItem): number {
  if (cooker(item) || item.kind === 'sink') return 1e6;
  if (['integratedFridge', 'fridge', 'ovenTower'].includes(item.kind)) return 1e5;
  if (item.kind === 'dishwasher') return 1e4;
  if (['corner', 'glassWall', 'hood', 'tall', 'bar'].includes(item.kind)) return 1000;
  return item.kind === 'filler' ? 10 : 100;
}

function widths(item: KitchenItem, available: number): number[] {
  const { min, max } = sizeLimits(item, 'width');
  if (!adjustable.has(item.kind)) return [item.width];
  if (item.kind === 'filler') return [Math.min(item.width, Math.floor(available + 1e-6))].filter((w) => w >= min && w <= max);
  return [item.width, ...STANDARD.filter((w) => w < item.width && w >= min && w <= max)];
}

interface State {
  end: number;
  score: number;
  last?: Placement;
  previous?: State;
}

/**
 * Ordered one-dimensional packing. An earlier end with an equal/better score dominates
 * a later end: retain the Pareto frontier, not all combinations or a coarse mm grid.
 * Width choices and omission are considered *before* deciding an appliance cannot fit.
 */
export function packRow(
  env: Envelope, run: Run, modules: Prepared[], bounds: Span, reasons: Map<string, FitReason>,
): Placement[] {
  const section = new RunSection(run, env);
  const cache = new Map<string, ReturnType<RunSection['free']>>();
  const available = (item: KitchenItem) => {
    const key = `${item.depth}:${item.elevation}:${topOf(item)}`;
    if (!cache.has(key)) cache.set(key, section.free(bounds, 0, item.depth, item.elevation, topOf(item)));
    return cache.get(key)!;
  };
  const ordered = [...modules].sort((a, b) => a.from - b.from);
  const contains = (s: Span, from: number, width: number) => from >= s.from - 1e-6 && from + width <= s.to + 1e-6;
  let end = bounds.from;
  const intact = ordered.every(({ item, preferred, hood }) => {
    if (preferred < end - 1e-6 || !available(item).spans.some((s) => contains(s, preferred, item.width))) return false;
    if (hood && topOf(hood) <= env.room.height && !available(hood).spans.some((s) => contains(s, preferred, hood.width))) return false;
    end = preferred + item.width;
    return true;
  });
  if (intact) return ordered.map(({ item, preferred }) => ({ item: against(run, item, preferred), from: preferred }));

  let frontier: State[] = [{ end: bounds.from, score: 0 }];
  for (const module of ordered) {
    const { item } = module;
    const { spans, reason } = available(item);
    const hood = module.hood;
    const hoodSpans = hood && topOf(hood) <= env.room.height
      ? available(hood).spans : [];
    reasons.set(item.id, reason);
    const next = new Map<number, State>();
    const consider = (s: State) => {
      const key = Math.round(s.end * 1e5);
      if (!next.has(key) || next.get(key)!.score < s.score) next.set(key, s);
    };
    for (const state of frontier) {
      consider(state); // omit this module, preserving space for later units
      for (const span of spans) {
        const start = Math.max(state.end, span.from);
        for (const width of widths(item, span.to - start)) {
          if (start + width > span.to + 1e-6) continue;
          const preferred = Math.max(start, Math.min(module.preferred, span.to - width));
          // A sink can go below a window, but prefer a spot for a cooker where
          // its matching hood can go too. Don't orphan it if shifting the pair suffices.
          const candidates = new Set([start, preferred]);
          for (const s of hoodSpans) {
            const from = Math.max(start, s.from);
            if (from + width <= Math.min(s.to, span.to) + 1e-6) candidates.add(from);
          }
          for (const from of candidates) {
            const end = from + width;
            const hoodBonus = hoodSpans.some((s) => from >= s.from - 1e-6 && end <= s.to + 1e-6) ? value(hood!) : 0;
            const score = state.score + value(item) + hoodBonus + 4 * width / item.width - 0.0001 * Math.abs(from - module.preferred);
            const key = Math.round(end * 1e5);
            if ((next.get(key)?.score ?? -Infinity) >= score) continue;
            const placed = against(run, { ...item, width }, from);
            consider({ end, score, previous: state, last: { item: placed, from } });
          }
        }
      }
    }
    frontier = [];
    let best = -Infinity;
    for (const s of [...next.values()].sort((a, b) => a.end - b.end))
      if (s.score > best + 1e-8) { best = s.score; frontier.push(s); }
  }
  const result: Placement[] = [];
  let state: State | undefined = frontier.at(-1);
  while (state?.last) { result.push(state.last); state = state.previous; }
  return result.reverse();
}
