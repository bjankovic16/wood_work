import { Box, Ellipsis, FolderOpen, Hammer, Layers, LayoutGrid, List, Magnet, Redo2, RulerDimensionLine, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { redo, setProjectName, undo } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { GRID_SIZES, useUiStore, type MainView } from '../../store/uiStore';
import { ChecksButton } from '../checks/ChecksButton';
import { Button, Divider, Menu, Segmented } from '../ui';

function ProjectName({ className }: { className?: string }) {
  const name = useDesignStore((s) => s.design.name);
  const [draft, setDraft] = useState<string | null>(null);
  const skipBlurCommit = useRef(false);
  return (
    <input
      aria-label="Project name"
      title="Rename the project"
      value={draft ?? name}
      maxLength={60}
      spellCheck={false}
      onFocus={() => setDraft(name)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        if (!skipBlurCommit.current) setProjectName(e.target.value);
        skipBlurCommit.current = false;
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          skipBlurCommit.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn(
        'h-8 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-base font-medium text-zinc-800 transition-colors lg:text-[13px]',
        'hover:border-zinc-200 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20',
        className,
      )}
    />
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-6 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#18181b" />
      <path d="M8 13h16v11H8z" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M16 13v11M7 13h18" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

function ViewTabs({ compact }: { compact: boolean }) {
  const view = useUiStore((s) => s.view);
  return (
    <Segmented<MainView>
      ariaLabel="View"
      size="sm"
      value={view}
      onChange={(v) => useUiStore.getState().setView(v)}
      className={compact ? '' : 'w-72'}
      options={[
        { value: 'plan', label: <><LayoutGrid className="size-3.5" />Plan</>, title: 'Design the kitchen from above' },
        { value: '3d', label: <><Box className="size-3.5" />3D</>, title: 'See the kitchen in 3D' },
        { value: 'list', label: <><List className="size-3.5" />{compact ? 'List' : 'Cutting list'}</>, title: 'Every piece to cut' },
      ]}
    />
  );
}

function UndoRedo() {
  const canUndo = useDesignStore((s) => s.past.length > 0);
  const canRedo = useDesignStore((s) => s.future.length > 0);
  return (
    <>
      <Button title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
        <Undo2 className="size-4" />
      </Button>
      <Button title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
        <Redo2 className="size-4" />
      </Button>
    </>
  );
}

function GridSelect({ className }: { className?: string }) {
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const gridSize = useUiStore((s) => s.gridSize);
  return (
    <select
      aria-label="Grid size"
      title="Grid size"
      value={gridSize}
      disabled={!snapEnabled}
      onChange={(e) => useUiStore.getState().setGridSize(Number(e.target.value))}
      className={cn(
        'h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-700 hover:border-zinc-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40',
        className,
      )}
    >
      {GRID_SIZES.map((size) => (
        <option key={size} value={size}>
          Grid {size} mm
        </option>
      ))}
    </select>
  );
}

export function TopBar({ compact = false }: { compact?: boolean }) {
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const showDimensions = useUiStore((s) => s.showDimensions);
  const view = useUiStore((s) => s.view);
  const ui = useUiStore.getState();

  if (compact) {
    return (
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2 print:hidden">
        <Logo />
        {/* On narrow phones the name moves into the menu to leave room for the view switch. */}
        <ProjectName className="hidden flex-1 min-[520px]:block" />
        <div className="flex-1 min-[520px]:hidden" />
        <ViewTabs compact />
        <UndoRedo />
        <ChecksButton compact />
        <Menu label="More" icon={<Ellipsis className="size-4" />}>
          <div className="space-y-1">
            <div className="px-1 pb-1 min-[520px]:hidden">
              <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Project</div>
              <ProjectName className="w-full border-zinc-200" />
            </div>
            <Button className="w-full justify-start" data-close-menu onClick={() => ui.setProjectsOpen(true)}>
              <FolderOpen className="size-4" />
              Projects
            </Button>
            <Button className="w-full justify-start" active={snapEnabled} onClick={() => ui.setSnapEnabled(!snapEnabled)}>
              <Magnet className="size-4" />
              Snap to walls and units
            </Button>
            <GridSelect className="w-full" />
            <Button className="w-full justify-start" active={showDimensions} onClick={() => ui.setShowDimensions(!showDimensions)}>
              <RulerDimensionLine className="size-4" />
              Wall dimensions
            </Button>
            <Button className="w-full justify-start" data-close-menu onClick={() => ui.setSettingsTab('materials')}>
              <Layers className="size-4" />
              Materials and edges
            </Button>
            <Button className="w-full justify-start" data-close-menu onClick={() => ui.setSettingsTab('construction')}>
              <Hammer className="size-4" />
              Construction settings
            </Button>
          </div>
        </Menu>
      </header>
    );
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-3 print:hidden">
      <div className="flex items-center gap-2 pr-2">
        <Logo />
        <span className="hidden text-[13px] font-semibold text-zinc-900 xl:inline">Kitchen Designer</span>
      </div>
      <Divider />
      <Button title="All your kitchen projects" onClick={() => ui.setProjectsOpen(true)}>
        <FolderOpen className="size-4" />
        Projects
      </Button>
      <ProjectName className="w-48" />

      <div className="flex flex-1 justify-center">
        <ViewTabs compact={false} />
      </div>

      <UndoRedo />
      <ChecksButton />
      <Divider />
      {view === 'plan' && (
        <>
          <Button active={snapEnabled} title="Snap to walls, neighbouring units and the grid" onClick={() => ui.setSnapEnabled(!snapEnabled)}>
            <Magnet className="size-4" />
            Snap
          </Button>
          <GridSelect />
          <Button active={showDimensions} title="Show wall dimensions" onClick={() => ui.setShowDimensions(!showDimensions)}>
            <RulerDimensionLine className="size-4" />
            Dimensions
          </Button>
          <Divider />
        </>
      )}
      <Button title="Materials, edge banding and construction rules for the whole kitchen" onClick={() => ui.setSettingsTab('materials')}>
        <Hammer className="size-4" />
        Settings
      </Button>
    </header>
  );
}
