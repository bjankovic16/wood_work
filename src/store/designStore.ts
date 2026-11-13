import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createDesign, parseDesign } from '../domain/designOps';
import { safeStorage } from '../lib/platform';
import type { Design } from '../domain/types';

const HISTORY_LIMIT = 100;

interface DesignState {
  design: Design;
  past: Design[];
  future: Design[];
  /** Design as it was when the current drag started; the whole drag becomes one undo step. */
  gestureBase: Design | null;

  /** Applies a change. Each call is one undo step, unless it happens during a gesture. */
  apply: (recipe: (design: Design) => Design) => void;
  beginGesture: () => void;
  endGesture: () => void;
  /** Ends the gesture and restores the design from before it. */
  cancelGesture: () => void;
  undo: () => void;
  redo: () => void;
}

export const useDesignStore = create<DesignState>()(
  persist(
    (set, get) => ({
      design: createDesign(),
      past: [],
      future: [],
      gestureBase: null,

      apply: (recipe) => {
        const { design, gestureBase, past } = get();
        const next = recipe(design);
        if (next === design) return;
        if (gestureBase) {
          set({ design: next });
        } else {
          set({ design: next, past: [...past, design].slice(-HISTORY_LIMIT), future: [] });
        }
      },

      beginGesture: () => {
        if (!get().gestureBase) set({ gestureBase: get().design });
      },

      endGesture: () => {
        const { gestureBase, design, past } = get();
        if (!gestureBase) return;
        if (gestureBase === design) {
          set({ gestureBase: null });
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
    }),
    {
      name: 'kitchen-designer:design',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ design: state.design }),
      merge: (persisted, current) => {
        const design = parseDesign((persisted as { design?: unknown } | undefined)?.design);
        return design ? { ...current, design } : current;
      },
    },
  ),
);
