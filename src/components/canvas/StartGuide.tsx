import { Images, Plus } from 'lucide-react';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';

export function StartGuide({ onAdd }: { onAdd: () => void }) {
  const { canvas: c } = useT();
  const dragging = useUiStore((s) => !!s.libraryDrag);
  if (dragging) return null;
  return <section data-testid="empty-plan-hint" data-plan-overlay="" aria-label={c.startTitle} className="layout-start">
    <button type="button" aria-label={c.startIdea} aria-description={c.startIdeaHint} onClick={() => useUiStore.getState().setLayoutsOpen(true)}>
      <Images aria-hidden="true" /><strong>{c.startIdea}</strong><small>{c.startIdeaHint}</small>
    </button>
    <button type="button" data-plan-controls="" data-add-trigger="" aria-label={c.startManual} aria-description={c.startManualHint} onClick={onAdd}>
      <Plus aria-hidden="true" /><strong>{c.startManual}</strong><small>{c.startManualHint}</small>
    </button>
  </section>;
}
