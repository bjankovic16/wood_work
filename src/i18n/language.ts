/** Languages of the interface. Saved preferences override browser detection. */
export type Language = 'sr' | 'en';

export const DEFAULT_LANGUAGE: Language = 'en';

export function browserLanguage(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]): Language {
  return languages[0]?.toLowerCase().split(/[-_]/)[0] === 'sr' ? 'sr' : 'en';
}

export const LANGUAGES: Array<{ value: Language; label: string; htmlLang: string }> = [
  { value: 'sr', label: 'Srpski', htmlLang: 'sr-Latn' },
  { value: 'en', label: 'English', htmlLang: 'en' },
];

/** Shown in both languages, so it can be found whichever one is on. */
export const LANGUAGE_LABEL = 'Jezik / Language';

export function isLanguage(value: unknown): value is Language {
  return value === 'sr' || value === 'en';
}
