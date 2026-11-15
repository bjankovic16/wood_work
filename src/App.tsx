import { DesignCanvas } from './components/canvas/DesignCanvas';
import { ConstructionDialog } from './components/construction/ConstructionDialog';
import { CuttingListView } from './components/cutting/CuttingListView';
import { CompactLayout } from './components/layout/CompactLayout';
import { TopBar } from './components/layout/TopBar';
import { LibraryDragChip, LibraryPanel } from './components/library/LibraryPanel';
import { PropertiesPanel } from './components/properties/PropertiesPanel';
import { RoomDialog } from './components/properties/RoomDialog';
import { View3D } from './components/three/View3D';
import { LayoutDialog } from './components/layouts/LayoutDialog';
import { ProjectsDialog } from './components/projects/ProjectsDialog';
import { useEffect } from 'react';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useIsCompact } from './hooks/useMediaQuery';
import { LANGUAGES, useT } from './i18n';
import { useDesignStore } from './store/designStore';
import { useUiStore } from './store/uiStore';

/** Large screens: library on the left, plan or cutting list in the middle, properties on the right. */
function DesktopLayout() {
  const view = useUiStore((s) => s.view);
  return (
    <div className="flex h-dvh select-none flex-col bg-white text-zinc-900 print:h-auto">
      <TopBar />
      {view !== 'list' ? (
        <div className="flex min-h-0 flex-1">
          <LibraryPanel />
          <main className="relative min-w-0 flex-1">{view === 'plan' ? <DesignCanvas /> : <View3D />}</main>
          <PropertiesPanel />
        </div>
      ) : (
        <main className="min-h-0 flex-1 print:min-h-fit">
          <CuttingListView />
        </main>
      )}
      <LibraryDragChip />
      <ConstructionDialog />
      <LayoutDialog />
      <ProjectsDialog />
      <RoomDialog />
    </div>
  );
}

export function App() {
  useKeyboardShortcuts();
  const t = useT();
  const language = useUiStore((s) => s.language);
  // The browser tab names the open project.
  const name = useDesignStore((s) => s.design.name);
  useEffect(() => {
    document.title = name.trim() ? `${name.trim()} · ${t.appName}` : t.appName;
  }, [name, t]);
  // Lets the browser hyphenate, pick fonts and read aloud in the right language.
  useEffect(() => {
    document.documentElement.lang = LANGUAGES.find((option) => option.value === language)?.htmlLang ?? language;
  }, [language]);
  return useIsCompact() ? <CompactLayout /> : <DesktopLayout />;
}
