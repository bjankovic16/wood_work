import { BASE_HEIGHT, PLINTH_HEIGHT } from '../domain/catalog';
import type { ConstructionSettings, KitchenItem } from '../domain/types';
import type { ResolvedConfig } from './config';

export type FrontKind = 'door' | 'drawer' | 'panel';

/** A door, drawer front or fixed panel, seen from the front of the unit. */
export interface FrontRect {
  kind: FrontKind;
  /** From the left edge of the unit. */
  x: number;
  /** From the underside of the unit, upwards. */
  y: number;
  w: number;
  h: number;
  /** Doors: the side the hinges are on. */
  hinge?: 'left' | 'right';
}

/** Built-in ovens are 595 mm tall and go into a 600 mm niche. */
export const OVEN_NICHE_HEIGHT = 600;
/** Tall units above this height get a second row of doors, split at worktop level. */
export const TALL_SPLIT_FROM = 1400;

export const round1 = (value: number): number => Math.round(value * 10) / 10;

function roundFront(front: FrontRect): FrontRect {
  return { ...front, x: round1(front.x), y: round1(front.y), w: round1(front.w), h: round1(front.h) };
}

/** The area the fronts share and the gaps around them. */
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Gap left between the fronts and the frame's edge. */
  margin: number;
}

/**
 * Full-overlay fronts cover the whole unit and stay half a gap inside its
 * outline, so fronts of neighbouring units are a full gap apart. Inset
 * fronts fill the opening between the carcass panels, a full gap inside it.
 */
function frameFor(item: KitchenItem, config: ResolvedConfig, gap: number): Frame {
  if (config.doorType === 'inset') {
    const t = config.carcass.thickness;
    return { x: t, y: t, w: item.width - 2 * t, h: item.height - 2 * t, margin: gap };
  }
  return { x: 0, y: 0, w: item.width, h: item.height, margin: gap / 2 };
}

/** `count` doors side by side between `y` and `y + h`. */
function doorRow(frame: Frame, y: number, h: number, count: number, gap: number, hinge: 'left' | 'right'): FrontRect[] {
  const w = (frame.w - 2 * frame.margin - (count - 1) * gap) / count;
  return Array.from({ length: count }, (_, i) => ({
    kind: 'door' as const,
    x: frame.x + frame.margin + i * (w + gap),
    y,
    w,
    h,
    hinge: count === 1 ? hinge : i < count / 2 ? ('left' as const) : ('right' as const),
  }));
}

/** Drawer fronts stacked from the bottom of the frame, with the given heights (bottom first). */
function drawerStack(frame: Frame, heights: number[], gap: number): FrontRect[] {
  let y = frame.y + frame.margin;
  return heights.map((h) => {
    const front = { kind: 'drawer' as const, x: frame.x + frame.margin, y, w: frame.w - 2 * frame.margin, h };
    y += h + gap;
    return front;
  });
}

/** Doors, drawer fronts and panels of a unit. Drawers go above doors. */
export function frontLayout(item: KitchenItem, config: ResolvedConfig, settings: ConstructionSettings): FrontRect[] {
  const g = settings.frontGap;
  const H = item.height;
  let fronts: FrontRect[] = [];

  switch (item.kind) {
    case 'base':
    case 'wall':
    case 'sink':
    case 'drawer':
    case 'tall': {
      const frame = frameFor(item, config, g);
      const inner = frame.h - 2 * frame.margin;
      const { doors, drawers } = config;
      if (drawers > 0 && doors === 0) {
        if (config.drawerLayout === 'shallowTop' && drawers > 1) {
          const top = settings.drawerFrontHeight;
          const rest = (inner - (drawers - 1) * g - top) / (drawers - 1);
          fronts = drawerStack(frame, [...Array<number>(drawers - 1).fill(rest), top], g);
        } else {
          fronts = drawerStack(frame, Array<number>(drawers).fill((inner - (drawers - 1) * g) / drawers), g);
        }
        break;
      }
      const drawerHeight = settings.drawerFrontHeight;
      const drawerSpace = drawers * (drawerHeight + g);
      for (let i = 0; i < drawers; i++) {
        fronts.push({
          kind: 'drawer',
          x: frame.x + frame.margin,
          y: frame.y + frame.h - frame.margin - drawerHeight - i * (drawerHeight + g),
          w: frame.w - 2 * frame.margin,
          h: drawerHeight,
        });
      }
      if (doors === 0) break;
      const bottom = frame.y + frame.margin;
      if (item.kind === 'tall' && drawers === 0 && H > TALL_SPLIT_FROM) {
        // Two rows of doors with a fixed shelf behind the split, at worktop height.
        if (config.doorType === 'inset') {
          const t = config.carcass.thickness;
          fronts.push(...doorRow(frame, t + g, BASE_HEIGHT - 2 * t - 2 * g, doors, g, config.hinge));
          fronts.push(...doorRow(frame, BASE_HEIGHT + g, H - t - BASE_HEIGHT - 2 * g, doors, g, config.hinge));
        } else {
          fronts.push(...doorRow(frame, g / 2, BASE_HEIGHT - g, doors, g, config.hinge));
          fronts.push(...doorRow(frame, BASE_HEIGHT + g / 2, H - BASE_HEIGHT - g, doors, g, config.hinge));
        }
      } else {
        fronts.push(...doorRow(frame, bottom, inner - drawerSpace, doors, g, config.hinge));
      }
      break;
    }
    case 'oven': {
      // The oven fills the top of the unit; a drawer or a fixed panel closes the space below it.
      const frame = frameFor(item, config, g);
      const top = H - OVEN_NICHE_HEIGHT - (config.doorType === 'inset' ? config.carcass.thickness : 0);
      const h = top - frame.y - 2 * frame.margin;
      if (h > 0) {
        fronts.push({ kind: config.drawers > 0 ? 'drawer' : 'panel', x: frame.x + frame.margin, y: frame.y + frame.margin, w: frame.w - 2 * frame.margin, h });
      }
      break;
    }
    case 'dishwasher':
      // Integrated dishwasher: the front lines up with the doors of the base units.
      fronts.push({ kind: 'panel', x: g / 2, y: PLINTH_HEIGHT + g / 2, w: item.width - g, h: H - PLINTH_HEIGHT - g });
      break;
    case 'corner': {
      // Two doors hinged together, one on each arm (shown unfolded).
      const [a, b] = cornerDoorWidths(item, config, settings);
      fronts = [
        { kind: 'door', x: g / 2, y: g / 2, w: b, h: H - g, hinge: 'left' },
        { kind: 'door', x: g / 2 + b + g, y: g / 2, w: a, h: H - g, hinge: 'right' },
      ];
      break;
    }
    case 'filler':
      fronts.push({ kind: 'panel', x: 0, y: 0, w: item.width, h: H });
      break;
    default:
      break;
  }
  return fronts.map(roundFront);
}

/**
 * Doors of an L-shaped corner unit: each covers the open front of its arm.
 * The door on wall B is narrower by one front thickness, because the door on
 * wall A covers its edge where the two meet.
 */
export function cornerDoorWidths(item: KitchenItem, config: ResolvedConfig, settings: ConstructionSettings): [number, number] {
  const g = settings.frontGap;
  const a = item.width - item.depth - g;
  const b = (item.width2 ?? item.width) - item.depth - g - config.front.thickness;
  return [round1(a), round1(b)];
}
