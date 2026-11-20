import type { Design } from '../domain/types';
import type { Issue } from '../engine/checks';
import { assertCuttable, edgeText, partNote, type CuttingList } from '../engine/cuttingList';
import { boardLabel } from '../engine/materialLabel';
import type { Part } from '../engine/parts';
import { en, type Messages } from '../i18n/en';
import { planSvg } from './planSvg';
import { isWallMounted } from '../domain/geometry';
import { inUpperRow, upperCabinetRows } from '../domain/upperCabinets';

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

function partCells(part: Part, materialName: string, bandThickness: (id: string | null) => number | null, t: Messages): Row {
  const band = bandThickness(part.edgeBandId);
  return [
    { text: part.name + (part.edited ? ' *' : ''), bold: true },
    right(String(part.quantity), true),
    right(t.mm(part.length)),
    right(t.mm(part.width)),
    right(t.mm(part.thickness)),
    materialName + (part.grain ? t.report.grain : ''),
    part.edgeBandId ? `${edgeText(part, t.engine)}${band !== null ? ` · ${t.mm(band)} mm` : ''}` : '—',
  ];
}

/**
 * The cutting list as a pdfmake document: plan and totals first, then every
 * piece (identical pieces together), the hardware, and the pieces of each unit.
 * Words come from `t`; the list should be built in the same language.
 */
export function cuttingListDocument(design: Design, list: CuttingList, issues: Issue[], generated = new Date(), t: Messages = en): object {
  assertCuttable(list, t.engine);
  const r = t.report;
  const date = t.date(generated);
  const bandThickness = (id: string | null) => (id ? (design.edgeBands.find((b) => b.id === id)?.thickness ?? null) : null);
  const rows = upperCabinetRows(design.items);
  const plan = planSvg(design, t.engine, rows.length > 1 ? design.items.filter((item) => !isWallMounted(item)) : design.items);
  const planWidth = 400;
  const planHeight = Math.min(330, (planWidth * plan.height) / plan.width);
  const errors = issues.filter((i) => i.severity === 'error');
  const edited = list.rows.some((row) => row.edited) || list.units.some((u) => u.parts.some((p) => p.edited));
  const c = design.construction;
  const board = (id: string) => {
    const m = design.materials.find((x) => x.id === id);
    return m ? boardLabel(m, t.engine) : t.engine.unknownBoard;
  };

  const costCell = (cost: number | null): Cell[] => list.hasCosts ? [right(cost !== null ? t.money(cost) : '')] : [];
  const totals: Row[] = [
    header([r.board, r.pieces, r.area, r.sheets, ...(list.hasCosts ? [r.cost] : [])], [1, 2, 3, 4]),
    ...list.materials.map((m) => [
      m.materialName,
      right(String(m.pieces)),
      right(t.decimal(m.area, 2)),
      right(`${m.sheets} × ${m.sheetLength}×${m.sheetWidth}`),
      ...costCell(m.cost),
    ]),
    ...list.edges.map((e) => [r.edgeBandingRow(e.name), right(''), right(`${t.mm(e.metres)} m`), right(''), ...costCell(e.cost)]),
  ];

  const content: object[] = [
    { text: design.name, fontSize: 18, bold: true, color: '#18181b' },
    {
      text: r.subtitle(date, design.room.width, design.room.depth, design.room.height, design.items.length, list.pieceCount),
      color: MUTED,
      margin: [0, 2, 0, 10],
    },
  ];
  if (errors.length > 0) {
    content.push({
      table: {
        widths: ['*'],
        body: [[{ text: [{ text: r.fixBeforeCutting, bold: true }, errors.map((e) => e.message).join(' ')], color: '#991b1b' }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#fef2f2', paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 },
      margin: [0, 0, 0, 10],
    });
  }
  if (rows.length > 1) content.push({ text: t.stacking.floorPlan, bold: true, fontSize: 10, margin: [0, 0, 0, 6] });
  content.push({
    columns: [
      { svg: plan.svg, width: planWidth, height: planHeight },
      {
        width: '*',
        stack: [
          { text: r.materials, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
          { table: { headerRows: 1, widths: ['*', 32, 40, 78, ...(list.hasCosts ? [44] : [])], body: totals }, layout: tableLayout },
          ...(list.cost !== null ? [{ text: r.materialCost(t.money(list.cost)), bold: true, alignment: 'right', margin: [0, 4, 0, 0] }] : []),
          { text: r.sheetsNote, fontSize: 7, color: MUTED, margin: [0, 4, 0, 10] },
          { text: r.construction, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
          {
            ul: [
              r.carcassLine(board(c.carcassMaterial), c.bottomJoint === 'under', c.baseTop === 'rails' ? c.railWidth : null),
              r.backsLine(board(c.backMaterial), c.backMount === 'groove'),
              r.frontsLine(board(c.frontMaterial), c.doorType === 'inset', c.frontGap),
              r.drawersLine(c.drawerSystem === 'metal'),
              r.edgesLine(c.subtractEdges),
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

  if (rows.length > 1) {
    rows.forEach((row, index) => {
      const upperPlan = planSvg(design, t.engine, design.items.filter((item) => inUpperRow(item, row)));
      const width = Math.min(650, 400 * upperPlan.width / upperPlan.height);
      content.push({ text: t.stacking.exportRow(index + 1, t.mm(row.elevation), t.mm(row.top)), fontSize: 13, bold: true, pageBreak: 'before', margin: [0, 0, 0, 10] });
      content.push({ svg: upperPlan.svg, width, height: width * upperPlan.height / upperPlan.width });
      content.push({ text: t.stacking.supplierNote, fontSize: 8, color: MUTED, margin: [0, 8, 0, 0] });
    });
  }
  content.push({ text: r.parts, fontSize: 13, bold: true, margin: [0, 14, 0, 4], pageBreak: 'before' });
  content.push({
    table: {
      headerRows: 1,
      widths: [100, 24, 40, 40, 28, 150, 70, 90, '*'],
      body: [
        header([r.piece, r.qty, r.length, r.width, r.thick, r.material, r.edges, r.units, r.note], [1, 2, 3, 4]),
        ...list.rows.map((row) => [...partCells(row, row.materialName, bandThickness, t), row.units.join(', '), { text: partNote(row, t.engine), color: MUTED }]),
      ],
    },
    layout: tableLayout,
  });
  if (edited) content.push({ text: r.changedFootnote, fontSize: 7, color: MUTED, margin: [0, 3, 0, 0] });

  if (list.hardware.length > 0) {
    content.push({ text: r.hardware, fontSize: 13, bold: true, margin: [0, 14, 0, 4] });
    content.push({
      table: {
        headerRows: 1,
        widths: [220, 30, '*'],
        body: [header([r.item, r.qty, r.units], [1]), ...list.hardware.map((h) => [h.name, right(String(h.quantity), true), h.units.join(', ')])],
      },
      layout: tableLayout,
    });
  }

  content.push({ text: r.partsByUnit, fontSize: 13, bold: true, margin: [0, 14, 0, 4], pageBreak: 'before' });
  const unitTable = (parts: Array<Part & { materialName: string }>) => ({
    table: {
      headerRows: 1,
      widths: [110, 24, 40, 40, 28, 170, 80, '*'],
      body: [
        header([r.piece, r.qty, r.length, r.width, r.thick, r.material, r.edges, r.note], [1, 2, 3, 4]),
        ...parts.map((p) => [...partCells(p, p.materialName, bandThickness, t), { text: partNote(p, t.engine), color: MUTED }]),
      ],
    },
    layout: tableLayout,
    margin: [0, 0, 0, 10],
  });
  for (const { item, parts } of list.units) {
    const required = parts.filter((part) => part.quantity > 0);
    if (required.length === 0) continue;
    content.push({
      stack: [
        { text: [{ text: `${item.label}  `, bold: true }, { text: r.unitHeader(t.kinds[item.kind], item.width, item.height, item.depth), color: MUTED }], margin: [0, 0, 0, 3] },
        unitTable(required),
      ],
      unbreakable: required.length <= 14,
    });
  }
  if (list.extra.length > 0) {
    content.push({ text: r.extraPieces, bold: true, margin: [0, 0, 0, 3] });
    content.push(unitTable(list.extra));
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 34, 28, 34],
    info: { title: r.title(design.name), creator: t.appName },
    defaultStyle: { font: 'Roboto', fontSize: 8, color: '#27272a' },
    header: (page: number) => (page === 1 ? null : { text: r.pageHeader(design.name), fontSize: 7, color: MUTED, alignment: 'right', margin: [28, 14, 28, 0] }),
    footer: (page: number, pages: number) => ({
      columns: [
        { text: r.footer(date), fontSize: 7, color: MUTED },
        { text: r.page(page, pages), fontSize: 7, color: MUTED, alignment: 'right' },
      ],
      margin: [28, 10, 28, 0],
    }),
    content,
  };
}

/** Renders the cutting list to a PDF. pdfmake and its font are only downloaded when needed. */
export async function cuttingListPdf(design: Design, list: CuttingList, issues: Issue[], t: Messages = en): Promise<Blob> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake.createPdf(cuttingListDocument(design, list, issues, new Date(), t)).getBlob();
}
