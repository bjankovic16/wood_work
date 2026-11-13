import { ChevronDown } from 'lucide-react';
import { useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { findPreset, KIND_SPECS, LIBRARY, type LibraryPreset, type LibrarySection } from '../../domain/catalog';
import { cn } from '../../lib/cn';
import { addPresetToPlan, finishLibraryDrag, updateLibraryDrag } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { KindIcon } from './KindIcon';

const DRAG_START_DISTANCE = 4;

export function presetName(preset: LibraryPreset): string {
  const name = KIND_SPECS[preset.kind].name;
  return preset.width !== undefined ? `${name} ${preset.width}` : preset.custom ? `${name} (custom size)` : name;
}

function presetTooltip(preset: LibraryPreset): string {
  const { defaults } = KIND_SPECS[preset.kind];
  const width = preset.width ?? defaults.width;
  const size =
    preset.kind === 'corner'
      ? `${width} × ${defaults.width2} mm, ${defaults.depth} deep`
      : `${width} × ${defaults.height} × ${defaults.depth} mm (W × H × D)`;
  return `${presetName(preset)}\n${size}\nClick to add, or drag onto the plan`;
}

/**
 * Click adds the element to the first free spot; dragging shows a live preview
 * on the plan and drops it where the pointer is released. Escape cancels.
 * On touch screens a vertical swipe scrolls the list instead (the browser
 * cancels the pointer), so only taps and sideways drags add elements.
 */
function startPointerDrag(presetId: string, event: ReactPointerEvent, onAdded?: () => void) {
  if (event.button !== 0) return;
  event.preventDefault();
  (document.activeElement as HTMLElement | null)?.blur?.();
  const { clientX: startX, clientY: startY, pointerId } = event;
  let dragging = false;

  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
    document.documentElement.classList.remove('is-dragging');
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_START_DISTANCE) return;
    if (!dragging) document.documentElement.classList.add('is-dragging');
    dragging = true;
    updateLibraryDrag(presetId, e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    cleanup();
    const added = dragging ? finishLibraryDrag(true) : addPresetToPlan(presetId);
    if (added) onAdded?.();
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    cleanup();
    finishLibraryDrag(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    cleanup();
    finishLibraryDrag(false);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey, true);
}

interface PresetTileProps {
  preset: LibraryPreset;
  layout: LibrarySection['layout'];
  onAdded?: () => void;
}

function PresetTile({ preset, layout, onAdded }: PresetTileProps) {
  // Mouse clicks are handled by the pointer logic; this covers Enter/Space from the keyboard.
  const onKeyboardClick = (e: MouseEvent) => {
    if (e.detail === 0 && addPresetToPlan(preset.id)) onAdded?.();
  };
  return (
    <button
      type="button"
      title={presetTooltip(preset)}
      aria-label={`Add ${presetName(preset)}`}
      data-preset={preset.id}
      onPointerDown={(e) => startPointerDrag(preset.id, e, onAdded)}
      onClick={onKeyboardClick}
      className={cn(
        'group flex cursor-grab touch-pan-y select-none flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors',
        'hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
        layout === 'compact' ? 'h-[58px] gap-0.5' : 'h-[74px] gap-1 px-1.5',
      )}
    >
      <KindIcon kind={preset.kind} width={preset.width} custom={preset.custom} className="size-8 shrink-0" />
      <span
        className={cn(
          'font-medium text-zinc-700',
          layout === 'compact' ? 'text-[11px] tabular-nums' : 'text-center text-[11px] leading-tight',
        )}
      >
        {preset.title}
      </span>
    </button>
  );
}

/** The element sections, shared by the desktop sidebar and the phone's "Add" panel. */
export function LibrarySections({ onAdded, wide = false }: { onAdded?: () => void; wide?: boolean }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <>
      {LIBRARY.map((section) => {
        const open = !collapsed[section.id];
        return (
          <div key={section.id}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [section.id]: open }))}
              aria-expanded={open}
              className="flex w-full items-center gap-1.5 rounded-md px-1 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600"
            >
              <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
              {section.title}
            </button>
            {open && (
              <div
                className={cn(
                  'grid gap-1.5 pb-2',
                  section.layout === 'compact' ? (wide ? 'grid-cols-4 sm:grid-cols-8' : 'grid-cols-4') : wide ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2',
                )}
              >
                {section.presets.map((preset) => (
                  <PresetTile key={preset.id} preset={preset} layout={section.layout} onAdded={onAdded} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function LibraryPanel() {
  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold text-zinc-900">Elements</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Drag onto the plan, or click to add</p>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        <LibrarySections />
      </div>
    </aside>
  );
}

/** Follows the pointer while a library element is dragged outside the plan. */
export function LibraryDragChip() {
  const drag = useUiStore((s) => s.libraryDrag);
  if (!drag || drag.ghost) return null;
  const preset = findPreset(drag.presetId);
  if (!preset) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white/95 py-1.5 pl-1.5 pr-3 text-xs font-medium text-zinc-700 shadow-lg"
      style={{ left: drag.clientX + 14, top: drag.clientY + 14 }}
    >
      <KindIcon kind={preset.kind} width={preset.width} custom={preset.custom} className="h-6 w-6 text-zinc-500" />
      {presetName(preset)}
    </div>,
    document.body,
  );
}
