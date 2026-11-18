import { Columns2, Copy, Download, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useCanSaveFiles } from '../../hooks/useCanSaveFiles';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT, type Messages } from '../../i18n';
import { cn } from '../../lib/cn';
import { safeFileName, saveTextFile, storageWorks } from '../../lib/platform';
import {
  deleteProject,
  duplicateProject,
  importProject,
  openProject,
  projectDesign,
  useProjectsStore,
} from '../../store/projects';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';
import { StartFreshButton } from './StartFreshButton';
import { PlanningGuide } from './PlanningGuide';
import { ProjectComparison } from './ProjectComparison';

function edited(time: number, t: Messages): string {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return t.projects.justNow;
  if (minutes < 60) return t.projects.minutesAgo(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t.projects.hoursAgo(hours);
  return t.date(new Date(time));
}

/** Every kitchen saved in this browser: open, copy, delete, save to a file, or open one from a file. */
export function ProjectsDialog() {
  const t = useT();
  const p = t.projects;
  const page = useUiStore((s) => s.projectPage);
  const setPage = useUiStore((s) => s.setProjectPage);
  const projects = useProjectsStore((s) => s.projects);
  const activeId = useProjectsStore((s) => s.activeId);
  const compact = useIsCompact();
  const canSave = useCanSaveFiles();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [returnPage, setReturnPage] = useState<'guide' | 'projects'>('projects');
  const fileInput = useRef<HTMLInputElement>(null);
  const close = () => {
    setConfirming(null);
    setMessage(null);
    setPage(null);
  };
  const compare = (from: 'guide' | 'projects') => { setConfirming(null); setReturnPage(from); setPage('compare'); };
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  const readFile = async (file: File) => {
    try {
      if (importProject(JSON.parse(await file.text()))) close();
      else setMessage(p.notProject);
    } catch {
      setMessage(p.unreadable);
    }
  };

  const saveToFile = async (id: string) => {
    const design = projectDesign(id);
    if (!design) return;
    const filename = `${safeFileName(design.name)}.kitchen.json`;
    const outcome = await saveTextFile(filename, JSON.stringify(design, null, 2), 'application/json', false);
    // A download shows itself, and a viewer who said no knows it.
    if (outcome === 'busy' || outcome === 'format' || outcome === 'unavailable') setMessage(t.files[outcome]);
  };

  if (page === 'guide' || page === 'compare') return <Dialog key={page} open title={page === 'guide' ? t.planner.guide : t.planner.compare}
    sheet={compact} wide={page === 'compare'} onClose={close}>
    {page === 'guide' ? <PlanningGuide compare={() => compare('guide')} /> : <ProjectComparison close={close}
      back={() => setPage(returnPage)} backLabel={returnPage === 'guide' ? t.planner.guide : p.title} />}
  </Dialog>;
  return (
    <Dialog open={page === 'projects'} title={p.title} sheet={compact} wide onClose={close}>
      <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-5 py-3">
        <StartFreshButton placement="dialog" onCreated={close} />
        <Button variant="outline" onClick={() => compare('projects')}>
          <Columns2 className="size-4" />{t.planner.compare}
        </Button>
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" />
          {p.openFile}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={p.projectFile}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void readFile(file);
          }}
        />
      </div>
      {message && (
        <p role="status" className="mx-5 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {message}
        </p>
      )}
      <ul className="divide-y divide-zinc-100">
        {sorted.map((project) => {
          const active = project.id === activeId;
          return (
            <li key={project.id} className={cn('flex items-center gap-2 px-5 py-3', active && 'bg-blue-50/40')} data-testid="project-row">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-900">{project.name}</span>
                  {active && <span className="rounded bg-blue-100 px-1.5 text-[11px] font-medium text-blue-700">{p.openBadge}</span>}
                </div>
                <div className="text-xs text-zinc-500">
                  {p.units(project.units)} · {p.edited(edited(project.updatedAt, t))}
                </div>
              </div>
              {!active && (
                <Button
                  variant="outline"
                  onClick={() => {
                    openProject(project.id);
                    close();
                  }}
                >
                  {p.open}
                </Button>
              )}
              <Button title={p.copyTitle} aria-label={p.copyAria(project.name)} onClick={() => duplicateProject(project.id)}>
                <Copy className="size-4" />
              </Button>
              {canSave && (
                <Button title={p.saveTitle} aria-label={p.saveAria(project.name)} onClick={() => void saveToFile(project.id)}>
                  <Download className="size-4" />
                </Button>
              )}
              {confirming === project.id ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    deleteProject(project.id);
                    setConfirming(null);
                  }}
                >
                  {p.deleteConfirm}
                </Button>
              ) : (
                <Button title={p.deleteTitle} aria-label={p.deleteAria(project.name)} onClick={() => setConfirming(project.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {storageWorks ? (
        <p className="border-t border-zinc-100 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] text-[11px] leading-relaxed text-zinc-500">
          {p.savedHere}
          {canSave && p.moveHint}
        </p>
      ) : (
        <p
          role="note"
          className="border-t border-amber-100 bg-amber-50 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] text-[12px] leading-relaxed text-amber-900"
        >
          {p.notKept}
          {canSave && p.saveEach}
        </p>
      )}
    </Dialog>
  );
}
