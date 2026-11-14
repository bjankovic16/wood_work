import type { Design, KitchenItem } from '../domain/types';
import { buildContext } from './config';
import { unitHardware, type Hardware } from './hardware';
import { nest, SAW_KERF, SHEET_TRIM } from './nesting';
import { customPart, unitParts, type Part } from './parts';

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
  /** Square metres of parts. */
  area: number;
  sheetLength: number;
  sheetWidth: number;
  /** Sheets needed, by the shelf-layout estimate. */
  sheets: number;
  /** Share of the bought sheets that ends up as parts. */
  used: number;
  /** Pieces too large for the sheet. */
  oversize: number;
  /** Sheets × price; null when the material has no price. */
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
  parts: Part[];
}

export interface CuttingList {
  rows: CuttingRow[];
  units: UnitParts[];
  /** Pieces added by hand. */
  extra: Array<Part & { materialName: string; customId: string }>;
  materials: MaterialTotal[];
  edges: EdgeTotal[];
  hardware: HardwareRow[];
  pieceCount: number;
  /** Sum of all priced materials and edge bands; null when nothing is priced. */
  cost: number | null;
}

/** How pieces added by hand appear in the Units column. */
export const EXTRA_LABEL = 'Extra';

/** Added to every banded edge for trimming the overhang. */
export const EDGE_TRIM_ALLOWANCE = 30;

function compareParts(a: Part & { materialName: string }, b: Part & { materialName: string }): number {
  return (
    a.materialName.localeCompare(b.materialName) ||
    b.thickness - a.thickness ||
    a.name.localeCompare(b.name) ||
    b.length - a.length ||
    b.width - a.width ||
    (a.note ?? '').localeCompare(b.note ?? '')
  );
}

/** Every piece of every unit, identical pieces grouped, with board, edging and hardware totals. */
export function buildCuttingList(design: Design): CuttingList {
  const ctx = buildContext(design);
  const materialName = (id: string) => ctx.materials.get(id)?.name ?? 'Unknown board';
  const units = design.items.map((item) => ({ item, parts: unitParts(item, ctx, design.partEdits[item.id]) }));
  const extra = design.customParts.map((custom) => ({ ...customPart(custom, ctx), materialName: materialName(custom.materialId), customId: custom.id }));

  const rows = new Map<string, CuttingRow>();
  const groups: Array<{ label: string; parts: Part[] }> = [
    ...units.map(({ item, parts }) => ({ label: item.label, parts })),
    { label: EXTRA_LABEL, parts: extra },
  ];
  for (const { label, parts } of groups) {
    for (const p of parts) {
      const key = [p.name, p.length, p.width, p.thickness, p.materialId, p.edges.length, p.edges.width, p.edgeBandId, p.note ?? '', p.edited ? 'edited' : ''].join('|');
      const row = rows.get(key);
      if (row) {
        row.quantity += p.quantity;
        if (!row.units.includes(label)) row.units.push(label);
      } else {
        rows.set(key, {
          ...p,
          materialName: materialName(p.materialId),
          bandName: p.edgeBandId ? (ctx.edgeBands.get(p.edgeBandId)?.name ?? null) : null,
          units: [label],
        });
      }
    }
  }
  const sortedRows = [...rows.values()].sort(compareParts);

  // Boards: area, and sheets by laying the pieces out on each material's sheet size.
  const byBoard = new Map<string, CuttingRow[]>();
  for (const row of sortedRows) {
    const key = `${row.materialId}|${row.thickness}`;
    byBoard.set(key, [...(byBoard.get(key) ?? []), row]);
  }
  const materials: MaterialTotal[] = [...byBoard.values()].map((boardRows) => {
    const first = boardRows[0];
    const material = ctx.materials.get(first.materialId);
    const sheetLength = material?.sheetLength ?? 2800;
    const sheetWidth = material?.sheetWidth ?? 2070;
    const pieces = boardRows.flatMap((row) =>
      Array.from({ length: row.quantity }, () => ({ length: row.length, width: row.width, canRotate: !row.grain })),
    );
    const layout = nest(pieces, { sheetLength, sheetWidth, kerf: SAW_KERF, trim: SHEET_TRIM });
    return {
      materialId: first.materialId,
      materialName: first.materialName,
      thickness: first.thickness,
      pieces: pieces.length,
      area: boardRows.reduce((sum, row) => sum + (row.area * row.quantity) / 1_000_000, 0),
      sheetLength,
      sheetWidth,
      sheets: layout.sheets,
      used: layout.used,
      oversize: layout.oversize,
      cost: material && material.price > 0 ? layout.sheets * material.price : null,
    };
  });

  const edgeMetres = new Map<string, number>();
  for (const row of sortedRows) {
    if (!row.edgeBandId) continue;
    const edgeCount = row.edges.length + row.edges.width + (row.edgeLength > 0 && row.edges.length + row.edges.width === 0 ? 2 : 0);
    const millimetres = row.quantity * (row.edgeLength + edgeCount * EDGE_TRIM_ALLOWANCE);
    edgeMetres.set(row.edgeBandId, (edgeMetres.get(row.edgeBandId) ?? 0) + millimetres / 1000);
  }
  const edges: EdgeTotal[] = [...edgeMetres].map(([bandId, metres]) => {
    const band = ctx.edgeBands.get(bandId);
    const rounded = Math.ceil(metres * 10) / 10;
    return {
      bandId,
      name: band?.name ?? 'Edge band',
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

  const prices = [...materials.map((m) => m.cost), ...edges.map((e) => e.cost)].filter((c): c is number => c !== null);
  return {
    rows: sortedRows,
    extra,
    units: units.map((u) => ({
      ...u,
      parts: [...u.parts]
        .map((p) => ({ ...p, materialName: materialName(p.materialId) }))
        .sort(compareParts),
    })),
    materials,
    edges,
    hardware: [...hardware.values()].sort((a, b) => a.name.localeCompare(b.name)),
    pieceCount: sortedRows.reduce((sum, row) => sum + row.quantity, 0),
    cost: prices.length > 0 ? prices.reduce((sum, c) => sum + c, 0) : null,
  };
}

/** Formats a length for display: whole millimetres without decimals, otherwise one decimal. */
export function formatMm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Edge banding of a row as "L1 W0"-style text, empty when there is none. */
export function edgeText(row: Pick<Part, 'edges' | 'edgeBandId' | 'edgeLength'>): string {
  if (!row.edgeBandId) return '';
  if (row.edges.length + row.edges.width === 0) return 'inner L edges';
  return `L${row.edges.length} W${row.edges.width}`;
}

/**
 * The grouped cutting list as delimited text: semicolons for a CSV file
 * (spreadsheet programs open it directly), tabs for pasting into a sheet.
 */
export function cuttingListCsv(list: CuttingList, separator: ';' | '\t' = ';'): string {
  const special = separator === ';' ? /[";\n]/ : /["\t\n]/;
  const escape = (value: string) => (special.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = ['Piece', 'Quantity', 'Length (mm)', 'Width (mm)', 'Thickness (mm)', 'Material', 'Edges', 'Edge band', 'Units', 'Note'];
  const lines = list.rows.map((row) =>
    [
      row.name,
      String(row.quantity),
      formatMm(row.length),
      formatMm(row.width),
      formatMm(row.thickness),
      row.materialName,
      edgeText(row),
      row.bandName ?? '',
      row.units.join(', '),
      row.note ?? '',
    ]
      .map(escape)
      .join(separator),
  );
  return [header.join(separator), ...lines].join('\r\n');
}
