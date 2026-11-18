import { createItem, type LabelPrefixes } from './catalog';
import { aabbSize, rotationForWall } from './geometry';
import type { ItemKind, KitchenItem, Room, Wall } from './types';
import { canPlaceItem, findFreeSpot } from './placement';

export type LayoutId = 'straight' | 'l-shape' | 'u-shape';

/** The ready-made layouts, in the order they are offered; names and descriptions come with the language. */
export const LAYOUTS: Array<{ id: LayoutId }> = [{ id: 'straight' }, { id: 'l-shape' }, { id: 'u-shape' }];

const BASE_WIDTHS = [900, 800, 600, 500, 450, 400, 300];
const WALL_WIDTHS = [800, 600, 500, 400, 300];
/** Leftover space at least this wide gets a filler panel; anything narrower stays open. */
const MIN_FILLER = 10;
const CORNER = 900;
/** Space kept free at the open end of a side run, e.g. for a door. */
const RUN_END_CLEARANCE = 600;

interface Piece {
  kind: ItemKind;
  width: number;
}

/** Standard widths filling `length` greedily, largest first; the rest becomes a filler panel. */
export function fillWidths(length: number, widths = BASE_WIDTHS): number[] {
  const result: number[] = [];
  let left = length;
  for (const width of widths) {
    while (left >= width) {
      result.push(width);
      left -= width;
    }
  }
  return result;
}

class Builder {
  readonly items: KitchenItem[] = [];
  constructor(
    private readonly room: Room,
    private readonly prefixes?: LabelPrefixes,
  ) {}

  /** Places one unit against `wall`, `along` mm from the wall's start (left or top end). */
  place(kind: ItemKind, wall: Wall, along: number, width: number, extra: Partial<KitchenItem> = {}): KitchenItem {
    const rotation = rotationForWall(wall);
    const item = createItem(kind, this.items, { width, rotation, ...extra }, this.prefixes);
    const { w, h } = aabbSize(item);
    const x = wall === 'left' ? 0 : wall === 'right' ? this.room.width - w : along;
    const y = wall === 'top' ? 0 : wall === 'bottom' ? this.room.depth - h : along;
    const placed = { ...item, x, y };
    this.items.push(placed);
    return placed;
  }

  /** Lays pieces end to end from `start`; returns where the run ends. */
  run(wall: Wall, start: number, pieces: Piece[]): number {
    let along = start;
    for (const piece of pieces) {
      this.place(piece.kind, wall, along, piece.width);
      along += piece.width;
    }
    return along;
  }

  /** Base units between `start` and `end`: the given ones first, then standard cabinets and a filler. */
  baseRun(wall: Wall, start: number, end: number, required: Piece[]): Array<{ kind: ItemKind; from: number; to: number }> {
    const pieces = fitRequired(required, end - start);
    const used = pieces.reduce((sum, p) => sum + p.width, 0);
    const fill = fillWidths(end - start - used).map((width) => ({ kind: 'base' as const, width }));
    const filled = [...pieces, ...fill];
    const rest = end - start - filled.reduce((sum, p) => sum + p.width, 0);
    if (rest >= MIN_FILLER) filled.push({ kind: 'filler', width: rest });
    const spans: Array<{ kind: ItemKind; from: number; to: number }> = [];
    let along = start;
    for (const piece of filled) {
      this.place(piece.kind, wall, along, piece.width);
      spans.push({ kind: piece.kind, from: along, to: along + piece.width });
      along += piece.width;
    }
    return spans;
  }

  /** Wall cabinets over a stretch of wall, leaving the hob free for an extractor hood. */
  wallUnits(wall: Wall, start: number, end: number, keepFree: Array<{ from: number; to: number }> = []) {
    const segments: Array<[number, number]> = [];
    let from = start;
    for (const gap of [...keepFree].sort((a, b) => a.from - b.from)) {
      if (gap.from > from) segments.push([from, Math.min(gap.from, end)]);
      from = Math.max(from, gap.to);
    }
    if (from < end) segments.push([from, end]);
    for (const [a, b] of segments) {
      let along = a;
      const widths = fillWidths(b - a, WALL_WIDTHS);
      const rest = b - a - widths.reduce((sum, width) => sum + width, 0);
      if (widths.length) widths[widths.length - 1] += rest;
      else if (rest >= 150) widths.push(rest);
      for (const width of widths) {
        this.place('wall', wall, along, width);
        along += width;
      }
      if (!widths.length && rest >= MIN_FILLER) this.place('filler', wall, along, rest, { depth: 320, elevation: 1450, height: 720 });
    }
  }
}

/** Drops optional pieces (from the end of the list) until the rest fit. */
function fitRequired(required: Piece[], length: number): Piece[] {
  const pieces = [...required];
  while (pieces.length > 0 && pieces.reduce((sum, p) => sum + p.width, 0) > length) pieces.pop();
  return pieces;
}

const hobs = (spans: Array<{ kind: ItemKind; from: number; to: number }>) => spans.filter((s) => s.kind === 'oven');

/**
 * A complete starter kitchen for the room, laid out with standard widths.
 * Every unit stays inside the room and none overlap.
 */
export function buildLayout(id: LayoutId, room: Room, prefixes?: LabelPrefixes): KitchenItem[] {
  const b = new Builder(room, prefixes);
  const W = room.width;
  const D = room.depth;
  const sideEnd = Math.max(CORNER, D - RUN_END_CLEARANCE);

  switch (id) {
    case 'straight': {
      const fridgeEnd = b.run('top', 0, [{ kind: 'fridge', width: 600 }]);
      const spans = b.baseRun('top', fridgeEnd, W, [
        { kind: 'sink', width: 800 },
        { kind: 'dishwasher', width: 600 },
        { kind: 'oven', width: 600 },
        { kind: 'drawer', width: 600 },
      ]);
      b.wallUnits('top', fridgeEnd, W, hobs(spans));
      break;
    }
    case 'l-shape': {
      b.place('corner', 'top', 0, CORNER);
      // The fridge goes at the far end of the long wall when there is room for it.
      const runEnd = W - 600 >= CORNER + 600 ? W - 600 : W;
      const topSpans = b.baseRun('top', CORNER, runEnd, [
        { kind: 'sink', width: 800 },
        { kind: 'dishwasher', width: 600 },
      ]);
      if (runEnd < W) b.run('top', runEnd, [{ kind: 'fridge', width: 600 }]);
      const leftSpans = b.baseRun('left', CORNER, sideEnd, [
        { kind: 'oven', width: 600 },
        { kind: 'drawer', width: 600 },
      ]);
      b.wallUnits('top', CORNER, runEnd, hobs(topSpans));
      b.wallUnits('left', CORNER, sideEnd, hobs(leftSpans));
      break;
    }
    case 'u-shape': {
      // Two corner units need the full width of both.
      if (W < 2 * CORNER) return buildLayout('l-shape', room);
      b.place('corner', 'top', 0, CORNER);
      b.place('corner', 'right', 0, CORNER);
      b.baseRun('top', CORNER, W - CORNER, [{ kind: 'sink', width: 800 }]);
      const leftSpans = b.baseRun('left', CORNER, sideEnd, [
        { kind: 'oven', width: 600 },
        { kind: 'drawer', width: 600 },
      ]);
      const rightEnd = Math.max(CORNER, sideEnd - 600);
      b.baseRun('right', CORNER, rightEnd, [{ kind: 'dishwasher', width: 600 }]);
      if (sideEnd - rightEnd >= 600) b.run('right', rightEnd, [{ kind: 'fridge', width: 600 }]);
      b.wallUnits('top', CORNER, W - CORNER);
      b.wallUnits('left', CORNER, sideEnd, hobs(leftSpans));
      b.wallUnits('right', CORNER, rightEnd);
      break;
    }
  }
  if (!room.cutout && !room.features?.length) return b.items;
  const fitted: KitchenItem[] = [];
  for (const item of b.items) {
    const spot = canPlaceItem(room, fitted, item) ? null : findFreeSpot(room, fitted, item);
    // An impossible fit remains visible for the design checks, rather than silently losing a unit.
    fitted.push(spot ? { ...item, ...spot } : item);
  }
  return fitted;
}
