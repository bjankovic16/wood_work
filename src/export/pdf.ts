import { KIND_SPECS } from '../domain/catalog';
import type { Design } from '../domain/types';
import type { Issue } from '../engine/checks';
import { edgeText, formatMm, type CuttingList } from '../engine/cuttingList';
import type { Part } from '../engine/parts';
import { planSvg } from './planSvg';

/* pdfmake document definitions are plain objects; these are the shapes used here. */
type Cell = string | { text: string; [key: string]: unknown };
type Row = Cell[];

const MUTED = '#71717a';

const tableLayout = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 0.6 : 0.3),
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i <= 1 ? '#a1a1aa' : '#e4e4e7'),
  fillColor: (row: number) => (row === 0 ? '#f4f4f5' : null),
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 2.5,
  paddingBottom: () => 2.5,
};

const header = (labels: string[], rightAligned: number[] = []): Row =>
  labels.map((text, i) => ({ text, bold: true, fontSize: 7.5, color: '#3f3f46', ...(rightAligned.includes(i) ? { alignment: 'right' } : {}) }));
const right = (text: string, bold = false): Cell => ({ text, alignment: 'right', ...(bold ? { bold: true } : {}) });
const money = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function partCells(part: Part, materialName: string, bandThickness: (id: string | null) => number | null): Row {
  const band = bandThickness(part.edgeBandId);
  return [
    { text: part.name + (part.edited ? ' *' : ''), bold: true },
    right(String(part.quantity), true),
    right(formatMm(part.length)),
    right(formatMm(part.width)),
    right(formatMm(part.thickness)),
    materialName + (part.grain ? ' (grain)' : ''),
    part.edgeBandId ? `${edgeText(part)}${band !== null ? ` · ${formatMm(band)} mm` : ''}` : '—',
  ];
}

/**
 * The cutting list as a pdfmake document: plan and totals first, then every
 * piece (identical pieces together), the hardware, and the pieces of each unit.
 */
export function cuttingListDocument(design: Design, list: CuttingList, issues: Issue[], generated = new Date()): object {
  const date = generated.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const materialName = (id: string) => design.materials.find((m) => m.id === id)?.name ?? '';
  const bandThickness = (id: string | null) => (id ? (design.edgeBands.find((b) => b.id === id)?.thickness ?? null) : null);
  const plan = planSvg(design);
  const planWidth = 400;
  const planHeight = Math.min(330, (planWidth * plan.height) / plan.width);
  const errors = issues.filter((i) => i.severity === 'error');
  const edited = list.rows.some((r) => r.edited) || list.units.some((u) => u.parts.some((p) => p.edited));
  const c = design.construction;
  const material = (id: string) => {
    const m = design.materials.find((x) => x.id === id);
    return m ? `${m.name}, ${formatMm(m.thickness)} mm` : '';
  };

  const totals: Row[] = [
    header(['Board', 'Pieces', 'Area m²', 'Sheets', 'Cost'], [1, 2, 3, 4]),
    ...list.materials.map((m) => [
      `${m.materialName} ${formatMm(m.thickness)} mm`,
      right(String(m.pieces)),
      right(m.area.toFixed(2)),
      right(`${m.sheets} × ${m.sheetLength}×${m.sheetWidth}`),
      right(m.cost === null ? '—' : money(m.cost)),
    ]),
    ...list.edges.map((e) => [`${e.name} (edge banding)`, right(''), right(`${formatMm(e.metres)} m`), right(''), right(e.cost === null ? '—' : money(e.cost))]),
  ];

  const content: object[] = [
    { text: design.name, fontSize: 18, bold: true, color: '#18181b' },
    {
      text: `Cutting list · ${date} · room ${design.room.width} × ${design.room.depth} × ${design.room.height} mm · ${design.items.length} units · ${list.pieceCount} pieces · all sizes in mm`,
      color: MUTED,
      margin: [0, 2, 0, 10],
    },
  ];
  if (errors.length > 0) {
    content.push({
      table: {
        widths: ['*'],
        body: [[{ text: [{ text: 'Fix before cutting: ', bold: true }, errors.map((e) => e.message).join(' ')], color: '#991b1b' }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#fef2f2', paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 },
      margin: [0, 0, 0, 10],
    });
  }
  content.push({
    columns: [
      { svg: plan.svg, width: planWidth, height: planHeight },
      {
        width: '*',
        stack: [
          { text: 'Materials', bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
          { table: { headerRows: 1, widths: ['*', 32, 40, 78, 44], body: totals }, layout: tableLayout },
          ...(list.cost !== null ? [{ text: `Material cost: ${money(list.cost)}`, bold: true, alignment: 'right', margin: [0, 4, 0, 0] }] : []),
          { text: 'Sheets are a safe estimate (4 mm saw cut, 10 mm edge trim). Edge banding includes 30 mm per edge for trimming.', fontSize: 7, color: MUTED, margin: [0, 4, 0, 10] },
          { text: 'Construction', bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
          {
            ul: [
              `Carcass: ${material(c.carcassMaterial)}; bottom ${c.bottomJoint === 'between' ? 'between' : 'under'} the sides; ${c.baseTop === 'rails' ? `base units have two ${c.railWidth} mm rails` : 'full tops'}`,
              `Backs: ${material(c.backMaterial)}, ${c.backMount === 'nailed' ? 'nailed on' : 'set into grooves'}`,
              `Fronts: ${material(c.frontMaterial)}, ${c.doorType === 'inset' ? 'inset' : 'full overlay'}, ${c.frontGap} mm gaps`,
              `Drawers: ${c.drawerSystem === 'wooden' ? 'wooden boxes on slides' : 'metal drawer system'}`,
              `Edge banding ${c.subtractEdges ? 'is subtracted from the cut sizes' : 'is not subtracted: sizes are finished sizes'}`,
            ],
            fontSize: 7.5,
            color: '#3f3f46',
          },
        ],
        margin: [16, 0, 0, 0],
      },
    ],
    columnGap: 0,
  });

  content.push({ text: 'Parts', fontSize: 13, bold: true, margin: [0, 14, 0, 4], pageBreak: 'before' });
  content.push({
    table: {
      headerRows: 1,
      widths: [100, 24, 40, 40, 28, 150, 70, 90, '*'],
      body: [
        header(['Piece', 'Qty', 'Length', 'Width', 'Thick.', 'Material', 'Edges L/W', 'Units', 'Note'], [1, 2, 3, 4]),
        ...list.rows.map((row) => [...partCells(row, row.materialName, bandThickness), row.units.join(', '), { text: row.note ?? '', color: MUTED }]),
      ],
    },
    layout: tableLayout,
  });
  if (edited) content.push({ text: '* Changed by hand in the cutting list.', fontSize: 7, color: MUTED, margin: [0, 3, 0, 0] });

  if (list.hardware.length > 0) {
    content.push({ text: 'Hardware', fontSize: 13, bold: true, margin: [0, 14, 0, 4] });
    content.push({
      table: {
        headerRows: 1,
        widths: [220, 30, '*'],
        body: [header(['Item', 'Qty', 'Units'], [1]), ...list.hardware.map((h) => [h.name, right(String(h.quantity), true), h.units.join(', ')])],
      },
      layout: tableLayout,
    });
  }

  content.push({ text: 'Parts by unit', fontSize: 13, bold: true, margin: [0, 14, 0, 4], pageBreak: 'before' });
  const unitTable = (parts: Array<Part & { materialName?: string }>) => ({
    table: {
      headerRows: 1,
      widths: [110, 24, 40, 40, 28, 170, 80, '*'],
      body: [
        header(['Piece', 'Qty', 'Length', 'Width', 'Thick.', 'Material', 'Edges L/W', 'Note'], [1, 2, 3, 4]),
        ...parts.map((p) => [...partCells(p, p.materialName ?? materialName(p.materialId), bandThickness), { text: p.note ?? '', color: MUTED }]),
      ],
    },
    layout: tableLayout,
    margin: [0, 0, 0, 10],
  });
  for (const { item, parts } of list.units) {
    if (parts.length === 0) continue;
    content.push({
      stack: [
        { text: [{ text: `${item.label}  `, bold: true }, { text: `${KIND_SPECS[item.kind].name} · ${item.width} × ${item.height} × ${item.depth} mm`, color: MUTED }], margin: [0, 0, 0, 3] },
        unitTable(parts),
      ],
      unbreakable: parts.length <= 14,
    });
  }
  if (list.extra.length > 0) {
    content.push({ text: 'Extra pieces', bold: true, margin: [0, 0, 0, 3] });
    content.push(unitTable(list.extra));
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 34, 28, 34],
    info: { title: `${design.name}: cutting list`, creator: 'Kitchen Designer' },
    defaultStyle: { font: 'Roboto', fontSize: 8, color: '#27272a' },
    header: (page: number) =>
      page === 1 ? null : { text: `${design.name} · cutting list`, fontSize: 7, color: MUTED, alignment: 'right', margin: [28, 14, 28, 0] },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `Kitchen Designer · ${date}`, fontSize: 7, color: MUTED },
        { text: `Page ${page} of ${pages}`, fontSize: 7, color: MUTED, alignment: 'right' },
      ],
      margin: [28, 10, 28, 0],
    }),
    content,
  };
}

/** Renders the cutting list to a PDF. pdfmake and its font are only downloaded when needed. */
export async function cuttingListPdf(design: Design, list: CuttingList, issues: Issue[]): Promise<Blob> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake.createPdf(cuttingListDocument(design, list, issues)).getBlob();
}
