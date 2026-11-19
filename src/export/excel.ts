import type { Design } from '../domain/types';
import { partNote, type CuttingList } from '../engine/cuttingList';
import { boardLabel } from '../engine/materialLabel';
import type { Part } from '../engine/parts';
import { en, type Messages } from '../i18n/en';

type ExcelModule = typeof import('exceljs');
type Worksheet = import('exceljs').Worksheet;

/** The library is only downloaded when someone exports. */
async function loadExcel(): Promise<ExcelModule> {
  const mod = (await import('exceljs')) as ExcelModule & { default?: ExcelModule };
  return mod.default ?? mod;
}

interface Column {
  header: string;
  key: string;
  width: number;
  numeric?: boolean;
}

function addTable(sheet: Worksheet, columns: Column[], rows: Array<Record<string, string | number | null>>): void {
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  for (const row of rows) sheet.addRow(row);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FF27272A' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
  header.alignment = { vertical: 'middle' };
  columns.forEach((c, i) => {
    if (c.numeric) sheet.getColumn(i + 1).alignment = { horizontal: 'right' };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (rows.length > 0) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

function partColumns(t: Messages): Column[] {
  const c = t.report.columns;
  return [
    { header: c.piece, key: 'name', width: 22 },
    { header: c.qty, key: 'quantity', width: 6, numeric: true },
    { header: c.length, key: 'length', width: 12, numeric: true },
    { header: c.width, key: 'width', width: 12, numeric: true },
    { header: c.thickness, key: 'thickness', width: 14, numeric: true },
    { header: c.material, key: 'material', width: 34 },
    { header: c.grain, key: 'grain', width: 8 },
    { header: c.edgesLength, key: 'edgesLength', width: 18, numeric: true },
    { header: c.edgesWidth, key: 'edgesWidth', width: 17, numeric: true },
    { header: c.band, key: 'band', width: 18 },
  ];
}

function partRow(part: Part & { materialName: string }, bandName: (id: string | null) => string, t: Messages): Record<string, string | number | null> {
  return {
    name: part.name,
    quantity: part.quantity,
    length: part.length,
    width: part.width,
    thickness: part.thickness,
    material: part.materialName,
    grain: part.grain ? t.report.yes : '',
    edgesLength: part.edges.length,
    edgesWidth: part.edges.width,
    band: bandName(part.edgeBandId),
  };
}

/**
 * The whole cutting list as an Excel workbook: parts, parts by unit, boards
 * and edging, hardware, project. Words come from `t`; the list should be
 * built in the same language.
 */
export async function cuttingListWorkbook(design: Design, list: CuttingList, generated = new Date(), t: Messages = en): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const r = t.report;
  const col = r.columns;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = t.appName;
  workbook.created = generated;
  workbook.title = r.title(design.name);
  const bandName = (id: string | null) => {
    const band = id ? design.edgeBands.find((b) => b.id === id) : undefined;
    return band ? t.engine.edgeBand(band) : '';
  };
  addTable(
    workbook.addWorksheet(r.sheetNames.parts),
    [...partColumns(t), { header: col.units, key: 'units', width: 22 }, { header: col.note, key: 'note', width: 44 }],
    list.rows.map((row) => ({ ...partRow(row, bandName, t), units: row.units.join(', '), note: partNote(row, t.engine) })),
  );

  addTable(
    workbook.addWorksheet(r.sheetNames.byUnit),
    [
      { header: col.unit, key: 'unit', width: 8 },
      { header: col.type, key: 'type', width: 22 },
      { header: col.unitSize, key: 'size', width: 22 },
      ...partColumns(t),
      { header: col.note, key: 'note', width: 44 },
    ],
    [
      ...list.units.flatMap(({ item, parts }) =>
        parts.map((part) => ({
          unit: item.label,
          type: t.kinds[item.kind],
          size: `${item.width} × ${item.height} × ${item.depth}`,
          ...partRow(part, bandName, t),
          note: partNote(part, t.engine),
        })),
      ),
      ...list.extra.map((part) => ({ unit: t.engine.extra, type: r.addedByHand, size: '', ...partRow(part, bandName, t), note: part.note ?? '' })),
    ],
  );

  const materials = workbook.addWorksheet(r.sheetNames.materials);
  addTable(
    materials,
    [
      { header: col.boardOrBand, key: 'name', width: 34 },
      { header: col.thickness, key: 'thickness', width: 14, numeric: true },
      { header: col.pieces, key: 'pieces', width: 8, numeric: true },
      { header: col.area, key: 'area', width: 11, numeric: true },
      { header: col.sheet, key: 'sheet', width: 14 },
      { header: col.sheetsNeeded, key: 'sheets', width: 14, numeric: true },
      { header: col.used, key: 'used', width: 8, numeric: true },
      { header: col.edgeMetres, key: 'metres', width: 16, numeric: true },
      { header: col.cost, key: 'cost', width: 12, numeric: true },
    ],
    [
      ...list.materials.map((m) => ({
        name: m.materialName,
        thickness: m.thickness,
        pieces: m.pieces,
        area: Math.round(m.area * 100) / 100,
        sheet: `${m.sheetLength} × ${m.sheetWidth}`,
        sheets: m.sheets,
        used: Math.round(m.used * 100) / 100,
        metres: null,
        cost: m.cost,
      })),
      ...list.edges.map((e) => ({ name: e.name, thickness: e.thickness, pieces: null, area: null, sheet: '', sheets: null, used: null, metres: e.metres, cost: e.cost })),
    ],
  );
  materials.getColumn('used').numFmt = '0%';
  materials.getColumn('cost').numFmt = '#,##0.00';
  materials.getColumn('cost').hidden = !list.hasCosts;
  if (list.cost !== null) {
    const total = materials.addRow({ name: r.total, cost: list.cost });
    total.font = { bold: true };
  }

  addTable(
    workbook.addWorksheet(r.sheetNames.hardware),
    [
      { header: col.item, key: 'name', width: 38 },
      { header: col.qty, key: 'quantity', width: 6, numeric: true },
      { header: col.units, key: 'units', width: 40 },
    ],
    list.hardware.map((h) => ({ name: h.name, quantity: h.quantity, units: h.units.join(', ') })),
  );

  const project = workbook.addWorksheet(r.sheetNames.project);
  project.columns = [{ width: 28 }, { width: 48 }];
  const c = design.construction;
  const board = (id: string) => {
    const m = design.materials.find((x) => x.id === id);
    return m ? boardLabel(m, t.engine) : t.engine.unknownBoard;
  };
  const f = r.facts;
  const v = r.values;
  const facts: Array<[string, string | number]> = [
    [f.project, design.name],
    [f.generated, t.dateTime(generated)],
    [f.room, v.room(design.room.width, design.room.depth, design.room.height)],
    [f.units, design.items.length],
    [f.pieces, list.pieceCount],
    [f.carcass, board(c.carcassMaterial)],
    [f.backs, v.backs(board(c.backMaterial), c.backMount === 'groove')],
    [f.fronts, v.fronts(board(c.frontMaterial), c.doorType === 'inset', c.frontGap)],
    [f.bottom, v.bottom(c.bottomJoint === 'under')],
    [f.topOfBase, v.topOfBase(c.baseTop === 'rails' ? c.railWidth : null)],
    [f.drawers, v.drawers(c.drawerSystem === 'metal')],
    [f.edgeBanding, v.edgeBanding(c.subtractEdges)],
  ];
  for (const [label, value] of facts) project.addRow([label, value]).getCell(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
