import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n';
import { nudgeSelected } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../ui';

/**
 * Arrow buttons that move the selected cabinet in small exact steps. The arrows
 * point the way the cabinet moves on screen, whichever way the view is turned.
 */
export function CabinetMoveControls() {
  const t = useT();
  const [step, setStep] = useState(10);
  const axes = useUiStore((s) => s.viewAxes);
  /** Named after the wall the arrow moves towards, so it reads right whatever the view. */
  const label = ([dx, dy]: readonly [number, number]) => (dx > 0 ? t.view3d.moveRight : dx < 0 ? t.view3d.moveLeft : dy < 0 ? t.view3d.moveBack : t.view3d.moveForward);
  const arrow = (Icon: typeof ArrowUp, [dx, dy]: readonly [number, number], className: string) => (
    <Button variant="outline" className={`h-11 w-12 p-0 ${className}`} aria-label={label([dx, dy])} title={label([dx, dy])} onClick={() => nudgeSelected(dx * step, dy * step)}>
      <Icon className="size-5" />
    </Button>
  );
  return <section aria-label={t.view3d.preciseMove} className="shrink-0 border-t border-studio-line bg-[#f7f5f0] px-3 py-3">
    <div className="mb-2 flex items-center justify-between gap-2">
      <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
        {t.view3d.moveStep}
        <select aria-label={t.view3d.moveStep} value={step} onChange={(event) => setStep(Number(event.target.value))}
          className="min-h-11 rounded-lg border border-zinc-200 bg-white px-2">
          {[10, 50, 100].map((value) => <option key={value} value={value}>{value} mm</option>)}
        </select>
      </label>
      <Button variant="outline" className="min-h-11" onClick={() => useUiStore.getState().setPrecisionMove(false)}>{t.common.done}</Button>
    </div>
    <div role="group" aria-label={t.view3d.preciseMove} className="mx-auto grid w-fit grid-cols-3 gap-1.5">
      {arrow(ArrowUp, axes.up, 'col-start-2')}
      {arrow(ArrowLeft, [-axes.right[0], -axes.right[1]], 'col-start-1 row-start-2')}
      {arrow(ArrowDown, [-axes.up[0], -axes.up[1]], 'col-start-2 row-start-2')}
      {arrow(ArrowRight, axes.right, 'col-start-3 row-start-2')}
    </div>
    <p className="mt-2 text-center text-[11px] text-zinc-500">{t.view3d.moveDirections}</p>
  </section>;
}
