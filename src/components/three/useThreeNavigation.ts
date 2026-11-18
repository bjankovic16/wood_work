import { useLayoutEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { usePhoneThreeChrome } from '../layout/PhoneThreeChrome';

const TIP_MS = 6000;
const DRAG_PX = 6;

/** Observe canvas gestures; OrbitControls and the dedicated resize handles still own all pointer input. */
export function useThreeNavigation(canShowFirstTip: boolean, sheetOpen: boolean) {
  const chrome = usePhoneThreeChrome();
  const [tip, setTip] = useState<'first' | 'help' | null>(() => useUiStore.getState().moveHintSeen ? null : 'first');
  const showTip = !sheetOpen && (tip === 'help' || tip === 'first' && canShowFirstTip);
  const press = useRef<{ id: number; x: number; y: number; dragged: boolean } | null>(null);
  const skipPick = useRef(false);
  const closeSheet = chrome?.setOpen;
  const hideChrome = chrome?.setHidden;
  useLayoutEffect(() => {
    const ui = useUiStore.getState();
    if (!showTip) {
      if (ui.moveHintSeen) setTip(null);
      return;
    }
    // Count a displayed tip even if the user switches views before its timer expires.
    if (!ui.moveHintSeen) ui.setMoveHintSeen();
    const timer = window.setTimeout(() => setTip(null), TIP_MS);
    return () => window.clearTimeout(timer);
  }, [showTip, tip]);

  const handlers = {
    onPointerDownCapture(e: PointerEvent) {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      skipPick.current = false;
      if (!e.isPrimary) { press.current = null; return; }
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false };
    },
    onPointerMoveCapture(e: PointerEvent) {
      const start = press.current;
      if (!start || start.id !== e.pointerId || !e.buttons || start.dragged || Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_PX) return;
      start.dragged = true;
      if (useDesignStore.getState().gestureBase) return; // A dimension handle, not an orbit.
      if (!useUiStore.getState().moveHintSeen) useUiStore.getState().setMoveHintSeen();
      setTip(null);
      hideChrome?.(true);
    },
    onPointerUpCapture(e: PointerEvent) {
      const start = press.current;
      if (!start || start.id !== e.pointerId) return;
      press.current = null;
      if (!start.dragged && chrome?.hidden) {
        skipPick.current = true;
        chrome.setHidden(false);
      }
    },
    onPointerCancelCapture() { press.current = null; },
    onLostPointerCapture() { press.current = null; },
    onClickCapture(e: MouseEvent) {
      // The tap that brings the toolbar back isn't also a command to pick or deselect an object.
      if (skipPick.current && e.target instanceof HTMLCanvasElement) { skipPick.current = false; e.stopPropagation(); }
    },
  };
  return { handlers, showTip, showHelp: () => { closeSheet?.(false); setTip('help'); } };
}
