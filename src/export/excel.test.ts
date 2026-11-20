import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createItem } from '../domain/catalog';
import { createDesign } from '../domain/designOps';
import { buildCuttingList } from '../engine/cuttingList';
import { en } from '../i18n/en';
import { cuttingListWorkbook } from './excel';
import { cuttingListDocument } from './pdf';

describe('Excel export', () => {
  it('refuses manufacturing exports with impossible cut sizes', async () => {
    const design = createDesign();
    design.items = [createItem('shelf', [], { depth: 100 })];
    design.construction.shelfSetback = 150;
    const list = buildCuttingList(design);
    expect(() => cuttingListDocument(design, list, [])).toThrow(/impossible cut sizes/);
    await expect(cuttingListWorkbook(design, list)).rejects.toThrow(/impossible cut sizes/);
    const bad = list.invalidParts[0];
    design.partEdits = { [design.items[0].id]: { [bad.key]: { quantity: 0 } } };
    const omitted = buildCuttingList(design);
    expect(omitted.units[0].parts.some((part) => part.quantity === 0)).toBe(true);
    expect(JSON.stringify(cuttingListDocument(design, omitted, []))).not.toContain('"-50"');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await (await cuttingListWorkbook(design, omitted)).arrayBuffer());
    expect(workbook.getWorksheet('By unit')!.getSheetValues().some((row) => Array.isArray(row) && row[4] === 'Shelf')).toBe(false);
  });
  it('writes a workbook Excel can read back, with every sheet filled in', async () => {
    const design = { ...createDesign('Test kitchen'), items: [createItem('base', [], { label: 'B1' }), createItem('wall', [], { label: 'W1' })] };
    const blob = await cuttingListWorkbook(design, buildCuttingList(design), new Date(2026, 10, 13));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Cut list', 'By unit', 'Materials', 'Hardware', 'Project']);

    const parts = workbook.getWorksheet('Cut list')!;
    expect(parts.getRow(1).getCell(1).value).toBe('Piece');
    const side = parts.getSheetValues().find((row) => Array.isArray(row) && row[1] === 'Side' && row[3] === 720) as unknown[];
    expect(side.slice(1, 7)).toEqual(['Side', 2, 720, 560, 18, 'White melamine particleboard 18 mm']);

    expect(workbook.getWorksheet('Project')!.getRow(1).values).toEqual([undefined, 'Project', 'Test kitchen']);
  });

  describe('workshop costs', () => {
    it.each(['unpriced', 'partial', 'complete'] as const)('exports %s stock without inventing costs or dropping real amounts', async (pricing) => {
      const design = createDesign();
      design.items = [createItem('base', [])];
      design.materials = design.materials.map((m) => ({ ...m, price: pricing === 'complete' || pricing === 'partial' && m.id === design.construction.carcassMaterial ? 60 : 0 }));
      if (pricing === 'complete') design.edgeBands = design.edgeBands.map((b) => ({ ...b, price: 2 }));
      const list = buildCuttingList(design);
      const blob = await cuttingListWorkbook(design, list);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await blob.arrayBuffer());
      const sheets = workbook.getWorksheet('Materials')!;
      const pdf = JSON.stringify(cuttingListDocument(design, list, []));
      const name = 'White melamine particleboard 18 mm';
      const rows = sheets.getSheetValues().filter((row): row is ExcelJS.CellValue[] => Array.isArray(row));
      const costColumn = rows[0].indexOf(en.report.columns.cost);
      const board = rows.find((row) => row[1] === name);
      expect(board).toBeDefined();
      expect(sheets.getColumn(costColumn).hidden).toBe(pricing === 'unpriced');
      expect(board![costColumn]).toBe(pricing === 'unpriced' ? undefined : 60);
      const total = rows.find((row) => row[1] === en.report.total);
      if (pricing === 'complete') {
        expect(total?.[costColumn]).toBe(list.cost);
        expect(pdf).toContain(en.report.materialCost(en.money(list.cost!)));
      } else {
        expect(total).toBeUndefined();
        expect(pdf).not.toContain('Material cost:');
      }
      expect(pdf.includes('"Cost"')).toBe(pricing !== 'unpriced');
      expect(pdf.includes(en.money(60))).toBe(pricing !== 'unpriced');
      expect(pdf).not.toContain('18 mm 18 mm');
    });
  });
});
