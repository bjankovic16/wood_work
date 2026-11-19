import { useEffect, useId, useRef } from 'react';
import { useT } from '../../i18n';
import './sheets.css';

const snaps = ['small', 'half', 'full'] as const;
export type SheetSnap = typeof snaps[number];

/** Only the grip captures a drag. Inputs, scrollable content and the exposed canvas keep their own gestures. */
export function SheetHandle({ snap, onSnap, onClose, controls }: {
  snap: SheetSnap; onSnap: (snap: SheetSnap) => void; onClose: () => void; controls?: string;
}) {
  const t = useT().sheet;
  const hint = useId();
  const index = snaps.indexOf(snap);
  const drag = useRef<{ id: number; y: number; height: number; panel: HTMLElement } | null>(null);
  const moved = useRef(false);
  function reset() {
    drag.current?.panel.style.removeProperty('--sheet-drag-height');
    drag.current = null;
  }
  useEffect(() => {
    window.addEventListener('blur', reset);
    return () => { window.removeEventListener('blur', reset); reset(); };
  }, []);
  const step = (direction: number) => onSnap(snaps[Math.max(0, Math.min(2, index + direction))]);
  return <>
    <button type="button" className="sheet-handle" role="slider" data-testid="sheet-handle"
      aria-label={t.height} aria-describedby={hint} aria-controls={controls} aria-orientation="vertical"
      aria-valuemin={1} aria-valuemax={3} aria-valuenow={index + 1} aria-valuetext={t[snap]}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0 || drag.current) return;
        const panel = e.currentTarget.closest<HTMLElement>('[data-sheet-panel]');
        if (!panel) return;
        moved.current = false;
        drag.current = { id: e.pointerId, y: e.clientY, height: panel.getBoundingClientRect().height, panel };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.id) return;
        const dy = e.clientY - d.y;
        if (!moved.current && Math.abs(dy) < 6) return;
        moved.current = true;
        d.panel.style.setProperty('--sheet-drag-height', `${Math.max(44, d.height - dy)}px`);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.id) return;
        const dy = e.clientY - d.y;
        reset();
        if (Math.abs(dy) < 28) return;
        moved.current = true;
        if (dy > 0 && (index === 0 || d.height - dy < 76)) onClose();
        else step((dy < 0 ? 1 : -1) * (Math.abs(dy) > (d.panel.parentElement?.clientHeight ?? innerHeight) / 2 ? 2 : 1));
      }}
      onPointerCancel={reset} onLostPointerCapture={reset}
      onClick={(e) => {
        if (e.detail === 0 || !moved.current) onSnap(snaps[(index + 1) % snaps.length]);
      }}
      onKeyDown={(e) => {
        switch (e.key) {
          case 'ArrowUp': case 'ArrowRight': step(1); break;
          case 'ArrowDown': case 'ArrowLeft': step(-1); break;
          case 'Home': onSnap('small'); break;
          case 'End': onSnap('full'); break;
          case 'Escape': onClose(); break;
          default: return;
        }
        e.preventDefault();
        e.stopPropagation();
      }}>
      <span aria-hidden="true" className="sheet-grip" />
      <span aria-hidden="true">{t[snap]}</span>
    </button>
    <span id={hint} className="sr-only">{t.hint}</span>
  </>;
}
