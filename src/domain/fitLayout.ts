import { CEILING_GAP, createItem, KIND_SPECS, sizeLimits, type LabelPrefixes } from './catalog';
import { DEFAULT_ROOM } from './designOps';
import { against, Envelope, topOf, type Run, type Span } from './fitEnvelope';
import { placeIsland } from './fitIsland';
import { cooker, floorUnit, packRow, value, type Module, type Prepared } from './fitRun';
import { attachedWall, footprintPieces, fridgeNextToOven } from './geometry';
import { createKitchenDesign, type KitchenPreset } from './kitchens';
import { validRoomPolygon } from './polygons';
import { featureFitsRoom, openingFitsRoomWall, roomOutline } from './roomGeometry';
import { buildLayout, type LayoutId } from './templates';
import type { Design, ItemKind, KitchenItem, Room } from './types';
import { openingIsValid, roomSegments, type WallSegment } from './walls';

export interface FitOptions {
  /** Stable perimeter segment ID, not a compass direction or display number. */
  mainWallId?: string;
  /** Facing the main wall from inside: left is its clockwise start, right its end. */
  side?: 'left' | 'right';
  prefixes?: LabelPrefixes;
}

export type FitReason = 'occupied' | 'wall' | 'space' | 'headroom' | 'opening' | 'structure' | 'corner' | 'passage' | 'appliances';

export interface FitChange {
  type: 'resized' | 'omitted' | 'added';
  kind: ItemKind;
  label: string;
  fromWidth: number;
  toWidth?: number;
  fromHeight?: number;
  toHeight?: number;
  reason: FitReason;
}

export type LayoutFit = {
  status: 'fits' | 'adjusted' | 'cannot-fit';
  items: KitchenItem[];
  changes: FitChange[];
  reason?: FitReason;
  mainWallId?: string;
};

type Target = Pick<Design, 'room' | 'openings' | 'items'> & Partial<Pick<Design, 'materials' | 'construction'>>;
type Role = 'main' | 'left' | 'right';
type Recipe = ReturnType<typeof recipe>;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

function recipe(source: KitchenPreset | LayoutId, prefixes?: LabelPrefixes, starterRoom: Room = DEFAULT_ROOM, panelWidth?: number) {
  const starter = typeof source === 'string';
  const id = starter ? source : source.id;
  const layout = starter ? source : source.layout;
  const stock = starter
    ? { room: starterRoom, items: buildLayout(source, starterRoom, prefixes) }
    : createKitchenDesign(source, '', prefixes);
  const items = stock.items.map((item, i) => ({ ...item, id: `fit-${id}-${i + 1}` }));
  const runs: Record<Role, Module[]> = { main: [], left: [], right: [] };
  const corners: KitchenItem[] = [], island: KitchenItem[] = [];
  for (const item of items) {
    if (item.kind === 'corner') { corners.push(item); continue; }
    const wall = attachedWall(item, stock.room);
    if (!wall) { island.push(item); continue; }
    const role = wall === 'left' || wall === 'right' ? wall : 'main';
    runs[role].push({ item, from: role === 'main' ? item.x : item.y });
  }
  // The example chimney/setback is not part of this room. Keep relative run/row
  // positions only; the new room's own structure decides where the run can begin.
  if (layout === 'straight' && runs.main.length) {
    const start = Math.min(...runs.main.map((m) => m.from));
    runs.main.forEach((m) => { m.from -= start; });
  }
  const dividers = new Set<string>();
  const fridge = (i: KitchenItem) => i.kind === 'fridge' || i.kind === 'integratedFridge';
  const oven = (i: KitchenItem) => i.kind === 'oven' || i.kind === 'ovenTower';
  if (panelWidth !== undefined) for (const modules of Object.values(runs)) {
    const floor = modules.filter((m) => floorUnit(m.item)).sort((a, b) => a.from - b.from);
    for (let i = 1; i < floor.length; i++) {
      const a = floor[i - 1], b = floor[i];
      if (!(fridge(a.item) && oven(b.item) || oven(a.item) && fridge(b.item)) || !near(a.from + a.item.width, b.from)) continue;
      const from = b.from;
      const panel = createItem('endPanel', items, { id: `fit-${id}-divider-${dividers.size + 1}`, width: panelWidth,
        depth: Math.max(a.item.depth, b.item.depth), height: Math.min(KIND_SPECS.endPanel.limits.height.max, Math.max(...modules
          .filter((m) => near(m.from, a.from) || near(m.from, b.from)).map((m) => topOf(m.item)))) }, prefixes);
      modules.forEach((m) => { if (m.from >= from) m.from += panelWidth; });
      modules.push({ item: panel, from });
      items.push(panel);
      dividers.add(panel.id);
    }
  }
  return { items, runs, corners, island, layout, dividers };
}

/** Adjust only cuttable cabinetry at the ceiling; no stretching/lowering appliances or hoods. */
function belowCeiling(item: KitchenItem, ceiling: number): KitchenItem | null {
  if (topOf(item) <= ceiling + 1e-6) return item;
  if (!['wall', 'shelf', 'glassWall', 'endPanel', 'filler', 'tall', 'corner'].includes(item.kind)) return null;
  const height = Math.floor(ceiling - CEILING_GAP - item.elevation);
  return height >= sizeLimits(item, 'height').min ? { ...item, height } : null;
}

interface Located { item: KitchenItem; from: number }
interface Link { source: Span; target: Span }

/** Map upper-row seams onto the fitted base run (also across omitted modules and openings). */
function mappedPosition(links: Link[], x: number, end = false) {
  // At a split seam, measure a module's start from the right-hand base and its end from the left-hand one.
  const within = links.find((l) => end ? x > l.source.from && x <= l.source.to : x >= l.source.from && x < l.source.to);
  if (within) return within.target.from + (x - within.source.from) * (within.target.to - within.target.from) / (within.source.to - within.source.from);
  const a = links.findLast((l) => l.source.to <= x);
  const b = links.find((l) => l.source.from >= x);
  if (a && b && b.source.from > a.source.to)
    return a.target.to + (x - a.source.to) * (b.target.from - a.target.to) / (b.source.from - a.source.to);
  return a ? a.target.to + x - a.source.to : b ? b.target.from + x - b.source.from : x;
}

class Trial {
  readonly env: Envelope;
  readonly placed = new Map<string, Located>();
  readonly reasons = new Map<string, FitReason>();
  constructor(readonly target: Target) { this.env = new Envelope(target.room, target.openings); }

  add(item: KitchenItem, from: number) {
    const reason = this.env.obstruction(item);
    if (reason) { this.reasons.set(item.id, reason); return; }
    this.env.add(item);
    this.placed.set(item.id, { item, from });
  }

  fitCorners(stock: Recipe, main: WallSegment, left: WallSegment, right: WallSegment, flipped: boolean, omit: number) {
    for (const original of stock.corners) {
      const item = belowCeiling(original, this.target.room.height);
      if (!item) { this.reasons.set(original.id, 'headroom'); continue; }
      const atEnd = original.rotation === 90 || flipped;
      if (omit & (atEnd ? 2 : 1)) { this.reasons.set(item.id, 'space'); continue; }
      const incoming = atEnd ? main : left, outgoing = atEnd ? right : main;
      // A 90° manufactured corner only belongs at a convex, square junction.
      if (!near((outgoing.angle - incoming.angle + 360) % 360, 90)
        || outgoing.length < (flipped ? item.width2 ?? item.width : item.width)
        || incoming.length < (flipped ? item.width : item.width2 ?? item.width)) {
        this.reasons.set(item.id, 'corner'); continue;
      }
      this.add(against({ wall: outgoing, reverse: false },
        flipped ? { ...item, width: item.width2 ?? item.width, width2: item.width } : item, 0), 0);
    }
  }

  prepare(modules: Module[]): Prepared[] {
    return modules.flatMap((m) => {
      const item = belowCeiling(m.item, this.target.room.height);
      if (!item) { this.reasons.set(m.item.id, 'headroom'); return []; }
      return [{ ...m, item, preferred: m.from }];
    });
  }

  pack(run: Run, modules: Prepared[], bounds: Span) {
    for (const p of packRow(this.env, run, modules, bounds, this.reasons)) this.add(p.item, p.from);
  }

  upperRun(run: Run, modules: Module[]) {
    const floor = modules.filter((m) => floorUnit(m.item));
    const links: Link[] = floor.flatMap((m) => {
      const p = this.placed.get(m.item.id);
      return p ? [{ source: { from: m.from, to: m.from + m.item.width }, target: { from: p.from, to: p.from + p.item.width } }] : [];
    }).sort((a, b) => a.source.from - b.source.from);
    if (!links.length) return;
    // A continuous upper or a shelf can reach over the corner base, which is not
    // part of this straight floor run. Preserve that overhang, not space from omitted units.
    const startOverhang = Math.min(...floor.map((m) => m.from)) - Math.min(...modules.map((m) => m.from));
    const endOverhang = Math.max(...modules.map((m) => m.from + m.item.width)) - Math.max(...floor.map((m) => m.from + m.item.width));
    const bounds = { from: Math.max(0, links[0].target.from - startOverhang),
      to: Math.min(run.wall.length, links[links.length - 1].target.to + endOverhang) };
    const rows = new Map<number, Prepared[]>();
    const caps = new Set(modules.filter((m) => ['tall', 'ovenTower', 'integratedFridge', 'fridge', 'hood'].includes(m.item.kind)
      || (floorUnit(m.item) && m.item.kind === 'glassWall'))
      .map((m) => m.item.id));
    const sameSpan = (a: Module, b: Module) => near(a.from, b.from) && near(a.item.width, b.item.width);
    const hoods = modules.filter((m) => m.item.kind === 'hood');
    for (const m of this.prepare(modules.filter((m) => !floorUnit(m.item))).sort((a, b) => a.item.elevation - b.item.elevation)) {
      const { item } = m;
      const under = item.kind === 'hood'
        ? floor.find((base) => cooker(base.item) && sameSpan(base, m))
        : modules.find((lower) => caps.has(lower.item.id) && sameSpan(lower, m) && near(lower.item.elevation + lower.item.height, item.elevation));
      if (under || item.kind === 'hood') {
        caps.add(item.id);
        const base = under && this.placed.get(under.item.id);
        if (!base) { this.reasons.set(item.id, under && this.reasons.get(under.item.id) || 'space'); continue; }
        this.add(against(run, { ...item, width: base.item.width }, base.from), base.from);
      } else if (item.kind === 'endPanel') {
        // The narrow exposed return belongs on the actual edge of the framed niche.
        const atEnd = links.some((l) => near(l.source.from, m.from + item.width));
        const from = atEnd ? mappedPosition(links, m.from + item.width, false) - item.width : mappedPosition(links, m.from, true);
        this.add(against(run, item, from), from);
      } else {
        const row = rows.get(item.elevation) ?? [];
        row.push({ ...m, preferred: mappedPosition(links, m.from) });
        rows.set(item.elevation, row);
      }
    }
    // Keep an extractor bay clear even if the cooker lost its hood to a window,
    // or the simple starter intentionally has no extractor model.
    for (const m of floor.filter((m) => cooker(m.item))) {
      const base = this.placed.get(m.item.id);
      const hood = hoods.find((h) => sameSpan(m, h));
      if (!base || (hood && this.placed.has(hood.item.id))) continue;
      for (const polygon of footprintPieces(base.item)) this.env.solids.push({
        polygon, bottom: topOf(base.item), top: hood ? topOf(hood.item) : 2050, reason: 'space',
      });
    }
    for (const row of rows.values()) this.pack(run, row, bounds);
  }
}

function proposal(target: Target, stock: Recipe, walls: WallSegment[], index: number, options: FitOptions) {
  const main = walls[index], left = walls[(index + walls.length - 1) % walls.length], right = walls[(index + 1) % walls.length];
  const flipped = stock.layout === 'l-shape' && options.side === 'right';
  const runs: [Role, Run][] = [['main', { wall: main, reverse: flipped }]];
  if (stock.layout !== 'straight') runs.push(['left', { wall: flipped ? right : left, reverse: !flipped }]);
  if (stock.layout === 'u-shape') runs.push(['right', { wall: right, reverse: false }]);

  const floorFit = (omit: number, sidesFirst = false) => {
    const trial = new Trial(target);
    trial.fitCorners(stock, main, left, right, flipped, omit);
    for (const [role, run] of sidesFirst ? [...runs.slice(1), runs[0]] : runs) {
      const modules = stock.runs[role];
      const floor = trial.prepare(modules.filter((m) => floorUnit(m.item)));
      for (const m of floor.filter((m) => cooker(m.item)))
        m.hood = modules.find((h) => h.item.kind === 'hood' && near(h.from, m.from) && near(h.item.width, m.item.width))?.item;
      trial.pack(run, floor, { from: 0, to: run.wall.length });
    }
    const missingCore = stock.items.find((i) => (cooker(i) || i.kind === 'sink') && !trial.placed.has(i.id));
    const emptyArm = runs.map(([role]) => stock.runs[role].filter((m) => floorUnit(m.item) && m.item.kind !== 'filler'))
      .find((floor) => !floor.some((m) => trial.placed.has(m.item.id)));
    const missing = missingCore ?? emptyArm?.[0]?.item;
    const failure = missing || emptyArm ? (missing && trial.reasons.get(missing.id) || 'space') : undefined;
    const score = [...trial.placed.values()].reduce((s, p) => s + value(p.item) + p.item.width / 1200, failure ? -1e9 : 0);
    return { trial, failure, score };
  };
  let best = floorFit(0);
  if (runs.length > 1 && (best.failure || stock.items.some((i) => floorUnit(i) && value(i) >= 1e4 && !best.trial.placed.has(i.id)))) {
    // On a short wall two 900 mm corners may exclude even the sink. Prefer a working
    // U/L with a reported dead corner to a broken U/L (or losing an appliance).
    for (const mask of stock.layout === 'u-shape' ? [0, 1, 2, 3] : [0, flipped ? 2 : 1]) {
      for (const sidesFirst of [true, false]) {
        if (!mask && !sidesFirst) continue;
        const variant = floorFit(mask, sidesFirst);
        if (variant.score > best.score) best = variant;
      }
    }
  }
  const { trial, failure } = best;
  if (failure) return { fit: cannotFit(failure, main.id), score: best.score };
  for (const [role, run] of runs) trial.upperRun(run, stock.runs[role]);
  const island = placeIsland(trial.env, runs[0][1], stock.island);
  for (const original of stock.island) trial.reasons.set(original.id, 'passage');
  for (const item of island) trial.add(item, 0);

  const items: KitchenItem[] = [], changes: FitChange[] = [];
  let score = 0;
  for (const original of stock.items) {
    const fitted = trial.placed.get(original.id)?.item;
    const reason = trial.reasons.get(original.id) ?? 'space';
    const change = { kind: original.kind, label: original.label, fromWidth: original.width };
    if (stock.dividers.has(original.id)) {
      if (fitted) { items.push(fitted); changes.push({ ...change, type: 'added', toWidth: fitted.width, reason: 'appliances' }); }
      continue;
    }
    if (!fitted) { changes.push({ ...change, type: 'omitted', reason }); continue; }
    items.push(fitted);
    const shorter = !near(fitted.height, original.height), narrower = !near(fitted.width, original.width);
    if (shorter || narrower) changes.push({
      ...change, type: 'resized', reason: shorter ? 'headroom' : reason,
      ...(shorter ? { fromHeight: original.height, toHeight: fitted.height } : {}),
      ...(narrower ? { toWidth: fitted.width } : {}),
    });
    score += value(fitted) + fitted.width / original.width + fitted.height / original.height;
  }
  const fit: LayoutFit = { status: changes.length ? 'adjusted' : 'fits', items, changes, mainWallId: main.id };
  return { fit, score };
}

const cannotFit = (reason: FitReason, mainWallId?: string): LayoutFit =>
  ({ status: 'cannot-fit', items: [], changes: [], reason, mainWallId });

/**
 * Preview only; no room, opening, construction, or project metadata is copied from
 * the example. With no wall selected, prefer the perimeter run retaining the most
 * of the composition. An explicitly selected wall/side is never silently replaced.
 */
export function fitKitchenLayout(
  target: Target,
  source: KitchenPreset | LayoutId,
  options: FitOptions = {},
): LayoutFit {
  const fit = fitRuns(target, source, options);
  const adjacent = (items: KitchenItem[]) => items.some((i) => items.some((other) => fridgeNextToOven(i, other)));
  if (!adjacent(fit.items)) return fit;
  const thickness = target.materials?.find((m) => m.id === target.construction?.frontMaterial)?.thickness ?? 18;
  const limits = KIND_SPECS.endPanel.limits.width;
  if (thickness < limits.min || thickness > limits.max) return fit;
  const separated = fitRuns(target, source, options, thickness);
  return separated.status !== 'cannot-fit' && !adjacent(separated.items) ? separated : fit;
}

function fitRuns(target: Target, source: KitchenPreset | LayoutId, options: FitOptions, panelWidth?: number): LayoutFit {
  if (target.items.length) return cannotFit('occupied', options.mainWallId);
  if (!validRoomPolygon(roomOutline(target.room))) return cannotFit('wall', options.mainWallId);
  if (target.openings.some((o) => !openingIsValid(target.room, o)
    || (!o.wallId && !openingFitsRoomWall(target.room, o.wall, o.offset, o.width)))) return cannotFit('opening', options.mainWallId);
  if (target.room.features?.some((f) => !featureFitsRoom(target.room, f))) return cannotFit('structure', options.mainWallId);
  const walls = roomSegments(target.room, false);
  const gallery = typeof source !== 'string' ? recipe(source, options.prefixes, DEFAULT_ROOM, panelWidth) : null;
  let best: ReturnType<typeof proposal> | undefined;
  for (const [index, wall] of walls.entries()) {
    if (options.mainWallId !== undefined && wall.id !== options.mainWallId) continue;
    // Starters have a repeatable storage run (unlike a fixed gallery composition).
    // Extend it on long walls; in short rooms still start with every appliance in the brief.
    const previous = walls[(index + walls.length - 1) % walls.length], next = walls[(index + 1) % walls.length];
    const sideLength = source === 'u-shape' ? Math.min(previous.length, next.length)
      : options.side === 'right' ? next.length : previous.length;
    const stock = gallery ?? recipe(source, options.prefixes, {
      width: Math.max(DEFAULT_ROOM.width, Math.floor(wall.length)), depth: Math.max(DEFAULT_ROOM.depth, Math.floor(sideLength)), height: DEFAULT_ROOM.height,
    }, panelWidth);
    const attempt = proposal(target, stock, walls, index, options);
    if (attempt.fit.status === 'fits') return attempt.fit;
    if (!best || attempt.score > best.score) best = attempt;
  }
  return best?.fit ?? cannotFit('wall', options.mainWallId);
}
