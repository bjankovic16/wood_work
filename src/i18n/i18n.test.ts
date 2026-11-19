import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createItem } from '../domain/catalog';
import { createDesign } from '../domain/designOps';
import { buildLayout } from '../domain/templates';
import { checkDesign } from '../engine/checks';
import { buildContext } from '../engine/config';
import { buildCuttingList, cuttingListCsv } from '../engine/cuttingList';
import { EN_LABELS } from '../engine/labels';
import { unitParts } from '../engine/parts';
import { cuttingListWorkbook } from '../export/excel';
import { en } from './en';
import { srPlural } from './plural';
import { sr } from './sr';
import { browserLanguage } from './language';

describe('browser language', () => {
  it.each([en, sr])('distinguishes room drawings from kitchen destinations in both languages', (t) => {
    expect(t.room.plan).not.toBe(t.topBar.plan);
    expect(t.room.model).not.toBe(t.topBar.view3d);
    expect(t.topBar.listShort).toBe(t.topBar.list);
    expect(t.cutting.title).toBe(t.topBar.list);
    expect(t.room.ideasShort).toBe(t.layouts.title);
  });
  it('uses Serbian only when it is the primary browser language', () => {
    expect(['sr', 'sr-Latn-RS', 'SR-rs', 'sr_Cyrl'].map((language) => browserLanguage([language, 'en']))).toEqual(['sr', 'sr', 'sr', 'sr']);
    expect([['en-US', 'sr'], ['de-DE'], [], ['']].map(browserLanguage)).toEqual(['en', 'en', 'en', 'en']);
  });
});

const kitchen = () => {
  const design = createDesign('Test');
  design.items = [createItem('base', [], { label: 'D1' }), createItem('wall', [], { label: 'G1', x: 0 })];
  return design;
};

it('keeps prices in dinars when the display language changes', () => {
  expect(en.money(1234.5)).toMatch(/^RSD\s1,234\.50$/);
  expect(sr.money(1234.5)).toMatch(/^1\.234,50\sRSD$/);
});

describe('Serbian', () => {
  it('uses the right noun form after a number', () => {
    const komad = (n: number) => `${n} ${srPlural(n, 'komad', 'komada', 'komada')}`;
    const ploca = (n: number) => `${n} ${srPlural(n, 'ploča', 'ploče', 'ploča')}`;
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(komad)).toEqual([
      '1 komad',
      '2 komada',
      '4 komada',
      '5 komada',
      '11 komada',
      '12 komada',
      '14 komada',
      '21 komad',
      '22 komada',
      '25 komada',
      '101 komad',
      '111 komada',
    ]);
    expect([1, 3, 7, 13, 23].map(ploca)).toEqual(['1 ploča', '3 ploče', '7 ploča', '13 ploča', '23 ploče']);
    expect(sr.cutting.oversize(1)).toBe('1 deo je veći od ploče');
    expect(sr.cutting.oversize(3)).toBe('3 dela su veća od ploče');
    expect(sr.cutting.oversize(6)).toBe('6 delova je veće od ploče');
  });

  it('names every piece, board and fitting in the cutting list', () => {
    const list = buildCuttingList(kitchen(), sr.engine);
    expect(list.rows.find((r) => r.name === 'Bok' && r.length === 720)).toMatchObject({
      quantity: 2,
      materialName: 'Bela oplemenjena iverica',
      bandName: 'ABS kant traka 1 mm',
      units: ['D1'],
    });
    expect(list.rows.map((r) => r.name)).toEqual(expect.arrayContaining(['Bok', 'Dno', 'Prednja traverza', 'Zadnja traverza', 'Polica', 'Leđa', 'Vrata', 'Gornja ploča']));
    expect(list.hardware.map((h) => h.name)).toEqual(
      expect.arrayContaining(['Skrivena šarka, nalegajuća', 'Podesiva nogica, 100 mm', 'Nosač police', 'Ručka, čelična', 'Nosači za kačenje gornjeg elementa (par)']),
    );
    // No piece keeps an English name.
    const english = new Set(Object.values(EN_LABELS.part));
    expect(list.rows.filter((r) => english.has(r.name))).toEqual([]);
  });

  it('writes a CSV with Serbian headings and decimal commas', () => {
    const design = kitchen();
    design.construction = { ...design.construction, subtractEdges: true };
    design.edgeBands = design.edgeBands.map((b) => (b.id === 'abs-1' ? { ...b, thickness: 0.5 } : b));
    const csv = cuttingListCsv(buildCuttingList(design, sr.engine), ';', sr.engine).split('\r\n');
    expect(csv[0]).toBe('Deo;Količina;Dužina (mm);Širina (mm);Debljina (mm);Materijal;Kant;Kant traka;Elementi;Napomena');
    expect(csv.find((line) => line.startsWith('Bok;') && line.includes(';720;'))).toBe('Bok;2;720;559,5;18;Bela oplemenjena iverica;D1 Š0;ABS kant traka 1 mm;D1;');
  });

  it('keeps a renamed built-in board under its new name', () => {
    const design = kitchen();
    design.materials = design.materials.map((m) => (m.id === 'particleboard-white-18' ? { ...m, name: 'Egger W1000' } : m));
    expect(buildCuttingList(design, sr.engine).materials.map((m) => m.materialName)).toContain('Egger W1000');
  });

  it('keeps changes made by hand when the language changes', () => {
    const design = kitchen();
    const shelf = unitParts(design.items[0], buildContext(design)).find((p) => p.name === 'Shelf')!;
    design.partEdits = { [design.items[0].id]: { [shelf.key]: { quantity: 3 } } };
    const polica = buildCuttingList(design, sr.engine).units[0].parts.find((p) => p.name === 'Polica');
    expect(polica).toMatchObject({ quantity: 3, edited: true });
  });

  it('writes the checks in Serbian, with the wall in the right case', () => {
    const design = createDesign();
    design.items = [createItem('base', [], { label: 'D1', x: 0 }), createItem('base', [], { label: 'D2', x: 620 })];
    expect(checkDesign(design, sr.engine).map((i) => i.message)).toEqual(['Razmak od 20 mm između D1 i D2 na gornjem zidu: zatvorite ga ili ga popunite filerom.']);
    design.items = [createItem('base', [], { label: 'D1', x: 0 }), createItem('base', [], { label: 'D2', x: 300 })];
    expect(checkDesign(design, sr.engine).map((i) => i.message)).toContain('D1 i D2 se preklapaju.');
  });

  it('gives new units Serbian codes', () => {
    expect(createItem('base', [], {}, sr.labelPrefix).label).toBe('D1');
    expect(createItem('wall', [], {}, sr.labelPrefix).label).toBe('G1');
    const codes = buildLayout('l-shape', { width: 3600, depth: 3000, height: 2600 }, sr.labelPrefix).map((i) => i.label);
    expect(codes).toEqual(expect.arrayContaining(['U1', 'D1', 'S1', 'MS1', 'R1', 'F1', 'G1']));
    expect(codes.some((code) => /^(B|W|C|O|DW)\d/.test(code))).toBe(false);
  });

  it('writes an Excel workbook in Serbian', async () => {
    const design = kitchen();
    const blob = await cuttingListWorkbook(design, buildCuttingList(design, sr.engine), new Date(2026, 10, 15), sr);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Krojna lista', 'Po elementima', 'Materijali', 'Okov', 'Projekat']);
    expect(workbook.getWorksheet('Krojna lista')!.getRow(1).getCell(1).value).toBe('Deo');
    expect(workbook.getWorksheet('Projekat')!.getRow(1).values).toEqual([undefined, 'Projekat', 'Test']);
  });

  it('translates every text of the interface', () => {
    // Walks both dictionaries side by side; every Serbian text must be filled in.
    const empty: string[] = [];
    const walk = (english: unknown, serbian: unknown, path: string) => {
      if (typeof english === 'string') {
        if (typeof serbian !== 'string' || serbian.trim() === '') empty.push(path);
      } else if (Array.isArray(english)) {
        if (!Array.isArray(serbian) || serbian.length === 0) empty.push(path);
      } else if (english && typeof english === 'object') {
        for (const key of Object.keys(english)) walk((english as Record<string, unknown>)[key], (serbian as Record<string, unknown>)?.[key], `${path}.${key}`);
      }
    };
    walk(en, sr, 'sr');
    expect(empty).toEqual([]);
    expect(sr.kinds.base).toBe('Donji element');
  });
});
