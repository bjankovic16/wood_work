import type { Design, KitchenItem } from '../domain/types';
import { buildContext } from './config';
import { unitHardware, type Hardware } from './hardware';
import { EN_LABELS, type EngineLabels } from './labels';
import { boardLabel } from './materialLabel';
import { nest, SAW_KERF, SHEET_TRIM } from './nesting';
import { customPart, unitParts, validPart, type Part } from './parts';

export { formatMm } from './format';

/** A row of the cutting list: identical pieces from all units, counted together. */
export interface CuttingRow extends Part {
  materialName: string;
  bandName: string | null;
  /** Codes of the units these pieces belong to. */
  units: string[];
}

export interface MaterialTotal {
  materialId: string;
  materialName: string;
  thickness: number;
  pieces: number;
  /** Square metres of valid parts; only a subtotal when invalid > 0. */
  area: number;
  sheetLength: number;
  sheetWidth: number;
  /** Sheets for valid parts, by the shelf-layout estimate; incomplete when invalid > 0. */
  sheets: number;
  /** Share of the bought sheets that ends up as parts. */
  used: number;
  /** Pieces too large for the sheet. */
  oversize: number;
  /** Required pieces whose sizes/stock are invalid; all estimates are incomplete until fixed. */
  invalid: number;
  /** Sheets × price; null without a price or when some pieces don't fit. */
  cost: number | null;
}

export interface EdgeTotal {
  bandId: string;
  name: string;
  thickness: number;
  /** Including the trimming allowance. */
  metres: number;
  cost: number | null;
}

export interface HardwareRow extends Hardware {
  units: string[];
}

export interface UnitParts {
  item: KitchenItem;
  parts: Named[];
}

export interface CuttingList {
  rows: CuttingRow[];
  invalidParts: CuttingRow[];
  units: UnitParts[];
  /** Pieces added by hand. */
  extra: Array<Part & { materialName: string; customId: string }>;
  materials: MaterialTotal[];
  edges: EdgeTotal[];
  hardware: HardwareRow[];
  pieceCount: number;
  /** At least one line has a cost that can be shown, even if the total is unknown. */
  hasCosts: boolean;
  /** Total for all required sheets and edging; null for an incomplete or empty estimate. */
  cost: number | null;
}

/** Added to every banded edge for trimming the overhang. */
export const EDGE_TRIM_ALLOWANCE = 30;

type Named = Part & { materialName: string };

/** Board, then thickness, name, size and note, in the language's alphabetical order. */
function partOrder(locale: string, boardName: (id: string) => string): (a: Named, b: Named) => number {
  const collator = new Intl.Collator(locale);
  return (a, b) =>
    collator.compare(boardName(a.materialId), boardName(b.materialId)) ||
    b.thickness - a.thickness ||
    collator.compare(a.name, b.name) ||
    b.length - a.length ||
    b.width - a.width ||
    collator.compare(a.note ?? '', b.note ?? '');
}

/** Every piece of every unit, identical pieces grouped, with board, edging and hardware totals, in the labels' language. */
export function buildCuttingList(design: Design, labels: EngineLabels = EN_LABELS): CuttingList {
  const ctx = buildContext(design, labels);
  const sortNames = new Map(design.materials.map((m) => [m.id, labels.material(m)]));
  const compareParts = partOrder(labels.locale, (id) => sortNames.get(id) ?? labels.unknownBoard);
  const boardLabels = new Map(design.materials.map((m) => [m.id, boardLabel(m, labels)]));
  const materialName = (id: string) => boardLabels.get(id) ?? labels.unknownBoard;
  const bandName = (id: string | null) => {
    const band = id ? ctx.edgeBands.get(id) : undefined;
    return band ? labels.edgeBand(band) : null;
  };
  const units = design.items.map((item) => ({ item, parts: unitParts(item, ctx, design.partEdits[item.id]) }));
  const extra = design.customParts.map((custom) => ({ ...customPart(custom, ctx), materialName: materialName(custom.materialId), customId: custom.id }));

  const rows = new Map<string, CuttingRow>();
  const groups: Array<{ label: string; parts: Part[] }> = [
    ...units.map(({ item, parts }) => ({ label: item.label, parts })),
    { label: labels.extra, parts: extra },
  ];
  for (const { label, parts } of groups) {
    for (const p of parts) {
      // Set to none by hand: still listed under its unit, so it can be brought back.
      if (p.quantity === 0) continue;
      const key = [p.name, p.length, p.width, p.thickness, p.materialId, p.edges.length, p.edges.width, p.edgeBandId, p.note ?? '', p.edited ? 'edited' : ''].join('|');
      const row = rows.get(key);
      if (row) {
        row.quantity += p.quantity;
        if (!row.units.includes(label)) row.units.push(label);
      } else {
        rows.set(key, {
          ...p,
          materialName: materialName(p.materialId),
          bandName: bandName(p.edgeBandId),
          units: [label],
        });
      }
    }
  }
  const sortedRows = [...rows.values()].sort(compareParts);
  const invalidParts = sortedRows.filter((row) => !validPart(row) || !ctx.materials.has(row.materialId));
  const invalid = new Set(invalidParts);

  // Boards: area, and sheets by laying the pieces out on each material's sheet size.
  const byBoard = new Map<string, CuttingRow[]>();
  for (const row of sortedRows) {
    const key = `${row.materialId}|${row.thickness}`;
    byBoard.set(key, [...(byBoard.get(key) ?? []), row]);
  }
  const materials: MaterialTotal[] = [...byBoard.values()].map((boardRows) => {
    const first = boardRows[0];
    const material = ctx.materials.get(first.materialId);
    const validRows = boardRows.filter((row) => !invalid.has(row));
    const invalidCount = boardRows.filter((row) => invalid.has(row))
      .reduce((sum, row) => sum + (Number.isFinite(row.quantity) && row.quantity > 0 ? Math.ceil(row.quantity) : 1), 0);
    const sheetLength = material?.sheetLength ?? 2800;
    const sheetWidth = material?.sheetWidth ?? 2070;
    const pieces = validRows.flatMap((row) =>
      Array.from({ length: row.quantity }, () => ({ length: row.length, width: row.width, canRotate: !row.grain })),
    );
    const layout = nest(pieces, { sheetLength, sheetWidth, kerf: SAW_KERF, trim: SHEET_TRIM });
    return {
      materialId: first.materialId,
      materialName: first.materialName,
      thickness: first.thickness,
      pieces: pieces.length,
      area: validRows.reduce((sum, row) => sum + (row.area * row.quantity) / 1_000_000, 0),
      sheetLength,
      sheetWidth,
      sheets: layout.sheets,
      used: layout.used,
      oversize: layout.oversize,
      invalid: invalidCount,
      cost: material && material.price > 0 && layout.oversize === 0 && !invalidCount ? layout.sheets * material.price : null,
    };
  });

  const edgeMetres = new Map<string, number>();
  for (const row of sortedRows) {
    if (!row.edgeBandId || invalid.has(row)) continue;
    const edgeCount = row.edges.length + row.edges.width + (row.edgeLength > 0 && row.edges.length + row.edges.width === 0 ? 2 : 0);
    const millimetres = row.quantity * (row.edgeLength + edgeCount * EDGE_TRIM_ALLOWANCE);
    edgeMetres.set(row.edgeBandId, (edgeMetres.get(row.edgeBandId) ?? 0) + millimetres / 1000);
  }
  const edges: EdgeTotal[] = [...edgeMetres].map(([bandId, metres]) => {
    const band = ctx.edgeBands.get(bandId);
    const rounded = Math.ceil(metres * 10) / 10;
    return {
      bandId,
      name: bandName(bandId) ?? bandId,
      thickness: band?.thickness ?? 0,
      metres: rounded,
      cost: band && band.price > 0 ? rounded * band.price : null,
    };
  });

  const hardware = new Map<string, HardwareRow>();
  for (const item of design.items) {
    for (const h of unitHardware(item, ctx)) {
      const row = hardware.get(h.name);
      if (row) {
        row.quantity += h.quantity;
        if (!row.units.includes(item.label)) row.units.push(item.label);
      } else {
        hardware.set(h.name, { ...h, units: [item.label] });
      }
    }
  }

  const costs = [...materials, ...edges].map((line) => line.cost);
  return {
    rows: sortedRows,
    invalidParts,
    extra,
    units: units.map((u) => ({
      ...u,
      parts: [...u.parts]
        .map((p) => ({ ...p, materialName: materialName(p.materialId) }))
        .sort(compareParts),
    })),
    materials,
    edges,
    hardware: [...hardware.values()].sort((a, b) => a.name.localeCompare(b.name, labels.locale)),
    pieceCount: sortedRows.reduce((sum, row) => sum + (Number.isFinite(row.quantity) && row.quantity > 0 ? row.quantity : 0), 0),
    hasCosts: costs.some((cost) => cost !== null),
    cost: !invalidParts.length && costs.length > 0 && costs.every((cost) => cost !== null) ? costs.reduce((sum, c) => sum + c, 0) : null,
  };
}

export function assertCuttable(list: Pick<CuttingList, 'invalidParts'>, labels: EngineLabels = EN_LABELS): void {
  if (list.invalidParts.length) throw new RangeError(labels.invalidParts);
}

/** Edge banding of a row as "L1 W0"-style text, empty when there is none. */
export function edgeText(row: Pick<Part, 'edges' | 'edgeBandId' | 'edgeLength'>, labels: EngineLabels = EN_LABELS): string {
  if (!row.edgeBandId) return '';
  if (row.edges.length + row.edges.width === 0) return labels.innerEdges;
  return labels.edges(row.edges.length, row.edges.width);
}

/** A part's note, followed by "changed by hand" (or "left out by hand") when it was changed in the cutting list. */
export function partNote(part: Pick<Part, 'note' | 'edited' | 'quantity'>, labels: EngineLabels = EN_LABELS): string {
  const hand = part.edited ? (part.quantity <= 0 ? labels.leftOutByHand : labels.changedByHand) : '';
  return [part.note, hand].filter(Boolean).join('; ');
}

/**
 * The grouped cutting list as delimited text: semicolons for a CSV file
 * (spreadsheet programs open it directly), tabs for pasting into a sheet.
 * Numbers use the language's decimal mark, as its spreadsheets expect.
 */
export function cuttingListCsv(list: CuttingList, separator: ';' | '\t' = ';', labels: EngineLabels = EN_LABELS): string {
  assertCuttable(list, labels);
  const special = separator === ';' ? /[";\n]/ : /["\t\n]/;
  const escape = (value: string) => (special.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = list.rows.map((row) =>
    [
      row.name,
      String(row.quantity),
      labels.mm(row.length),
      labels.mm(row.width),
      labels.mm(row.thickness),
      row.materialName,
      edgeText(row, labels),
      row.bandName ?? '',
      row.units.join(', '),
      partNote(row, labels),
    ]
      .map(escape)
      .join(separator),
  );
  return [labels.csvHeader.map(escape).join(separator), ...lines].join('\r\n');
}
