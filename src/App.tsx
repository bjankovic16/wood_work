import { DesignCanvas } from './components/canvas/DesignCanvas';
import { ConstructionDialog } from './components/construction/ConstructionDialog';
import { CuttingListView } from './components/cutting/CuttingListView';
import { CompactLayout } from './components/layout/CompactLayout';
import { TopBar } from './components/layout/TopBar';
import { LibraryDragChip, LibraryPanel, LibrarySections } from './components/library/LibraryPanel';
import { PropertiesPanel } from './components/properties/PropertiesPanel';
import { RoomWorkspace } from './components/room/RoomWorkspace';
import { View3D } from './components/three/View3D';
import { LayoutDialog } from './components/layouts/LayoutDialog';
import { FeedbackToast } from './components/FeedbackToast';
import { ProjectsDialog } from './components/projects/ProjectsDialog';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Dialog } from './components/ui';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useIsCompact } from './hooks/useMediaQuery';
import { LANGUAGES, useT } from './i18n';
import { useDesignStore } from './store/designStore';
import { useUiStore } from './store/uiStore';

/** Large screens: library on the left, plan or cutting list in the middle, properties on the right. */
function DesktopLayout() {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const view = useUiStore((s) => s.view);
  const roomOpen = useUiStore((s) => s.roomOpen);
  const referenceOpen = useUiStore((state) => state.referenceOpen);
  const studio = view === '3d' && referenceOpen;
  return (
    <div className="flex h-dvh select-none flex-col bg-white text-zinc-900 print:h-auto">
      <TopBar />
      {roomOpen ? <RoomWorkspace /> : view !== 'list' ? (
        <div className="flex min-h-0 flex-1">
          {view === 'plan' && <LibraryPanel />}
          <main className="relative min-w-0 flex-1">
            {view === 'plan' ? <DesignCanvas /> : <View3D />}
            {view === '3d' && <Button variant="primary" className="absolute bottom-4 left-4 h-11 rounded-full px-5 shadow-sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" />{t.phone.addElement}
            </Button>}
          </main>
          {!studio && <PropertiesPanel />}
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
      <Dialog open={adding && view === '3d'} title={t.phone.addElement} onClose={() => setAdding(false)}>
        <div className="p-4"><LibrarySections wide onAdded={() => setAdding(false)} /></div>
      </Dialog>
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
  return <>{useIsCompact() ? <CompactLayout /> : <DesktopLayout />}<FeedbackToast /></>;
}
