import { useUiStore } from '../store/uiStore';
import { en, type Messages } from './en';
import type { Language } from './language';
import { sr } from './sr';

export type { CornerName, Messages } from './en';
export { DEFAULT_LANGUAGE, isLanguage, LANGUAGE_LABEL, LANGUAGES, type Language } from './language';

const MESSAGES: Record<Language, Messages> = { en, sr };

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}

/** The interface's words in the chosen language; components re-render when it changes. */
export function useT(): Messages {
  return MESSAGES[useUiStore((s) => s.language)];
}

/** The same outside React, for commands that name new things. */
export function currentMessages(): Messages {
  return MESSAGES[useUiStore.getState().language];
}
