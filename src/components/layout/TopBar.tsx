import { Box, Ellipsis, FolderOpen, Hammer, Images, Languages, Layers, LayoutGrid, List, Magnet, Redo2, RulerDimensionLine, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { LANGUAGE_LABEL, LANGUAGES, useT, type Language } from '../../i18n';
import { cn } from '../../lib/cn';
import { redo, setProjectName, undo } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { GRID_SIZES, useUiStore, type MainView } from '../../store/uiStore';
import { ChecksButton } from '../checks/ChecksButton';
import { Button, Divider, Menu, Segmented } from '../ui';

function ProjectName({ className }: { className?: string }) {
  const t = useT();
  const name = useDesignStore((s) => s.design.name);
  const [draft, setDraft] = useState<string | null>(null);
  const skipBlurCommit = useRef(false);
  return (
    <input
      aria-label={t.topBar.projectName}
      title={t.topBar.renameProject}
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
  const t = useT();
  const view = useUiStore((s) => s.view);
  return (
    <Segmented<MainView>
      ariaLabel={t.topBar.view}
      size={compact ? 'md' : 'sm'}
      value={view}
      onChange={(v) => useUiStore.getState().setView(v)}
      className={compact ? 'w-full' : 'w-72'}
      options={[
        { value: 'plan', label: <><LayoutGrid className="size-3.5" /><span>{t.topBar.plan}</span></>, ariaLabel: t.topBar.plan, title: t.topBar.planTitle },
        { value: '3d', label: <><Box className="size-3.5" /><span>{t.topBar.view3d}</span></>, ariaLabel: t.topBar.view3d, title: t.topBar.view3dTitle },
        { value: 'list', label: <><List className="size-3.5" /><span>{compact ? t.topBar.listShort : t.topBar.list}</span></>, ariaLabel: t.topBar.list, title: t.topBar.listTitle },
      ]}
    />
  );
}

function UndoRedo() {
  const t = useT();
  const canUndo = useDesignStore((s) => s.past.length > 0);
  const canRedo = useDesignStore((s) => s.future.length > 0);
  return (
    <>
      <Button title={t.topBar.undoTitle} aria-label={t.topBar.undo} disabled={!canUndo} onClick={undo}>
        <Undo2 className="size-4" />
      </Button>
      <Button title={t.topBar.redoTitle} aria-label={t.topBar.redo} disabled={!canRedo} onClick={redo}>
        <Redo2 className="size-4" />
      </Button>
    </>
  );
}

function GridSelect({ className }: { className?: string }) {
  const t = useT();
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const gridSize = useUiStore((s) => s.gridSize);
  return (
    <select
      aria-label={t.topBar.gridSize}
      title={t.topBar.gridSize}
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
          {t.topBar.grid(size)}
        </option>
      ))}
    </select>
  );
}

/** Interface language. Each language is named in itself, and the control in both, so it can always be found. */
function LanguageSelect() {
  const language = useUiStore((s) => s.language);
  return (
    <label className="relative flex items-center" title={LANGUAGE_LABEL}>
      <Languages className="pointer-events-none absolute left-2 size-4 text-zinc-500" />
      <select
        aria-label={LANGUAGE_LABEL}
        value={language}
        onChange={(e) => useUiStore.getState().setLanguage(e.target.value as Language)}
        className="h-8 appearance-none rounded-md border border-transparent bg-transparent pl-8 pr-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        {LANGUAGES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TopBar({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const showDimensions = useUiStore((s) => s.showDimensions);
  const view = useUiStore((s) => s.view);
  const language = useUiStore((s) => s.language);
  const ui = useUiStore.getState();

  if (compact) {
    return (
      <header className="shrink-0 border-b border-zinc-200 bg-white print:hidden">
        <div className="flex h-12 items-center gap-1 px-2">
        <Logo />
        <ProjectName className="flex-1" />
        <UndoRedo />
        <ChecksButton compact />
        <Menu label={t.topBar.more} icon={<Ellipsis className="size-4" />}>
          <div className="space-y-1">
            <Button className="w-full justify-start" data-close-menu onClick={() => ui.setProjectsOpen(true)}>
              <FolderOpen className="size-4" />
              {t.topBar.projects}
            </Button>
            <Button className="w-full justify-start" data-close-menu onClick={() => ui.setLayoutsOpen(true)}>
              <Images className="size-4" />
              {t.layouts.title}
            </Button>
            <Button className="w-full justify-start" active={snapEnabled} onClick={() => ui.setSnapEnabled(!snapEnabled)}>
              <Magnet className="size-4" />
              {t.topBar.snapLong}
            </Button>
            <GridSelect className="w-full" />
            <Button className="w-full justify-start" active={showDimensions} onClick={() => ui.setShowDimensions(!showDimensions)}>
              <RulerDimensionLine className="size-4" />
              {t.topBar.dimensionsLong}
            </Button>
            <Button className="w-full justify-start" data-close-menu onClick={() => ui.setSettingsTab('materials')}>
              <Layers className="size-4" />
              {t.topBar.materialsAndEdges}
            </Button>
            <Button className="w-full justify-start" data-close-menu onClick={() => ui.setSettingsTab('construction')}>
              <Hammer className="size-4" />
              {t.topBar.constructionSettings}
            </Button>
            <div className="px-1 pt-1">
              <div className="flex items-center gap-1.5 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <Languages className="size-3.5" />
                {LANGUAGE_LABEL}
              </div>
              <Segmented<Language>
                ariaLabel={LANGUAGE_LABEL}
                value={language}
                onChange={(next) => ui.setLanguage(next)}
                options={LANGUAGES.map((option) => ({ value: option.value, label: option.label }))}
              />
            </div>
          </div>
        </Menu>
        </div>
        <div className="px-2 pb-2"><ViewTabs compact /></div>
      </header>
    );
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-3 print:hidden">
      <div className="flex items-center gap-2 pr-2">
        <Logo />
        <span className="hidden whitespace-nowrap text-[13px] font-semibold text-zinc-900 2xl:inline">{t.appName}</span>
      </div>
      <Divider />
      <Button title={t.topBar.projectsTitle} onClick={() => ui.setProjectsOpen(true)}>
        <FolderOpen className="size-4" />
        {t.topBar.projects}
      </Button>
      <Button title={t.layouts.title} aria-label={t.layouts.title} onClick={() => ui.setLayoutsOpen(true)}>
        <Images className="size-4" />
        <span className="hidden xl:inline">{t.kitchens.browse}</span>
      </Button>
      <ProjectName className="w-40" />

      <div className="flex flex-1 justify-center">
        <ViewTabs compact={false} />
      </div>

      <UndoRedo />
      <ChecksButton />
      <Divider />
      {view === 'plan' && (
        <>
          <Button active={snapEnabled} title={t.topBar.snapTitle} onClick={() => ui.setSnapEnabled(!snapEnabled)}>
            <Magnet className="size-4" />
            {t.topBar.snap}
          </Button>
          <GridSelect />
          <Button active={showDimensions} title={t.topBar.dimensionsTitle} onClick={() => ui.setShowDimensions(!showDimensions)}>
            <RulerDimensionLine className="size-4" />
            {t.topBar.dimensions}
          </Button>
          <Divider />
        </>
      )}
      <Button title={t.topBar.settingsTitle} onClick={() => ui.setSettingsTab('materials')}>
        <Hammer className="size-4" />
        {t.topBar.settings}
      </Button>
      <LanguageSelect />
    </header>
  );
}
