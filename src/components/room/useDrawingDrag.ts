import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from '../../domain/types';
import { pointerFrame } from '../../lib/pointerFrame';
import { useDesignStore } from '../../store/designStore';

/** SVG units are millimetres. Capture the original transform and grab point until release. */
export function useDrawingDrag() {
  const active = useRef<{ id: number; target: SVGGElement; start: DOMPoint; frame: ReturnType<typeof pointerFrame>; base: ReturnType<typeof useDesignStore.getState>['design']; finish?: (cancelled: boolean) => void } | null>(null);
  const cancel = () => {
    const g = active.current;
    if (!g) return;
    active.current = null;
    g.frame.cancel();
    if (useDesignStore.getState().gestureBase === g.base) useDesignStore.getState().cancelGesture();
    if (g.target.hasPointerCapture(g.id)) g.target.releasePointerCapture(g.id);
    g.finish?.(true);
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && active.current) { e.stopImmediatePropagation(); cancel(); } };
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); cancel(); };
  }, []);
  return {
    start(e: ReactPointerEvent<SVGGElement>, move: (delta: Point) => void, finish?: (cancelled: boolean) => void) {
      if (e.button !== 0 || !e.isPrimary || active.current || useDesignStore.getState().gestureBase) return false;
      const transform = e.currentTarget.ownerSVGElement?.getScreenCTM()?.inverse();
      if (!transform) return false;
      const start = new DOMPoint(e.clientX, e.clientY);
      const origin = start.matrixTransform(transform);
      const base = useDesignStore.getState().design;
      const frame = pointerFrame((p) => {
        const store = useDesignStore.getState();
        if (store.gestureBase !== base) {
          if (store.design !== base || Math.hypot(p.clientX - start.x, p.clientY - start.y) < 3) return;
          store.beginGesture();
        }
        const at = new DOMPoint(p.clientX, p.clientY).matrixTransform(transform);
        move({ x: at.x - origin.x, y: at.y - origin.y });
      });
      e.currentTarget.focus({ preventScroll: true });
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = { id: e.pointerId, target: e.currentTarget, start, frame, base, finish };
      return true;
    },
    handlers: {
      onPointerMove(e: ReactPointerEvent<SVGGElement>) { if (active.current?.id === e.pointerId) active.current.frame.move(e.nativeEvent); },
      onPointerUp(e: ReactPointerEvent<SVGGElement>) {
        const g = active.current;
        if (!g || g.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) < 3) { cancel(); return; }
        active.current = null;
        g.frame.release(e.nativeEvent);
        if (useDesignStore.getState().gestureBase === g.base) useDesignStore.getState().endGesture();
        if (g.target.hasPointerCapture(g.id)) g.target.releasePointerCapture(g.id);
        g.finish?.(false);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
    },
  };
}
