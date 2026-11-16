import { KIND_SPECS, LIBRARY, type LibrarySection } from './catalog';
import type { ItemKind } from './types';

export type LibraryCategory = LibrarySection['id'] | 'all';

export interface LibrarySearchLabels {
  kinds: Record<ItemKind, string>;
  sections: Record<string, string>;
  custom: string;
  island: string;
  keywords: Partial<Record<ItemKind, string>>;
}

export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/gi, 'dj').toLowerCase();
}

/** Search translated names, common synonyms and widths without changing the catalogue. */
export function searchLibrary(query: string, labels: LibrarySearchLabels, category: LibraryCategory = 'all'): LibrarySection[] {
  const words = normalizeSearchText(query).trim().split(/[\s,]+/).filter(Boolean);
  return LIBRARY
    .filter((section) => category === 'all' || section.id === category)
    .map((section) => ({
      ...section,
      presets: section.presets.filter((preset) => {
        const width = preset.width ?? KIND_SPECS[preset.kind].defaults.width;
        const text = normalizeSearchText([
          preset.id, labels.kinds[preset.kind], labels.sections[section.id], labels.keywords[preset.kind] ?? '',
          `${width} mm ${width}mm`, preset.custom ? labels.custom : '', preset.name === 'island' ? labels.island : '',
        ].join(' '));
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((section) => section.presets.length > 0);
}
