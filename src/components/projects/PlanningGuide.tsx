import { ArrowRight, Box, Columns2, LayoutGrid, List, Ruler } from 'lucide-react';
import { useT } from '../../i18n';
import { openWorkspace } from '../../store/projects';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../ui';

const steps = [['room', Ruler], ['plan', LayoutGrid], ['3d', Box], ['list', List]] as const;

export function PlanningGuide({ compare }: { compare: () => void }) {
  const p = useT().planner;
  const here = useUiStore((s) => s.roomOpen ? 'room' : s.view);
  const setPage = useUiStore((s) => s.setProjectPage);
  return <div className="space-y-4 p-4">
    <p className="text-sm text-studio-muted">{p.intro}</p>
    <ol className="grid gap-2">
      {steps.map(([view, Icon], i) => <li key={view}>
        <button type="button" aria-current={view === here ? 'step' : undefined}
          className="flex w-full items-center gap-3 rounded-xl border border-studio-line p-3 text-left hover:bg-studio-canvas focus-visible:outline-studio-accent"
          onClick={() => { setPage(null); openWorkspace(view); }}>
          <Icon size={20} className="shrink-0 text-studio-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {view === here && <small className="block font-medium text-studio-accent">{p.here}</small>}
            <strong className="block text-sm">{i + 1}. {p.steps[view][0]}</strong>
            <span className="block text-xs leading-relaxed text-studio-muted">{p.steps[view][1]}</span>
          </span><ArrowRight size={15} aria-hidden="true" />
        </button>
      </li>)}
    </ol>
    <Button variant="outline" className="min-h-11 w-full" onClick={compare}><Columns2 size={16} />{p.compare}</Button>
  </div>;
}
