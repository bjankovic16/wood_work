import { describe, expect, it } from 'vitest';
import { en, type Messages } from '../i18n/en';
import { sr } from '../i18n/sr';
import { KIND_SPECS, LIBRARY } from './catalog';
import { searchLibrary, type LibrarySearchLabels } from './librarySearch';

const labels = (t: Messages): LibrarySearchLabels => ({
  kinds: t.kinds, sections: t.library.sections, custom: t.library.custom, island: t.library.island, keywords: t.library.keywords,
});
const ids = (query: string, t: Messages = en) => searchLibrary(query, labels(t)).flatMap((section) => section.presets.map((preset) => preset.id));

describe('kitchen part search', () => {
  it('keeps all 46 choices in their original order when the search is empty', () => {
    expect(searchLibrary('   ', labels(en))).toEqual(LIBRARY);
    expect(ids('')).toHaveLength(46);
  });

  it('matches widths in millimetres, including presets that use a default width', () => {
    const results = searchLibrary('600', labels(en)).flatMap((section) => section.presets);
    expect(results.length).toBeGreaterThan(5);
    expect(results.every((preset) => (preset.width ?? KIND_SPECS[preset.kind].defaults.width) === 600)).toBe(true);
    expect(ids('600mm')).toEqual(ids('600'));
    expect(ids('600 mm')).toEqual(ids('600'));
  });

  it('combines case-insensitive words and common plural names', () => {
    expect(ids('DRAWERS 900')).toEqual(['drawer-900']);
    expect(ids('pantries 600')).toEqual(['tall', 'tall-600']);
    expect(ids('shelves 1200')).toEqual(['shelf-1200']);
  });

  it('matches catalogue identifiers so every preset is discoverable', () => {
    for (const section of LIBRARY) for (const preset of section.presets) expect(ids(preset.id)).toContain(preset.id);
  });

  it('matches Serbian names and synonyms with or without accents', () => {
    expect(ids('FRIZIDER', sr)).toEqual(ids('frižider', sr));
    expect(ids('FRIZIDER', sr)).toEqual(['fridge', 'integratedFridge']);
    expect(ids('izvlacne korpe 450', sr)).toEqual(['pullOut-450']);
    expect(ids('spajz', sr)).toEqual(ids('špajz', sr));
    expect(ids('fioke 900', sr)).toContain('drawer-900');
  });

  it('filters by category and combines the category with the query', () => {
    expect(searchLibrary('', labels(en), 'islands').flatMap((section) => section.presets)).toHaveLength(3);
    expect(searchLibrary('600', labels(en), 'appliances').flatMap((section) => section.presets.map((preset) => preset.id)))
      .toEqual(['hob', 'ovenTower', 'integratedFridge', 'hood']);
    expect(searchLibrary('drawers', labels(en), 'appliances')).toEqual([]);
  });

  it('returns an empty result explicitly and does not mutate the library', () => {
    const before = JSON.stringify(LIBRARY);
    expect(searchLibrary('no-such-kitchen-part', labels(en))).toEqual([]);
    const result = searchLibrary('', labels(en));
    result[0].presets.pop();
    expect(JSON.stringify(LIBRARY)).toBe(before);
  });
});
