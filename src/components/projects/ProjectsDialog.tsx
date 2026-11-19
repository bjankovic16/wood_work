import { Columns2, Copy, Download, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useCanSaveFiles } from '../../hooks/useCanSaveFiles';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT, type Messages } from '../../i18n';
import { cn } from '../../lib/cn';
import {
  backupStatus,
  deleteProject,
  duplicateProject,
  importProject,
  openProject,
  saveProjectBackup,
  useProjectsStore,
} from '../../store/projects';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';
import { StartFreshButton } from './StartFreshButton';
import { PlanningGuide } from './PlanningGuide';
import { ProjectComparison } from './ProjectComparison';
import { LocalStorageNotice } from './LocalStorageNotice';

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
  const [saving, setSaving] = useState<string | null>(null);
  const [download, setDownload] = useState<{ id: string; confirm: () => void } | null>(null);
  const attempt = useRef(0);
  const [returnPage, setReturnPage] = useState<'guide' | 'projects'>('projects');
  const fileInput = useRef<HTMLInputElement>(null);
  const close = () => {
    ++attempt.current;
    setSaving(null);
    setDownload(null);
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
    const token = ++attempt.current;
    setSaving(id);
    setMessage(null);
    setDownload(null);
    const result = await saveProjectBackup(id);
    if (token !== attempt.current) return;
    setSaving(null);
    if (result.outcome === 'download-started') setDownload({ id, confirm: result.confirm });
    else setMessage(result.outcome === 'saved' ? t.feedback.backupSaved : t.files[result.outcome]);
  };

  if (page === 'guide' || page === 'compare') return <Dialog key={page} open title={page === 'guide' ? t.planner.guide : t.planner.compare}
    sheet={compact} wide={page === 'compare'} onClose={close}>
    {page === 'guide' ? <PlanningGuide compare={() => compare('guide')} /> : <ProjectComparison close={close}
      back={() => setPage(returnPage)} backLabel={returnPage === 'guide' ? t.planner.guide : p.title} />}
  </Dialog>;
  return (
    <Dialog open={page === 'projects'} title={p.title} sheet={compact} wide onClose={close}>
      <LocalStorageNotice canSave={canSave} />
      <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-5 py-3">
        <StartFreshButton onCreated={close} />
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
          const backup = backupStatus(project);
          return (
            <li key={project.id} className={cn('flex flex-wrap items-center gap-2 px-5 py-3', active && 'bg-blue-50/40')} data-testid="project-row">
              <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-900">{project.name}</span>
                  {active && <span className="rounded bg-blue-100 px-1.5 text-[11px] font-medium text-blue-700">{p.openBadge}</span>}
                </div>
                <div className="text-xs text-zinc-500">
                  {p.units(project.units)} · {p.edited(edited(project.updatedAt, t))}
                </div>
                <p className={cn('mt-1 text-xs', backup !== 'current' ? 'font-medium text-amber-900' : 'text-studio-muted')}>
                  {project.lastBackupAt ? t.feedback.lastBackup(t.dateTime(new Date(project.lastBackupAt))) : t.feedback.noBackup}
                  {backup === 'changed' ? ` ${t.feedback.changedBackup}` : backup === 'old' ? ` ${t.feedback.oldBackup}` : ''}
                </p>
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
                <Button variant="outline" className="min-h-11" disabled={saving !== null} aria-label={p.saveAria(project.name)} onClick={() => void saveToFile(project.id)}>
                  <Download className="size-4" />{t.feedback.backUp}
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
              {download?.id === project.id && <div className="w-full space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p role="status" className="text-sm">{t.feedback.confirmDownload}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" className="min-h-11" onClick={() => { download.confirm(); setDownload(null); setMessage(t.feedback.backupSaved); }}>{t.feedback.fileKept}</Button>
                  <Button variant="outline" className="min-h-11" onClick={() => setDownload(null)}>{t.common.cancel}</Button>
                </div>
              </div>}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
