import { useEffect } from 'react';
import {
  deleteSelected,
  duplicateSelected,
  nudgeSelected,
  nudgeRoomFeature,
  redo,
  rotateSelected,
  undo,
} from '../store/actions';
import { PLAN_AXES, useUiStore } from '../store/uiStore';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** A dialog covers the plan: keys must not change the units behind it. */
function dialogOpen(): boolean {
  return document.querySelector('dialog:modal, [role="dialog"][aria-modal="true"]') !== null;
}

/** Arrow keys as steps along the screen: [to the right, upwards]. */
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      const { view, selectedId, roomSelection, roomOpen } = useUiStore.getState();
      // Undo and redo work everywhere; commands for the selected unit only where it can be seen.
      const unitKeys = view !== 'list' && !dialogOpen();

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (key === 'y') {
          e.preventDefault();
          redo();
        } else if (key === 'd' && unitKeys && !roomOpen) {
          e.preventDefault();
          duplicateSelected();
        }
        return;
      }
      if (e.altKey || !unitKeys) return;

      const hasSelection = selectedId !== null;
      if (view === 'plan' && roomOpen && roomSelection?.type === 'feature' && e.key in ARROWS
        && !(e.target instanceof Element && e.target.closest('[data-room-3d]'))) {
        e.preventDefault();
        const [right, up] = ARROWS[e.key];
        const step = e.shiftKey ? 100 : 10;
        nudgeRoomFeature(roomSelection.id, right * step, -up * step);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!hasSelection || roomOpen) return;
        e.preventDefault();
        deleteSelected();
      } else if (key === 'r' && view === 'plan' && !roomOpen) {
        rotateSelected(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        const ui = useUiStore.getState();
        if (!ui.cabinetTool) ui.select(null);
      } else if (e.key in ARROWS && hasSelection && view === 'plan' && !roomOpen) {
        e.preventDefault();
        const step = e.shiftKey ? 100 : 10;
        const [right, up] = ARROWS[e.key];
        nudgeSelected((PLAN_AXES.right[0] * right + PLAN_AXES.up[0] * up) * step, (PLAN_AXES.right[1] * right + PLAN_AXES.up[1] * up) * step);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
