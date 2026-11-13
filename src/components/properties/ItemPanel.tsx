import { ChevronRight, Copy, RotateCcw, RotateCw, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { ELEVATION_LIMITS, KIND_SPECS, sizeLimits, type SizeField } from '../../domain/catalog';
import { aabbSize, attachedWall, backWall, isFlushWith, itemRect, mountingWalls } from '../../domain/geometry';
import type { KitchenItem, Material, Room } from '../../domain/types';
import { KIND_OPTIONS, resolveConfig, type BuildContext } from '../../engine/config';
import { edgeText, formatMm } from '../../engine/cuttingList';
import { unitParts } from '../../engine/parts';
import { cn } from '../../lib/cn';
import * as actions from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useBuildContext, useIssues } from '../../store/derived';
import { useUiStore } from '../../store/uiStore';
import { KindIcon } from '../library/KindIcon';
import { Button, PanelSection, Segmented } from '../ui';
import { FrontPreview } from './FrontPreview';
import { NumberField, SelectField, TextField } from './NumberField';
import { Stepper } from './Stepper';

const CORNER_NAMES = { 0: 'top-left', 90: 'top-right', 180: 'bottom-right', 270: 'bottom-left' } as const;

export function placementText(item: KitchenItem, room: Room): string {
  if (item.kind === 'corner') {
    const rect = itemRect(item);
    const inCorner = mountingWalls(item).every((wall) => isFlushWith(rect, wall, room));
    return inCorner ? `In the ${CORNER_NAMES[item.rotation]} corner` : 'Not in a corner';
  }
  const wall = attachedWall(item, room);
  return wall ? `Back against the ${wall} wall` : `Free-standing, facing away from the ${backWall(item.rotation)} wall`;
}

export function ItemHeader({ item, compact = false }: { item: KitchenItem; compact?: boolean }) {
  const room = useDesignStore((s) => s.design.room);
  return (
    <div className={cn('flex items-start gap-3 px-4', compact ? 'pb-2 pt-3' : 'border-b border-zinc-100 py-4')}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600">
        <KindIcon kind={item.kind} width={item.width} className="size-7" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="truncate text-sm font-semibold text-zinc-900">
          {KIND_SPECS[item.kind].name}
          <span className="ml-1.5 font-medium text-zinc-400">{item.label}</span>
        </div>
        <div className="truncate text-xs text-zinc-500">{placementText(item, room)}</div>
      </div>
      <Button title="Deselect (Esc)" aria-label="Deselect" onClick={() => useUiStore.getState().select(null)} className="-mr-2 -mt-1">
        <X className="size-4" />
      </Button>
    </div>
  );
}

/** This unit's problems, from the design checks. */
function UnitIssues({ item }: { item: KitchenItem }) {
  const issues = useIssues().filter((issue) => issue.itemIds.includes(item.id));
  if (issues.length === 0) return null;
  return (
    <div className="space-y-1.5 border-b border-zinc-100 px-4 py-3" data-testid="unit-issues">
      {issues.map((issue) => (
        <div
          key={issue.key}
          className={cn(
            'flex gap-2 rounded-lg px-2.5 py-2 text-xs leading-snug',
            issue.severity === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900',
          )}
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {issue.message}
        </div>
      ))}
    </div>
  );
}

const materialLabel = (m: Material) => `${m.name} ${formatMm(m.thickness)} mm`;

/** A board for this unit: the kitchen-wide one, or any other from the library. */
function MaterialField({
  item,
  field,
  label,
  kitchenWide,
}: {
  item: KitchenItem;
  field: 'carcassMaterial' | 'backMaterial' | 'frontMaterial';
  label: string;
  kitchenWide: string;
}) {
  const materials = useDesignStore((s) => s.design.materials);
  const kitchen = materials.find((m) => m.id === kitchenWide);
  const options = [
    { value: '', label: `Kitchen: ${kitchen ? materialLabel(kitchen) : '—'}` },
    ...materials.filter((m) => m.id !== kitchenWide).map((m) => ({ value: m.id, label: materialLabel(m) })),
  ];
  return (
    <SelectField
      label={label}
      value={item[field] && item[field] !== kitchenWide ? item[field] : ''}
      options={options}
      onChange={(value) => actions.setItemOption(item.id, field, value || undefined)}
    />
  );
}

/** Everything editable about one unit. Shared by the desktop panel and the phone sheet. */
export function ItemFields({ item }: { item: KitchenItem }) {
  const room = useDesignStore((s) => s.design.room);
  const construction = useDesignStore((s) => s.design.construction);
  const ctx = useBuildContext();
  const focusRequest = useUiStore((s) => s.focusRequest);
  const corner = item.kind === 'corner';
  const footprint = aabbSize(item);
  const options = KIND_OPTIONS[item.kind];
  const config = resolveConfig(item, ctx);

  // The request is consumed once the width field has had the chance to focus itself.
  useEffect(() => {
    if (focusRequest) useUiStore.getState().requestFocus(null);
  }, [focusRequest]);

  const sizeField = (field: SizeField, label: string) => {
    const limits = sizeLimits(item, field);
    return (
      <NumberField
        label={label}
        title={`${limits.min}–${limits.max} mm`}
        value={field === 'width2' ? (item.width2 ?? item.width) : item[field]}
        min={limits.min}
        max={limits.max}
        autoFocus={field === 'width' && focusRequest === 'width'}
        onCommit={(value) => actions.setItemSize(item.id, field, value)}
      />
    );
  };

  const hasCounts = Boolean(options.doors || options.drawers || options.shelves);
  const drawersOnly = config.doors === 0 && config.drawers > 0;

  return (
    <>
      <UnitIssues item={item} />

      <PanelSection title="Size">
        {sizeField('width', corner ? 'Width, wall A' : 'Width')}
        {corner && sizeField('width2', 'Width, wall B')}
        {sizeField('depth', 'Depth')}
        {sizeField('height', 'Height')}
      </PanelSection>

      <PanelSection title={hasCounts ? 'Fronts and shelves' : 'Front view'}>
        <FrontPreview item={item} ctx={ctx} />
        {options.doors && (
          <Stepper label="Doors" value={config.doors} {...options.doors} onChange={(v) => actions.setItemCount(item.id, 'doors', v)} />
        )}
        {options.drawers && (
          <Stepper label="Drawers" value={config.drawers} {...options.drawers} onChange={(v) => actions.setItemCount(item.id, 'drawers', v)} />
        )}
        {options.shelves && !drawersOnly && (
          <Stepper label="Shelves" value={config.shelves} {...options.shelves} onChange={(v) => actions.setItemCount(item.id, 'shelves', v)} />
        )}
        {options.inset && (config.doors > 0 || config.drawers > 0) && (
          <OptionRow label="Fronts">
            <Segmented
              ariaLabel="Door type"
              size="sm"
              value={config.doorType}
              onChange={(doorType) => actions.setItemOption(item.id, 'doorType', doorType === construction.doorType ? undefined : doorType)}
              options={[
                { value: 'overlay', label: 'Full overlay' },
                { value: 'inset', label: 'Inset' },
              ]}
            />
          </OptionRow>
        )}
        {config.doors === 1 && (
          <OptionRow label="Hinges">
            <Segmented
              ariaLabel="Hinge side"
              size="sm"
              value={config.hinge}
              onChange={(hinge) => actions.setItemOption(item.id, 'hinge', hinge === 'left' ? undefined : hinge)}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
            />
          </OptionRow>
        )}
        {drawersOnly && config.drawers > 1 && (
          <OptionRow label="Drawer fronts">
            <Segmented
              ariaLabel="Drawer fronts"
              size="sm"
              value={config.drawerLayout}
              onChange={(layout) => actions.setItemOption(item.id, 'drawerLayout', layout === 'equal' ? undefined : layout)}
              options={[
                { value: 'equal', label: 'Equal' },
                { value: 'shallowTop', label: 'Small top' },
              ]}
            />
          </OptionRow>
        )}
      </PanelSection>

      {(options.carcass || options.fronts) && (
        <PanelSection title="Materials">
          {options.carcass && <MaterialField item={item} field="carcassMaterial" label="Carcass" kitchenWide={construction.carcassMaterial} />}
          {options.back && <MaterialField item={item} field="backMaterial" label="Back panel" kitchenWide={construction.backMaterial} />}
          {options.fronts && <MaterialField item={item} field="frontMaterial" label="Fronts" kitchenWide={construction.frontMaterial} />}
        </PanelSection>
      )}

      <PanelSection title="Position">
        <NumberField
          label="From left wall"
          value={item.x}
          min={0}
          max={Math.max(0, room.width - footprint.w)}
          onCommit={(v) => actions.setItemPosition(item.id, v, item.y)}
        />
        <NumberField
          label="From top wall"
          value={item.y}
          min={0}
          max={Math.max(0, room.depth - footprint.h)}
          onCommit={(v) => actions.setItemPosition(item.id, item.x, v)}
        />
        <NumberField
          label="Height from floor"
          title="Floor to the underside of the unit"
          value={item.elevation}
          min={ELEVATION_LIMITS.min}
          max={ELEVATION_LIMITS.max}
          onCommit={(v) => actions.setItemElevation(item.id, v)}
        />
        <p className="pl-[112px] text-[11px] text-zinc-400">Top edge at {item.elevation + item.height} mm</p>
      </PanelSection>

      <PanelSection title="Element">
        <TextField label="Code" value={item.label} maxLength={12} onCommit={(v) => actions.setItemLabel(item.id, v)} />
      </PanelSection>

      <PartsSection item={item} ctx={ctx} />
    </>
  );
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[104px] shrink-0 text-xs text-zinc-500">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function PartsSection({ item, ctx }: { item: KitchenItem; ctx: BuildContext }) {
  const parts = useMemo(() => unitParts(item, ctx), [item, ctx]);
  const pieces = parts.reduce((sum, p) => sum + p.quantity, 0);
  return (
    <PanelSection
      title={`Parts · ${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`}
      aside={
        <button
          type="button"
          onClick={() => useUiStore.getState().setView('list')}
          className="flex items-center text-[11px] font-medium text-blue-600 hover:underline"
        >
          Cutting list
          <ChevronRight className="size-3.5" />
        </button>
      }
    >
      {parts.length === 0 ? (
        <p className="text-xs text-zinc-500">A freestanding appliance: nothing to cut.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {parts.map((p, i) => (
            <li key={i} className="flex items-baseline gap-2 py-1.5 text-xs">
              <span className="w-6 shrink-0 font-semibold tabular-nums text-zinc-900">{p.quantity}×</span>
              <span className="min-w-0 flex-1 text-zinc-700">
                {p.name}
                {(p.note || p.edgeBandId) && (
                  <span className="block text-[11px] leading-snug text-zinc-400">
                    {[p.edgeBandId && `Edges ${edgeText(p)}`, p.note].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-zinc-500">
                {formatMm(p.length)} × {formatMm(p.width)}
                <span className="text-zinc-400"> · {formatMm(p.thickness)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}

export function RotateButtons() {
  return (
    <>
      <Button variant="outline" title="Rotate left (Shift+R)" aria-label="Rotate left" onClick={() => actions.rotateSelected(-1)}>
        <RotateCcw className="size-4" />
      </Button>
      <Button variant="outline" title="Rotate right (R)" aria-label="Rotate right" onClick={() => actions.rotateSelected(1)}>
        <RotateCw className="size-4" />
      </Button>
    </>
  );
}

export function DuplicateButton({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <Button variant="outline" className={className} title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={actions.duplicateSelected}>
      <Copy className="size-4" />
      {!iconOnly && 'Duplicate'}
    </Button>
  );
}

export function DeleteButton({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <Button variant="danger" className={className} title="Delete (Del)" aria-label="Delete" onClick={actions.deleteSelected}>
      <Trash2 className="size-4" />
      {!iconOnly && 'Delete'}
    </Button>
  );
}
