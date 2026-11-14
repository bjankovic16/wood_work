import { DesignCanvas } from './components/canvas/DesignCanvas';
import { ConstructionDialog } from './components/construction/ConstructionDialog';
import { CuttingListView } from './components/cutting/CuttingListView';
import { CompactLayout } from './components/layout/CompactLayout';
import { TopBar } from './components/layout/TopBar';
import { LibraryDragChip, LibraryPanel } from './components/library/LibraryPanel';
import { PropertiesPanel } from './components/properties/PropertiesPanel';
import { View3D } from './components/three/View3D';
import { LayoutDialog } from './components/layouts/LayoutDialog';
import { ProjectsDialog } from './components/projects/ProjectsDialog';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useIsCompact } from './hooks/useMediaQuery';
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
    </div>
  );
}

export function App() {
  useKeyboardShortcuts();
  return useIsCompact() ? <CompactLayout /> : <DesktopLayout />;
}
