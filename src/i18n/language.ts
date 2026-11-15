/** Languages of the interface. Serbian (Latin script) is the default. */
export type Language = 'sr' | 'en';

export const DEFAULT_LANGUAGE: Language = 'sr';

export const LANGUAGES: Array<{ value: Language; label: string; htmlLang: string }> = [
  { value: 'sr', label: 'Srpski', htmlLang: 'sr-Latn' },
  { value: 'en', label: 'English', htmlLang: 'en' },
];

/** Shown in both languages, so it can be found whichever one is on. */
export const LANGUAGE_LABEL = 'Jezik / Language';

export function isLanguage(value: unknown): value is Language {
  return value === 'sr' || value === 'en';
}
