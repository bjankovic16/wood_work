import { create } from 'zustand';
import type { Messages } from '../i18n';
import { committedDesign, useDesignStore } from './designStore';

type Message = (t: Messages) => string;
type UndoKind = 'cabinet' | 'style' | 'fresh' | 'fit';
interface Notice {
  message: Message;
  expires: number;
  action?: { kind: UndoKind; valid: () => boolean; run: () => void };
}

export const useFeedback = create<{ notice: Notice | null }>(() => ({ notice: null }));
const duration = 5000;
let timer: ReturnType<typeof setTimeout>;

export function dismissFeedback(notice: Notice): void {
  if (useFeedback.getState().notice !== notice) return;
  clearTimeout(timer);
  useFeedback.setState({ notice: null });
}

export function showFeedback(message: Message, action?: Notice['action']): void {
  clearTimeout(timer);
  const notice = { message, action, expires: Date.now() + duration };
  useFeedback.setState({ notice });
  timer = setTimeout(() => dismissFeedback(notice), duration);
}

/** A history step, not "undo whatever happens to be last when this button is pressed". */
export function offerUndo(kind: UndoKind, message: Message, run = () => useDesignStore.getState().undo(), inScope = () => true): void {
  const { design, past } = useDesignStore.getState();
  const valid = () => {
    const state = useDesignStore.getState();
    return committedDesign(state) === design && state.past === past && inScope();
  };
  showFeedback(message, { kind, valid, run });
}

export function undoFeedback(notice: Notice): boolean {
  if (useFeedback.getState().notice !== notice || !notice.action) return false;
  if (Date.now() >= notice.expires || !notice.action.valid()) {
    dismissFeedback(notice);
    return false;
  }
  if (useDesignStore.getState().gestureBase) return false;
  dismissFeedback(notice);
  notice.action.run();
  return true;
}

// Committing a gesture, keyboard Undo/Redo or loading a different project retires the offer.
// A transient drag preview does not: it can still be cancelled without a new history step.
export function checkFeedbackScope(): void {
  const { notice } = useFeedback.getState();
  if (notice?.action && !notice.action.valid()) dismissFeedback(notice);
}
useDesignStore.subscribe(checkFeedbackScope);
