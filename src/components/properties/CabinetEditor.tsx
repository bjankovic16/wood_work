import { useEffect, useId, useState } from 'react';
import type { KitchenItem } from '../../domain/types';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { ItemFields, type ItemSection } from './ItemPanel';

const sections: ItemSection[] = ['size', 'fronts', 'materials', 'parts'];

/** Collapsing the phone sheet keeps the selected tab without mounting its fields. */
export function CabinetEditor({ item, expanded = true, id }: { item: KitchenItem; expanded?: boolean; id?: string }) {
  const t = useT();
  const prefix = useId();
  const [section, setSection] = useState<ItemSection>('size');
  const focusWidth = useUiStore((s) => s.focusRequest === 'width');
  useEffect(() => {
    if (expanded && focusWidth) setSection('size');
  }, [expanded, focusWidth]);
  if (!expanded) return null;

  return <div id={id} className="sheet-editor flex min-h-0 flex-1 flex-col" onKeyDown={(e) => {
    // Arrow keys belong to the tabs, fields and scroll area, not to cabinet movement on the canvas.
    if (e.key.startsWith('Arrow')) e.stopPropagation();
  }}>
    <div role="tablist" aria-label={t.sheet.tabs} className="grid shrink-0 grid-cols-4 border-y border-studio-line bg-[#f6f3ec] px-1">
      {sections.map((key, index) => <button key={key} type="button" role="tab" id={`${prefix}-tab-${key}`} aria-controls={`${prefix}-${key}`}
        aria-selected={key === section} tabIndex={key === section ? 0 : -1} onClick={() => setSection(key)}
        className="min-h-11 min-w-0 border-b-2 border-transparent px-1 text-xs font-medium text-studio-muted aria-selected:border-studio-accent aria-selected:text-studio-accent"
        onKeyDown={(e) => {
          const count = sections.length;
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? count - 1
            : e.key === 'ArrowRight' ? (index + 1) % count : e.key === 'ArrowLeft' ? (index + count - 1) % count : null;
          if (next === null) return;
          e.preventDefault(); e.stopPropagation();
          setSection(sections[next]);
          document.getElementById(`${prefix}-tab-${sections[next]}`)?.focus({ preventScroll: true });
        }}>{key === 'parts' ? t.report.parts : t.item[key]}</button>)}
    </div>
    {sections.map((key) => <div key={key} role="tabpanel" id={`${prefix}-${key}`} aria-labelledby={`${prefix}-tab-${key}`}
      hidden={key !== section} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {key === section && <ItemFields item={item} section={section} />}
    </div>)}
  </div>;
}
