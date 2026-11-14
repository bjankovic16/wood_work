import { Copy, Download, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { safeFileName, saveTextFile } from '../../lib/platform';
import {
  createProject,
  deleteProject,
  duplicateProject,
  importProject,
  openProject,
  projectDesign,
  useProjectsStore,
} from '../../store/projects';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';

function edited(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(time).toLocaleDateString();
}

/** Every kitchen saved in this browser: open, copy, delete, save to a file, or open one from a file. */
export function ProjectsDialog() {
  const open = useUiStore((s) => s.projectsOpen);
  const projects = useProjectsStore((s) => s.projects);
  const activeId = useProjectsStore((s) => s.activeId);
  const compact = useIsCompact();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const close = () => {
    setConfirming(null);
    setMessage(null);
    useUiStore.getState().setProjectsOpen(false);
  };
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  const readFile = async (file: File) => {
    try {
      if (importProject(JSON.parse(await file.text()))) close();
      else setMessage('That file is not a kitchen project.');
    } catch {
      setMessage('That file could not be read.');
    }
  };

  const saveToFile = async (id: string) => {
    const design = projectDesign(id);
    if (!design) return;
    const outcome = await saveTextFile(`${safeFileName(design.name)}.kitchen.json`, JSON.stringify(design, null, 2), 'application/json', false);
    if (outcome === 'unavailable') setMessage('Saving files is not available here.');
  };

  return (
    <Dialog open={open} title="Projects" sheet={compact} wide onClose={close}>
      <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-5 py-3">
        <Button
          variant="primary"
          className="px-3"
          onClick={() => {
            createProject();
            close();
            // Offer a ready-made starting point, as a planner would.
            useUiStore.getState().setLayoutsOpen(true);
          }}
        >
          <Plus className="size-4" />
          New project
        </Button>
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload className="size-4" />
          Open a file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Project file"
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
                  {active && <span className="rounded bg-blue-100 px-1.5 text-[11px] font-medium text-blue-700">Open</span>}
                </div>
                <div className="text-xs text-zinc-500">
                  {project.units} {project.units === 1 ? 'unit' : 'units'} · edited {edited(project.updatedAt)}
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
                  Open
                </Button>
              )}
              <Button title="Make a copy" aria-label={`Copy ${project.name}`} onClick={() => duplicateProject(project.id)}>
                <Copy className="size-4" />
              </Button>
              <Button title="Save to a file" aria-label={`Save ${project.name} to a file`} onClick={() => void saveToFile(project.id)}>
                <Download className="size-4" />
              </Button>
              {confirming === project.id ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    deleteProject(project.id);
                    setConfirming(null);
                  }}
                >
                  Delete?
                </Button>
              ) : (
                <Button title="Delete" aria-label={`Delete ${project.name}`} onClick={() => setConfirming(project.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-zinc-100 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)] text-[11px] leading-relaxed text-zinc-500">
        Projects are saved in this browser only. To move one to another device, save it to a file and open that file on the other device.
      </p>
    </Dialog>
  );
}
