import { Box, Ellipsis, FolderOpen, Hammer, Images, Languages, LayoutGrid, List, Magnet, Redo2, RulerDimensionLine } from 'lucide-react';
import { useRef, useState } from 'react';
import { LANGUAGE_LABEL, LANGUAGES, useT, type Language } from '../../i18n';
import { cn } from '../../lib/cn';
import { redo, setProjectName } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { finishRoom } from '../../store/projects';
import { GRID_SIZES, useUiStore, type MainView } from '../../store/uiStore';
import { ChecksButton } from '../checks/ChecksButton';
import { StartFreshButton } from '../projects/StartFreshButton';
import { Button, Divider, Menu, Segmented, TooltipButton } from '../ui';
import { UndoButton } from './UndoButton';
import { PhoneViewButton } from './PhoneThreeChrome';

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
        'h-8 min-w-0 rounded-lg border border-transparent bg-[#f3f0e8] px-2 text-base font-medium text-studio-ink transition-colors lg:text-[13px]',
        'hover:border-zinc-200 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20',
        className,
      )}
    />
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-6 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#52644d" />
      <path d="M8 13h16v11H8z" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M16 13v11M7 13h18" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

function ViewTabs({ compact }: { compact: boolean }) {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const roomOpen = useUiStore((s) => s.roomOpen);
  return (
    <Segmented<MainView | 'room'>
      ariaLabel={t.topBar.workspace}
      size={compact ? 'md' : 'sm'}
      value={roomOpen ? 'room' : view}
      onChange={(v) => {
        const ui = useUiStore.getState();
        if (v === 'room') { ui.openRoomPlan(); return; }
        if (ui.roomOpen) finishRoom();
        ui.setView(v);
      }}
      className={compact ? 'min-w-0 flex-1 [&_button]:h-11 [&_button]:px-1.5 [&_svg]:hidden' : 'max-2xl:[&_svg]:hidden max-xl:[&_button]:px-1.5'}
      options={[
        { value: 'plan', label: <><LayoutGrid className="size-3.5" /><span>{t.topBar.plan}</span></>, ariaLabel: t.topBar.plan, title: t.topBar.planTitle },
        { value: '3d', label: <><Box className="size-3.5" /><span>{t.topBar.view3d}</span></>, ariaLabel: t.topBar.view3d, title: t.topBar.view3dTitle },
        { value: 'room', label: <><RulerDimensionLine className="size-3.5" /><span>{compact ? t.room.tabShort : t.room.tab}</span></>, ariaLabel: t.room.tab, title: t.room.tabHint },
        { value: 'list', label: <><List className="size-3.5" /><span>{compact ? t.topBar.listShort : t.topBar.list}</span></>, ariaLabel: t.topBar.list, title: t.topBar.listTitle },
      ]}
    />
  );
}

function UndoRedo({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const canRedo = useDesignStore((s) => !s.gestureBase && s.future.length > 0);
  return (
    <div role="group" aria-label={`${t.topBar.undo} / ${t.topBar.redo}`} className="flex items-center">
      <UndoButton iconOnly={compact} />
      <TooltipButton tooltip={t.topBar.redoTitle} className={compact ? 'size-11 p-0' : undefined} aria-label={t.topBar.redo} disabled={!canRedo} onClick={redo}>
        <Redo2 className="size-4" aria-hidden="true" />
      </TooltipButton>
    </div>
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

function ViewOptions() {
  const t = useT();
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const showDimensions = useUiStore((s) => s.showDimensions);
  const ui = useUiStore.getState();
  return <div className="space-y-1">
    <Button className="w-full justify-start" active={snapEnabled} onClick={() => ui.setSnapEnabled(!snapEnabled)}>
      <Magnet className="size-4" />{t.topBar.snapLong}
    </Button>
    <GridSelect className="w-full" />
    <Button className="w-full justify-start" active={showDimensions} onClick={() => ui.setShowDimensions(!showDimensions)}>
      <RulerDimensionLine className="size-4" />{t.topBar.dimensionsLong}
    </Button>
  </div>;
}

export function TopBar({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const roomOpen = useUiStore((s) => s.roomOpen);
  const language = useUiStore((s) => s.language);
  const ui = useUiStore.getState();

  if (compact) {
    return (
      <header className="studio-panel shrink-0 border-b print:hidden">
        <div className="flex h-14 items-center gap-1 px-2">
        <span className="hidden shrink-0 min-[430px]:inline-flex"><Logo /></span>
        <ProjectName className="flex-1" />
        <PhoneViewButton />
        <UndoRedo compact />
        <Menu label={t.topBar.more} icon={<Ellipsis className="size-4" />}>
          <div className="flex max-h-[calc(100dvh-5rem)] flex-col gap-1">
            <div className="min-h-0 space-y-1 overflow-y-auto overscroll-contain">
              <Button className="w-full justify-start" data-close-menu onClick={() => ui.setProjectsOpen(true)}>
                <FolderOpen className="size-4" />
                {t.topBar.projects}
              </Button>
              <StartFreshButton placement="menu" />
              {view !== '3d' && <details>
                <summary className="cursor-pointer rounded-lg px-2 py-3 text-[13px] font-medium text-studio-muted">{t.topBar.view}</summary>
                <ViewOptions />
              </details>}
              <Button className="w-full justify-start" data-close-menu onClick={() => ui.setSettingsTab('materials')}>
                <Hammer className="size-4" />
                {t.topBar.settings}
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
            {roomOpen && <div className="flex shrink-0 justify-end"><ChecksButton /></div>}
          </div>
        </Menu>
        </div>
        <div className="flex items-center gap-1 px-2 pb-1">
          <ViewTabs compact />
          {!roomOpen && <ChecksButton compact />}
        </div>
      </header>
    );
  }

  return (
    <header className="studio-panel z-20 flex h-16 shrink-0 items-center gap-px border-b px-1 shadow-[0_1px_8px_#332f2805] xl:gap-1 xl:px-4 [&>button]:shrink-0 [&>button]:whitespace-nowrap max-xl:[&>button]:px-2 print:hidden">
      <div className="hidden items-center gap-2 xl:flex">
        <Logo />
        <span className="hidden whitespace-nowrap text-[13px] font-semibold text-zinc-900 2xl:inline">{t.appName}</span>
        <Divider />
      </div>
      <Button title={t.topBar.projectsTitle} onClick={() => ui.setProjectsOpen(true)}>
        <FolderOpen className="hidden size-4 xl:block" />
        {t.topBar.projects}
      </Button>
      <StartFreshButton placement="toolbar" />
      <Button variant="outline" title={t.layouts.title} aria-label={t.layouts.title} onClick={() => ui.setLayoutsOpen(true)}>
        <Images className="hidden size-4 xl:block" />
        <span>{t.layouts.title}</span>
      </Button>
      <ProjectName className="w-24 xl:w-32 2xl:w-40" />

      <div className="flex flex-1 justify-center">
        <ViewTabs compact={false} />
      </div>

      <UndoRedo />
      <ChecksButton />
      <Divider />
      {view === 'plan' && (
        <Menu label={t.topBar.view} text={<span className="hidden 2xl:inline">{t.topBar.view}</span>} icon={<LayoutGrid className="size-4" />}>
          <ViewOptions />
        </Menu>
      )}
      <Button title={t.topBar.settingsTitle} aria-label={t.topBar.settings} onClick={() => ui.setSettingsTab('materials')}>
        <Hammer className="size-4" />
        <span className="hidden xl:inline">{t.topBar.settings}</span>
      </Button>
      <LanguageSelect />
    </header>
  );
}
