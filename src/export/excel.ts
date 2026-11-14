import { KIND_SPECS } from '../domain/catalog';
import type { Design } from '../domain/types';
import type { CuttingList } from '../engine/cuttingList';
import type { Part } from '../engine/parts';

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

const PART_COLUMNS: Column[] = [
  { header: 'Piece', key: 'name', width: 22 },
  { header: 'Qty', key: 'quantity', width: 6, numeric: true },
  { header: 'Length (mm)', key: 'length', width: 12, numeric: true },
  { header: 'Width (mm)', key: 'width', width: 12, numeric: true },
  { header: 'Thickness (mm)', key: 'thickness', width: 14, numeric: true },
  { header: 'Material', key: 'material', width: 34 },
  { header: 'Grain', key: 'grain', width: 8 },
  { header: 'Edges along length', key: 'edgesLength', width: 18, numeric: true },
  { header: 'Edges along width', key: 'edgesWidth', width: 17, numeric: true },
  { header: 'Edge band', key: 'band', width: 18 },
];

function partRow(part: Part & { materialName: string }, bandName: (id: string | null) => string): Record<string, string | number | null> {
  return {
    name: part.name,
    quantity: part.quantity,
    length: part.length,
    width: part.width,
    thickness: part.thickness,
    material: part.materialName,
    grain: part.grain ? 'yes' : '',
    edgesLength: part.edges.length,
    edgesWidth: part.edges.width,
    band: bandName(part.edgeBandId),
  };
}

/** The whole cutting list as an Excel workbook: parts, parts by unit, boards and edging, hardware, project. */
export async function cuttingListWorkbook(design: Design, list: CuttingList, generated = new Date()): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kitchen Designer';
  workbook.created = generated;
  workbook.title = `${design.name}: cutting list`;
  const bandName = (id: string | null) => (id ? (design.edgeBands.find((b) => b.id === id)?.name ?? '') : '');

  addTable(
    workbook.addWorksheet('Cutting list'),
    [...PART_COLUMNS, { header: 'Units', key: 'units', width: 22 }, { header: 'Note', key: 'note', width: 44 }],
    list.rows.map((row) => ({ ...partRow(row, bandName), units: row.units.join(', '), note: [row.note, row.edited ? 'changed by hand' : ''].filter(Boolean).join('; ') })),
  );

  addTable(
    workbook.addWorksheet('By unit'),
    [
      { header: 'Unit', key: 'unit', width: 8 },
      { header: 'Type', key: 'type', width: 22 },
      { header: 'Unit size (W × H × D)', key: 'size', width: 22 },
      ...PART_COLUMNS,
      { header: 'Note', key: 'note', width: 44 },
    ],
    [
      ...list.units.flatMap(({ item, parts }) =>
        parts.map((part) => ({
          unit: item.label,
          type: KIND_SPECS[item.kind].name,
          size: `${item.width} × ${item.height} × ${item.depth}`,
          ...partRow({ ...part, materialName: design.materials.find((m) => m.id === part.materialId)?.name ?? '' }, bandName),
          note: [part.note, part.edited ? 'changed by hand' : ''].filter(Boolean).join('; '),
        })),
      ),
      ...list.extra.map((part) => ({ unit: 'Extra', type: 'Added by hand', size: '', ...partRow(part, bandName), note: part.note ?? '' })),
    ],
  );

  const materials = workbook.addWorksheet('Materials');
  addTable(
    materials,
    [
      { header: 'Board or edge band', key: 'name', width: 34 },
      { header: 'Thickness (mm)', key: 'thickness', width: 14, numeric: true },
      { header: 'Pieces', key: 'pieces', width: 8, numeric: true },
      { header: 'Area (m²)', key: 'area', width: 11, numeric: true },
      { header: 'Sheet (mm)', key: 'sheet', width: 14 },
      { header: 'Sheets needed', key: 'sheets', width: 14, numeric: true },
      { header: 'Used', key: 'used', width: 8, numeric: true },
      { header: 'Edge banding (m)', key: 'metres', width: 16, numeric: true },
      { header: 'Cost', key: 'cost', width: 12, numeric: true },
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
  if (list.cost !== null) {
    const total = materials.addRow({ name: 'Total', cost: list.cost });
    total.font = { bold: true };
  }

  addTable(
    workbook.addWorksheet('Hardware'),
    [
      { header: 'Item', key: 'name', width: 38 },
      { header: 'Qty', key: 'quantity', width: 6, numeric: true },
      { header: 'Units', key: 'units', width: 40 },
    ],
    list.hardware.map((h) => ({ name: h.name, quantity: h.quantity, units: h.units.join(', ') })),
  );

  const project = workbook.addWorksheet('Project');
  project.columns = [{ width: 28 }, { width: 48 }];
  const c = design.construction;
  const material = (id: string) => {
    const m = design.materials.find((x) => x.id === id);
    return m ? `${m.name}, ${m.thickness} mm` : '';
  };
  const facts: Array<[string, string | number]> = [
    ['Project', design.name],
    ['Generated', generated.toLocaleString()],
    ['Room (W × D × H)', `${design.room.width} × ${design.room.depth} × ${design.room.height} mm`],
    ['Units', design.items.length],
    ['Pieces', list.pieceCount],
    ['Carcass', material(c.carcassMaterial)],
    ['Back panels', `${material(c.backMaterial)}, ${c.backMount === 'nailed' ? 'nailed on' : 'in grooves'}`],
    ['Fronts', `${material(c.frontMaterial)}, ${c.doorType === 'inset' ? 'inset' : 'full overlay'}, ${c.frontGap} mm gaps`],
    ['Bottom panel', c.bottomJoint === 'between' ? 'between the sides' : 'under the sides'],
    ['Top of base units', c.baseTop === 'rails' ? `two ${c.railWidth} mm rails` : 'full top'],
    ['Drawers', c.drawerSystem === 'wooden' ? 'wooden boxes on slides' : 'metal drawer system'],
    ['Edge banding', c.subtractEdges ? 'subtracted from the cut sizes' : 'cut sizes are finished sizes'],
  ];
  for (const [label, value] of facts) project.addRow([label, value]).getCell(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
