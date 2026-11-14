import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createItem } from '../domain/catalog';
import { createDesign } from '../domain/designOps';
import { buildCuttingList } from '../engine/cuttingList';
import { cuttingListWorkbook } from './excel';

describe('Excel export', () => {
  it('writes a workbook Excel can read back, with every sheet filled in', async () => {
    const design = { ...createDesign('Test kitchen'), items: [createItem('base', [], { label: 'B1' }), createItem('wall', [], { label: 'W1' })] };
    const blob = await cuttingListWorkbook(design, buildCuttingList(design), new Date(2026, 10, 13));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Cutting list', 'By unit', 'Materials', 'Hardware', 'Project']);

    const parts = workbook.getWorksheet('Cutting list')!;
    expect(parts.getRow(1).getCell(1).value).toBe('Piece');
    const side = parts.getSheetValues().find((row) => Array.isArray(row) && row[1] === 'Side' && row[3] === 720) as unknown[];
    expect(side.slice(1, 7)).toEqual(['Side', 2, 720, 560, 18, 'White melamine particleboard']);

    expect(workbook.getWorksheet('Project')!.getRow(1).values).toEqual([undefined, 'Project', 'Test kitchen']);
  });
});
