import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n';
import { nudgeSelected } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../ui';

export function CabinetMoveControls() {
  const t = useT();
  const [step, setStep] = useState(10);
  return <section aria-label={t.view3d.preciseMove} className="shrink-0 border-t border-zinc-200 bg-[#f7f5f0] px-3 py-3">
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
    <div role="group" aria-label={t.view3d.preciseMove} className="flex justify-center gap-2">
      {([
        [ArrowLeft, t.view3d.moveLeft, -1, 0],
        [ArrowUp, t.view3d.moveBack, 0, -1],
        [ArrowDown, t.view3d.moveForward, 0, 1],
        [ArrowRight, t.view3d.moveRight, 1, 0],
      ] as const).map(([Icon, label, dx, dy]) => <Button key={label} variant="outline" className="size-12 p-0" aria-label={label} title={label}
        onClick={() => nudgeSelected(dx * step, dy * step)}><Icon className="size-5" /></Button>)}
    </div>
    <p className="mt-2 text-center text-[11px] text-zinc-500">{t.view3d.moveDirections}</p>
  </section>;
}
