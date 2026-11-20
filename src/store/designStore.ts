import { create } from 'zustand';
import { createDesign, syncPanelWidths } from '../domain/designOps';
import type { Design } from '../domain/types';

const HISTORY_LIMIT = 100;

interface DesignState {
  /** The open project's design. Saving and loading are handled by the projects module. */
  design: Design;
  past: Design[];
  future: Design[];
  /** Design as it was when the current drag started; the whole drag becomes one undo step. */
  gestureBase: Design | null;

  /** Applies a change. Each call is one undo step, unless it happens during a gesture. */
  apply: (recipe: (design: Design) => Design) => void;
  /** Replaces the design with another project's, starting a fresh undo history. */
  load: (design: Design) => void;
  beginGesture: () => void;
  endGesture: () => void;
  /** Ends the gesture and restores the design from before it. */
  cancelGesture: () => void;
  undo: () => void;
  redo: () => void;
}

/** A moving pointer is a preview, not a saved revision. */
export const committedDesign = (state: Pick<DesignState, 'gestureBase' | 'design'>): Design => state.gestureBase ?? state.design;

/** Only at release: a trip away and back is not an edit. Unchanged subtrees compare by reference. */
function sameSnapshot(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameSnapshot(left[key], right[key]));
}

export const useDesignStore = create<DesignState>()((set, get) => ({
  design: createDesign(),
  past: [],
  future: [],
  gestureBase: null,

  apply: (recipe) => {
    const { design, gestureBase, past } = get();
    const next = syncPanelWidths(recipe(design));
    if (next === design) return;
    if (gestureBase) {
      set({ design: next });
    } else {
      set({ design: next, past: [...past, design].slice(-HISTORY_LIMIT), future: [] });
    }
  },

  load: (design) => set({ design: syncPanelWidths(design), past: [], future: [], gestureBase: null }),

  beginGesture: () => {
    if (!get().gestureBase) set({ gestureBase: get().design });
  },

  endGesture: () => {
    const { gestureBase, design, past } = get();
    if (!gestureBase) return;
    if (sameSnapshot(gestureBase, design)) {
      set({ design: gestureBase, gestureBase: null });
    } else {
      set({ gestureBase: null, past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [] });
    }
  },

  cancelGesture: () => {
    const { gestureBase } = get();
    if (gestureBase) set({ design: gestureBase, gestureBase: null });
  },

  undo: () => {
    const { past, design, future, gestureBase } = get();
    if (gestureBase || past.length === 0) return;
    set({ design: past[past.length - 1], past: past.slice(0, -1), future: [design, ...future] });
  },

  redo: () => {
    const { past, design, future, gestureBase } = get();
    if (gestureBase || future.length === 0) return;
    set({ design: future[0], past: [...past, design], future: future.slice(1) });
  },
}));
