/**
 * Sheet estimate: lays pieces onto sheets in rows (a guillotine "shelf"
 * layout, first fit by decreasing height). Real cutting software packs
 * tighter, so this is an upper bound on the sheets needed, never a lower one.
 */

export interface NestPiece {
  length: number;
  width: number;
  /** May be turned 90° on the sheet (no grain to follow). */
  canRotate: boolean;
}

export interface NestOptions {
  sheetLength: number;
  sheetWidth: number;
  /** Saw blade width, lost between neighbouring pieces. */
  kerf: number;
  /** Trimmed off every sheet edge before cutting. */
  trim: number;
}

export interface Placement {
  sheet: number;
  x: number;
  y: number;
  length: number;
  width: number;
}

export interface NestResult {
  sheets: number;
  /** Share of the sheet area that ends up as parts (0–1). */
  used: number;
  /** Pieces larger than a sheet, which cannot be placed at all. */
  oversize: number;
  placements: Placement[];
}

export const SAW_KERF = 4;
export const SHEET_TRIM = 10;

interface Shelf {
  y: number;
  height: number;
  usedLength: number;
}

export function nest(pieces: NestPiece[], options: NestOptions): NestResult {
  const usableLength = options.sheetLength - 2 * options.trim;
  const usableWidth = options.sheetWidth - 2 * options.trim;
  const { kerf } = options;

  // Lay each piece with its longer side along the sheet when that fits (it always must with grain).
  const oriented: Array<{ length: number; width: number }> = [];
  let oversize = 0;
  for (const p of pieces) {
    const along = { length: Math.max(p.length, p.width), width: Math.min(p.length, p.width) };
    const across = { length: along.width, width: along.length };
    const fitsAlong = along.length <= usableLength && along.width <= usableWidth;
    const fitsAcross = p.canRotate && across.length <= usableLength && across.width <= usableWidth;
    if (fitsAlong) oriented.push(along);
    else if (fitsAcross) oriented.push(across);
    else oversize++;
  }
  oriented.sort((a, b) => b.width - a.width || b.length - a.length);

  const sheets: Shelf[][] = [];
  const placements: Placement[] = [];
  for (const p of oriented) {
    let placed = false;
    for (let s = 0; s < sheets.length && !placed; s++) {
      for (const shelf of sheets[s]) {
        if (p.width <= shelf.height && shelf.usedLength + p.length <= usableLength) {
          placements.push({ sheet: s, x: options.trim + shelf.usedLength, y: options.trim + shelf.y, length: p.length, width: p.width });
          shelf.usedLength += p.length + kerf;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const last = sheets[s][sheets[s].length - 1];
        const top = last ? last.y + last.height + kerf : 0;
        if (top + p.width <= usableWidth) {
          sheets[s].push({ y: top, height: p.width, usedLength: p.length + kerf });
          placements.push({ sheet: s, x: options.trim, y: options.trim + top, length: p.length, width: p.width });
          placed = true;
        }
      }
    }
    if (!placed) {
      sheets.push([{ y: 0, height: p.width, usedLength: p.length + kerf }]);
      placements.push({ sheet: sheets.length - 1, x: options.trim, y: options.trim, length: p.length, width: p.width });
    }
  }

  const partsArea = oriented.reduce((sum, p) => sum + p.length * p.width, 0);
  const sheetArea = options.sheetLength * options.sheetWidth;
  return {
    sheets: sheets.length,
    used: sheets.length > 0 ? partsArea / (sheets.length * sheetArea) : 0,
    oversize,
    placements,
  };
}
