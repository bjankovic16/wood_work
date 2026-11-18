import { isWallMounted } from '../domain/geometry';
import type { CustomPart, EdgeBand, KitchenItem, Material, PartEdit } from '../domain/types';
import { KIND_OPTIONS, resolveConfig, type BuildContext, type ResolvedConfig } from './config';
import { cornerDoorWidths, frontLayout, OVEN_NICHE_HEIGHT, round1, type FrontRect } from './fronts';
import { EN_LABELS, type PartName, type PartNote } from './labels';

/** One kind of piece to cut. Length is always the longer side. */
export interface Part {
  name: string;
  quantity: number;
  /** Cut size: the finished size, less the edge banding when the settings say so. */
  length: number;
  width: number;
  thickness: number;
  materialId: string;
  /** Banded edges running along the length and along the width (0–2 each). */
  edges: { length: number; width: number };
  edgeBandId: string | null;
  /** Banding on one piece in mm, measured on the finished size (including any L-shaped edges). */
  edgeLength: number;
  /** Area of one piece in mm² (less than length × width for L-shaped pieces). */
  area: number;
  /** The material's grain must run along the length, so the piece cannot be turned on the sheet. */
  grain: boolean;
  note?: string;
  /** Identifies a generated part for hand edits: its name, note and generated size. */
  key: string;
  /** Changed by hand in the cutting list. */
  edited?: boolean;
  /** For a part changed by hand: what the rules give. */
  calculated?: { length: number; width: number; quantity: number; materialId: string; thickness: number };
}

/** A grooved back reaches this much short of the bottom of each groove. */
export const GROOVE_PLAY = 1;
/** Standard drawer slide lengths (mm). */
export const SLIDE_LENGTHS = [250, 300, 350, 400, 450, 500, 550, 600, 650];
/** Space left behind the drawer slides. */
const SLIDE_REAR_CLEARANCE = 10;
/** Drawer boxes are never made lower than this. */
export const MIN_DRAWER_BOX_HEIGHT = 40;

interface PieceSpec {
  name: PartName;
  quantity: number;
  /** Finished sizes. */
  a: number;
  b: number;
  material: Material;
  /** Banded edges running along a, and along b. */
  edgesA?: number;
  edgesB?: number;
  band?: EdgeBand | null;
  /** Banding on edges that are not sides of the rectangle (L-shaped pieces). */
  extraEdge?: number;
  /** Area of one piece if it is not a full rectangle. */
  area?: number;
  note?: PartNote;
}

function piece(spec: PieceSpec, ctx: BuildContext): Part {
  const note = spec.note ? ctx.labels.note(spec.note) : undefined;
  const band = spec.band ?? null;
  const edgesA = band ? (spec.edgesA ?? 0) : 0;
  const edgesB = band ? (spec.edgesB ?? 0) : 0;
  const extra = band ? (spec.extraEdge ?? 0) : 0;
  // An edge running along a sits at one end of b, so it adds to b (and the other way round).
  const shrink = band && ctx.settings.subtractEdges ? band.thickness : 0;
  const a = spec.a - edgesB * shrink;
  const b = spec.b - edgesA * shrink;
  const aIsLength = a >= b;
  const length = round1(Math.max(a, b));
  const width = round1(Math.min(a, b));
  return {
    name: ctx.labels.part[spec.name],
    quantity: spec.quantity,
    length,
    width,
    thickness: spec.material.thickness,
    materialId: spec.material.id,
    edges: aIsLength ? { length: edgesA, width: edgesB } : { length: edgesB, width: edgesA },
    edgeBandId: band && edgesA + edgesB + extra > 0 ? band.id : null,
    edgeLength: round1(edgesA * spec.a + edgesB * spec.b + extra),
    area: spec.area ?? round1(Math.max(a, b)) * round1(Math.min(a, b)),
    grain: spec.material.grain,
    ...(note ? { note } : {}),
    // Always the English words, so hand edits survive a change of language.
    key: partKey(EN_LABELS.part[spec.name], spec.note ? EN_LABELS.note(spec.note) : undefined, length, width),
  };
}

export function partKey(name: string, note: string | undefined, length: number, width: number): string {
  return `${name}|${note ?? ''}|${length}x${width}`;
}

const carcassBand = (ctx: BuildContext) => (ctx.settings.carcassEdge ? (ctx.edgeBands.get(ctx.settings.carcassEdge) ?? null) : null);
const frontBand = (ctx: BuildContext) => (ctx.settings.frontEdge ? (ctx.edgeBands.get(ctx.settings.frontEdge) ?? null) : null);

/** Depth inside the carcass, in front of the back panel. */
export function innerDepth(item: KitchenItem, config: ResolvedConfig, ctx: BuildContext): number {
  const grooved = KIND_OPTIONS[item.kind].back && ctx.settings.backMount === 'groove';
  return grooved ? item.depth - ctx.settings.grooveOffset - config.back.thickness : item.depth;
}

function backPanel(item: KitchenItem, config: ResolvedConfig, ctx: BuildContext, fullTop: boolean): Part {
  const { width: W, height: H } = item;
  const { settings } = ctx;
  const t = config.carcass.thickness;
  if (settings.backMount === 'nailed') {
    const inset = settings.backInset;
    return piece({ name: 'back', quantity: 1, a: H - 2 * inset, b: W - 2 * inset, material: config.back }, ctx);
  }
  // In grooves in the sides, the bottom and (if there is one) the top panel.
  const reach = settings.grooveDepth - GROOVE_PLAY;
  const width = W - 2 * t + 2 * reach;
  const height = fullTop ? H - 2 * t + 2 * reach : H - t + reach - GROOVE_PLAY;
  return piece({ name: 'back', quantity: 1, a: height, b: width, material: config.back, note: { kind: 'grooved' } }, ctx);
}

/** Sides, bottom, top or rails and back of a rectangular unit. */
function carcass(item: KitchenItem, config: ResolvedConfig, ctx: BuildContext, fullTop: boolean): Part[] {
  const { width: W, height: H, depth: D } = item;
  const s = ctx.settings;
  const t = config.carcass.thickness;
  const band = carcassBand(ctx);
  const m = config.carcass;
  const sideHeight = H - (s.bottomJoint === 'under' ? t : 0) - (fullTop && s.topJoint === 'over' ? t : 0);
  // The front edge of every carcass panel shows; on wall units so does the bottom edge of the sides.
  const parts = [
    piece({ name: 'side', quantity: 2, a: sideHeight, b: D, material: m, band, edgesA: 1, edgesB: isWallMounted(item) ? 1 : 0 }, ctx),
    piece({ name: 'bottom', quantity: 1, a: s.bottomJoint === 'between' ? W - 2 * t : W, b: D, material: m, band, edgesA: 1 }, ctx),
  ];
  if (fullTop) {
    parts.push(piece({ name: 'top', quantity: 1, a: s.topJoint === 'between' ? W - 2 * t : W, b: D, material: m, band, edgesA: 1 }, ctx));
  } else {
    parts.push(piece({ name: 'frontRail', quantity: 1, a: W - 2 * t, b: s.railWidth, material: m, band, edgesA: 1 }, ctx));
    parts.push(piece({ name: 'backRail', quantity: 1, a: W - 2 * t, b: s.railWidth, material: m }, ctx));
  }
  if (KIND_OPTIONS[item.kind].back) parts.push(backPanel(item, config, ctx, fullTop));
  return parts;
}

function shelves(item: KitchenItem, config: ResolvedConfig, ctx: BuildContext, name: PartName = 'shelf', count = config.shelves): Part[] {
  if (count <= 0) return [];
  const t = config.carcass.thickness;
  const fixed = name !== 'shelf';
  const depth = innerDepth(item, config, ctx) - (fixed ? 0 : ctx.settings.shelfSetback);
  return [piece({ name, quantity: count, a: item.width - 2 * t, b: depth, material: config.carcass, band: carcassBand(ctx), edgesA: 1 }, ctx)];
}

/** Longest standard slide that fits the inside depth. */
export function slideLength(depthAvailable: number): number {
  const fitting = SLIDE_LENGTHS.filter((length) => length <= depthAvailable - SLIDE_REAR_CLEARANCE);
  return fitting.length > 0 ? fitting[fitting.length - 1] : SLIDE_LENGTHS[0];
}

export function drawerBoxHeight(front: FrontRect, ctx: BuildContext): number {
  return round1(Math.max(MIN_DRAWER_BOX_HEIGHT, front.h - ctx.settings.drawerBoxGap));
}

/**
 * Drawer boxes, one per drawer front. Wooden boxes on side-mounted slides are
 * cut whole; with a metal drawer system only the bottom and the back are cut.
 */
function drawerBoxes(item: KitchenItem, config: ResolvedConfig, ctx: BuildContext, fronts: FrontRect[]): Part[] {
  const drawers = fronts.filter((f) => f.kind === 'drawer');
  if (drawers.length === 0) return [];
  const s = ctx.settings;
  const t = config.carcass.thickness;
  const insideWidth = item.width - 2 * t;
  const slide = slideLength(innerDepth(item, config, ctx));
  const byHeight = new Map<number, number>();
  for (const front of drawers) {
    const height = drawerBoxHeight(front, ctx);
    byHeight.set(height, (byHeight.get(height) ?? 0) + 1);
  }

  if (s.drawerSystem === 'metal') {
    const note: PartNote = { kind: 'metalDrawer', slide };
    return [...byHeight].flatMap(([height, count]) => [
      piece({ name: 'drawerBottom', quantity: count, a: insideWidth - s.metalBottomDeduction, b: slide - s.metalDepthDeduction, material: config.carcass, note }, ctx),
      piece({ name: 'drawerBack', quantity: count, a: insideWidth - s.metalBackDeduction, b: height, material: config.carcass, note }, ctx),
    ]);
  }

  const boxWidth = insideWidth - 2 * s.slideClearance;
  const note: PartNote = { kind: 'woodenDrawer', slide };
  const band = carcassBand(ctx);
  return [...byHeight].flatMap(([height, count]) => [
    piece({ name: 'drawerSide', quantity: 2 * count, a: slide, b: height, material: config.carcass, band, edgesA: 1, note }, ctx),
    piece({ name: 'drawerFrontBack', quantity: 2 * count, a: boxWidth - 2 * t, b: height, material: config.carcass, band, edgesA: 1, note }, ctx),
    piece({ name: 'drawerBottom', quantity: count, a: boxWidth, b: slide, material: config.back, note }, ctx),
  ]);
}

const PANEL_NAMES: Partial<Record<KitchenItem['kind'], PartName>> = {
  oven: 'ovenPanel',
  dishwasher: 'dishwasherFront',
  filler: 'fillerPanel',
  pullOut: 'pullOutFront',
};

/** Doors, drawer fronts and panels, with identical sizes counted together. All four edges are banded. */
function frontParts(item: KitchenItem, fronts: FrontRect[], config: ResolvedConfig, ctx: BuildContext): Part[] {
  const counts = new Map<string, { front: FrontRect; count: number }>();
  for (const front of fronts) {
    const key = `${front.kind}|${front.w}|${front.h}`;
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { front, count: 1 });
  }
  const band = frontBand(ctx);
  return [...counts.values()].map(({ front, count }) => {
    const glass = item.kind === 'glassWall';
    const name: PartName = glass ? 'glassDoor' : front.kind === 'door' ? 'door' : front.kind === 'drawer' ? 'drawerFront' : (PANEL_NAMES[item.kind] ?? 'panel');
    return piece({ name, quantity: count, a: front.h, b: front.w, material: config.front, band: glass ? null : band, edgesA: 2, edgesB: 2, ...(glass ? { note: { kind: 'glassBlank' as const } } : {}) }, ctx);
  });
}

/** An L-shaped panel: an a × b rectangle with the inner corner cut out, leaving arms `armDepth` wide. */
function lPanel(name: PartName, quantity: number, a: number, b: number, armDepth: number, config: ResolvedConfig, ctx: BuildContext): Part {
  const cutA = round1(a - armDepth);
  const cutB = round1(b - armDepth);
  return piece(
    {
      name,
      quantity,
      a,
      b,
      material: config.carcass,
      band: carcassBand(ctx),
      // The two inner front edges show.
      extraEdge: cutA + cutB,
      area: round1(a) * round1(b) - cutA * cutB,
      note: { kind: 'lShaped', a: cutA, b: cutB },
    },
    ctx,
  );
}

function cornerParts(item: KitchenItem, config: ResolvedConfig, ctx: BuildContext): Part[] {
  const s = ctx.settings;
  const t = config.carcass.thickness;
  const { width: W, depth: D, height: H } = item;
  const W2 = item.width2 ?? W;
  const sideHeight = H - (s.bottomJoint === 'under' ? t : 0) - (s.topJoint === 'over' ? t : 0);
  const inset = s.backInset;
  const [doorA, doorB] = cornerDoorWidths(item, config, s);
  const front = frontBand(ctx);
  const parts = [
    piece({ name: 'side', quantity: 2, a: sideHeight, b: D, material: config.carcass, band: carcassBand(ctx), edgesA: 1 }, ctx),
    // Panels "between" stop at the end sides of the two arms; otherwise they run over them.
    lPanel('bottom', 1, s.bottomJoint === 'between' ? W - t : W, s.bottomJoint === 'between' ? W2 - t : W2, D, config, ctx),
    lPanel('top', 1, s.topJoint === 'between' ? W - t : W, s.topJoint === 'between' ? W2 - t : W2, D, config, ctx),
    // The two backs meet in the corner; corner units always have them nailed on.
    piece({ name: 'back', quantity: 1, a: H - 2 * inset, b: W - 2 * inset, material: config.back, note: { kind: 'cornerBack', wall: 'A' } }, ctx),
    piece(
      { name: 'back', quantity: 1, a: H - 2 * inset, b: W2 - config.back.thickness - 2 * inset, material: config.back, note: { kind: 'cornerBack', wall: 'B' } },
      ctx,
    ),
  ];
  if (config.shelves > 0) parts.push(lPanel('shelf', config.shelves, W - t, W2 - t, D - s.shelfSetback, config, ctx));
  parts.push(
    piece({ name: 'door', quantity: 1, a: H - s.frontGap, b: doorA, material: config.front, band: front, edgesA: 2, edgesB: 2, note: { kind: 'cornerDoor', wall: 'A' } }, ctx),
  );
  parts.push(
    piece({ name: 'door', quantity: 1, a: H - s.frontGap, b: doorB, material: config.front, band: front, edgesA: 2, edgesB: 2, note: { kind: 'cornerDoor', wall: 'B' } }, ctx),
  );
  return parts;
}

/** Every piece needed to build one unit, as the construction rules give them. */
export function generatedParts(item: KitchenItem, ctx: BuildContext): Part[] {
  const config = resolveConfig(item, ctx);
  const fronts = frontLayout(item, config, ctx.settings);
  const fullBaseTop = ctx.settings.baseTop === 'full';

  switch (item.kind) {
    case 'base':
    case 'sink':
    case 'drawer':
    case 'hob':
    case 'pullOut':
      return [
        ...carcass(item, config, ctx, fullBaseTop),
        ...shelves(item, config, ctx),
        ...frontParts(item, fronts, config, ctx),
        ...drawerBoxes(item, config, ctx, fronts),
      ];
    case 'oven':
      return [
        ...carcass(item, config, ctx, fullBaseTop),
        // The oven stands on a fixed shelf at the bottom of its niche.
        ...(item.height > OVEN_NICHE_HEIGHT ? shelves(item, config, ctx, 'ovenShelf', 1) : []),
        ...frontParts(item, fronts, config, ctx),
        ...drawerBoxes(item, config, ctx, fronts),
      ];
    case 'wall':
    case 'glassWall':
      return [...carcass(item, config, ctx, true), ...shelves(item, config, ctx), ...frontParts(item, fronts, config, ctx)];
    case 'shelf':
      if (item.shelfForm === 'floating') return [piece({ name: 'shelf', quantity: config.shelves + 2, a: item.width, b: item.depth,
        material: config.carcass, band: carcassBand(ctx), edgesA: 1, edgesB: 2 }, ctx)];
      return [...carcass(item, config, ctx, true), ...shelves(item, config, ctx)];
    case 'tall': {
      // Doors split in two rows get a fixed shelf behind the split to keep the sides straight.
      const doorRows = new Set(fronts.filter((f) => f.kind === 'door').map((f) => f.y)).size;
      return [
        ...carcass(item, config, ctx, true),
        ...shelves(item, config, ctx),
        ...(doorRows > 1 ? shelves(item, config, ctx, 'fixedShelf', 1) : []),
        ...frontParts(item, fronts, config, ctx),
      ];
    }
    case 'ovenTower':
      return [...carcass(item, config, ctx, true), ...shelves(item, config, ctx, 'ovenShelf', 2), ...frontParts(item, fronts, config, ctx)];
    case 'integratedFridge':
      return [...carcass(item, config, ctx, true), ...frontParts(item, fronts, config, ctx)];
    case 'bar':
      return [piece({ name: 'barTop', quantity: 1, a: item.width, b: item.depth, material: config.carcass, note: { kind: 'barBlank' } }, ctx)];
    case 'corner':
      return cornerParts(item, config, ctx);
    case 'dishwasher':
    case 'filler':
      return frontParts(item, fronts, config, ctx);
    case 'endPanel':
      // The front edge and the top edge show.
      return [piece({ name: 'endPanel', quantity: 1, a: item.height, b: item.depth, material: config.front, band: frontBand(ctx), edgesA: 1, edgesB: 1 }, ctx)];
    case 'fridge':
    case 'hood':
      return [];
  }
}

/**
 * Every piece needed to build one unit, with any hand edits applied. An edit
 * is tied to the generated size of its part, so it stops applying (rather
 * than giving a wrong part) once the unit changes and the part with it.
 * Sizes are kept as typed: the length stays the side the grain runs along,
 * even if it is no longer the longer one.
 */
export function unitParts(item: KitchenItem, ctx: BuildContext, edits?: Record<string, PartEdit>): Part[] {
  const parts = generatedParts(item, ctx);
  if (!edits) return parts;
  return parts.map((part) => {
    const edit = edits[part.key];
    if (!edit) return part;
    const length = edit.length ?? part.length;
    const width = edit.width ?? part.width;
    const banded = part.edges.length + part.edges.width > 0;
    // L-shaped pieces keep their share of the rectangle.
    const fill = part.area / (part.length * part.width);
    const material = edit.materialId ? ctx.materials.get(edit.materialId) : undefined;
    return {
      ...part,
      length,
      width,
      quantity: edit.quantity ?? part.quantity,
      ...(material ? { materialId: material.id, thickness: material.thickness, grain: material.grain } : {}),
      area: fill < 1 ? round1(length * width * fill) : length * width,
      edgeLength: banded ? round1(part.edges.length * length + part.edges.width * width) : part.edgeLength,
      edited: true,
      calculated: { length: part.length, width: part.width, quantity: part.quantity, materialId: part.materialId, thickness: part.thickness },
    };
  });
}

/** A piece added by hand, as a cutting-list part. */
export function customPart(custom: CustomPart, ctx: BuildContext): Part {
  const material = ctx.materials.get(custom.materialId);
  const band = custom.edgeBandId ? (ctx.edgeBands.get(custom.edgeBandId) ?? null) : null;
  const edgesLength = band ? custom.edgesLength : 0;
  const edgesWidth = band ? custom.edgesWidth : 0;
  return {
    name: custom.name,
    quantity: custom.quantity,
    length: custom.length,
    width: custom.width,
    thickness: material?.thickness ?? 18,
    materialId: custom.materialId,
    edges: { length: edgesLength, width: edgesWidth },
    edgeBandId: band && edgesLength + edgesWidth > 0 ? band.id : null,
    edgeLength: edgesLength * custom.length + edgesWidth * custom.width,
    area: custom.length * custom.width,
    grain: material?.grain ?? false,
    ...(custom.note ? { note: custom.note } : {}),
    key: `custom|${custom.id}`,
  };
}
