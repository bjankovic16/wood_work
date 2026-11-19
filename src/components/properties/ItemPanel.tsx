import { ChevronRight, Copy, RotateCwSquare, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BAR_MATERIAL_ID, ELEVATION_LIMITS, GLASS_MATERIAL_ID, sizeLimits, type SizeField } from '../../domain/catalog';
import { aabbSize, attachedRoomSurface, attachedWall, backWall, isFlushWith, itemRect, mountingWalls, attachedSegment } from '../../domain/geometry';
import type { KitchenItem, Material, Room } from '../../domain/types';
import { KIND_OPTIONS, resolveConfig, type BuildContext } from '../../engine/config';
import { FRONT_FINISHES, type FrontFinish } from '../../domain/style';
import { edgeText } from '../../engine/cuttingList';
import { unitParts } from '../../engine/parts';
import { useT, type CornerName, type Messages } from '../../i18n';
import { cn } from '../../lib/cn';
import * as actions from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useBuildContext, useIssues } from '../../store/derived';
import { useUiStore } from '../../store/uiStore';
import { KindIcon } from '../library/KindIcon';
import { PanelSection, Segmented, TooltipButton } from '../ui';
import { FrontPreview } from './FrontPreview';
import { NumberField, PickerField, TextField } from './NumberField';
import { commonSizes } from './commonSizes';
import { Stepper } from './Stepper';
import { canStackCabinet } from '../../domain/upperCabinets';
import { StackAboveButton } from './StackAboveButton';
import { ThreeTierSetup } from './ThreeTierSetup';

const CORNER_NAMES: Record<KitchenItem['rotation'], CornerName> = { 0: 'top-left', 90: 'top-right', 180: 'bottom-right', 270: 'bottom-left' };

function placementText(item: KitchenItem, room: Room, t: Messages): string {
  if (item.rotation % 90 !== 0) return attachedSegment(item, room) ? t.advancedRoom.attached : `${t.advancedRoom.angle}: ${Math.round(item.rotation * 10) / 10}`;
  if (item.kind === 'corner') {
    const rect = itemRect(item);
    const inCorner = mountingWalls(item).every((wall) => isFlushWith(rect, wall, room));
    return inCorner ? t.item.inCorner(CORNER_NAMES[item.rotation]) : t.item.notInCorner;
  }
  const wall = attachedWall(item, room);
  if (!wall && attachedRoomSurface(item, room)) return t.item.backAgainstOffset;
  return wall ? t.item.backAgainst(wall) : t.item.freeStanding(backWall(item.rotation));
}

export function ItemHeader({ item, handle, action }: { item: KitchenItem; handle?: ReactNode; action?: ReactNode }) {
  const t = useT();
  const room = useDesignStore((s) => s.design.room);
  return (
    <div className={cn('flex shrink-0 gap-2', handle ? 'items-center px-2 py-1' : 'items-start gap-3 border-b border-zinc-100 px-4 py-4')}>
      {handle ?? <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600">
        <KindIcon kind={item.kind} width={item.width} className="size-7" />
      </div>}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="truncate text-sm font-semibold text-zinc-900">
          {t.kinds[item.kind]}
          <span className="ml-1.5 font-medium text-zinc-400">{item.label}</span>
        </div>
        <div className="truncate text-xs text-zinc-500">{placementText(item, room, t)}</div>
      </div>
      {action}
      <TooltipButton tooltip={t.item.deselectTitle} aria-label={t.item.deselect} onClick={() => useUiStore.getState().select(null)} className={handle ? undefined : '-mr-2 -mt-1'}>
        <X className="size-4" />
      </TooltipButton>
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
  const t = useT();
  const materials = useDesignStore((s) => s.design.materials);
  const kitchen = materials.find((m) => m.id === kitchenWide);
  const materialLabel = (m: Material) => `${t.engine.material(m)} ${t.mm(m.thickness)} mm`;
  const options = [
    { value: '', label: t.item.kitchenBoard(kitchen ? materialLabel(kitchen) : '—') },
    ...materials.filter((m) => m.id !== kitchenWide).map((m) => ({ value: m.id, label: materialLabel(m) })),
  ];
  return (
    <PickerField
      label={label}
      value={item[field] && item[field] !== kitchenWide ? item[field] : ''}
      options={options}
      onChange={(value) => actions.setItemOption(item.id, field, value || undefined)}
    />
  );
}

/** Everything editable about one unit. Shared by the desktop panel and the phone sheet. */
export type ItemSection = 'size' | 'fronts' | 'materials' | 'parts';

export function ItemFields({ item, section }: { item: KitchenItem; section?: ItemSection }) {
  const t = useT();
  const inPlan = useUiStore((s) => s.view === 'plan');
  const locked = useUiStore((s) => s.view === '3d' && s.previewLockedIds.includes(item.id));
  const [sizeBlocked, setSizeBlocked] = useState(false);
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
    if (focusRequest === 'width' && (!section || section === 'size')) useUiStore.getState().requestFocus(null);
  }, [focusRequest, section]);

  const sizeField = (field: SizeField, label: string) => {
    const limits = sizeLimits(item, field);
    return (
      <NumberField
        label={label}
        title={`${limits.min}–${limits.max} mm`}
        value={field === 'width2' ? (item.width2 ?? item.width) : item[field]}
        min={limits.min}
        max={limits.max}
        picks={section ? commonSizes(item, field, room, inPlan) : undefined}
        autoFocus={field === 'width' && focusRequest === 'width'}
        onCommit={(value) => {
          const result = actions.setItemSize(item.id, field, value);
          setSizeBlocked(result === false);
          return result;
        }}
      />
    );
  };

  const hasCounts = Boolean(options.doors || options.drawers || options.shelves);
  const drawersOnly = config.doors === 0 && config.drawers > 0;
  const show = (tab: ItemSection) => !section || section === tab;

  return (
    <>
      {show('size') && <UnitIssues item={item} />}
      {show('size') && locked && <p role="status" className="border-b border-zinc-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">{t.view3d.previewLocked}</p>}

      {show('size') && <fieldset disabled={locked} className="min-w-0">
        <PanelSection title={t.item.size}>
          {sizeField('width', corner ? t.item.widthWallA : t.item.width)}
          {corner && sizeField('width2', t.item.widthWallB)}
          {sizeField('depth', t.item.depth)}
          {sizeField('height', t.item.height)}
          {!section && inPlan && <NumberField label={t.advancedRoom.angle} value={item.rotation} min={0} max={360} suffix="°" precision={1} onCommit={(angle) => actions.setItemAngle(item.id, angle)} />}
          {!inPlan && sizeBlocked && <p role="status" className="text-xs text-amber-800">{t.view3d.resizeBlocked}</p>}
        </PanelSection>
      </fieldset>}
      {show('size') && <ThreeTierSetup key={item.id} item={item} />}

      {show('size') && canStackCabinet(item) && (
        <PanelSection title={t.stacking.title}>
          <StackAboveButton item={item} />
          <p className="text-xs leading-relaxed text-zinc-600">{t.stacking.hint}</p>
          <details className="text-xs leading-relaxed text-zinc-600">
            <summary className="cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{t.stacking.installation}</summary>
            <p className="pt-2">{t.stacking.supplierNote}</p>
          </details>
        </PanelSection>
      )}

      {show('fronts') && <PanelSection title={hasCounts ? t.item.frontsAndShelves : t.item.frontView}>
        <FrontPreview item={item} ctx={ctx} />
        {item.kind === 'shelf' && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox"
          checked={item.shelfForm === 'floating'} onChange={(e) => actions.setItemOption(item.id, 'shelfForm', e.target.checked ? 'floating' : undefined)} />{t.item.floatingShelves}</label>}
        {options.doors && (
          <Stepper
            label={t.item.doors}
            fewerLabel={t.item.fewer.doors}
            moreLabel={t.item.more.doors}
            value={config.doors}
            {...options.doors}
            onChange={(v) => actions.setItemCount(item.id, 'doors', v)}
          />
        )}
        {options.drawers && (
          <Stepper
            label={t.item.drawers}
            fewerLabel={t.item.fewer.drawers}
            moreLabel={t.item.more.drawers}
            value={config.drawers}
            {...options.drawers}
            onChange={(v) => actions.setItemCount(item.id, 'drawers', v)}
          />
        )}
        {options.shelves && !drawersOnly && (
          <Stepper
            label={item.shelfForm === 'floating' ? t.item.intermediateShelves : t.item.shelves}
            fewerLabel={t.item.fewer.shelves}
            moreLabel={t.item.more.shelves}
            value={config.shelves}
            {...options.shelves}
            onChange={(v) => actions.setItemCount(item.id, 'shelves', v)}
          />
        )}
        {options.inset && (config.doors > 0 || config.drawers > 0) && (
          <OptionRow label={t.item.fronts}>
            <Segmented
              ariaLabel={t.item.doorType}
              size="sm"
              value={config.doorType}
              onChange={(doorType) => actions.setItemOption(item.id, 'doorType', doorType === construction.doorType ? undefined : doorType)}
              options={[
                { value: 'overlay', label: t.item.fullOverlay },
                { value: 'inset', label: t.item.inset },
              ]}
            />
          </OptionRow>
        )}
        {config.doors === 1 && (
          <OptionRow label={t.item.hinges}>
            <Segmented
              ariaLabel={t.item.hingeSide}
              size="sm"
              value={config.hinge}
              onChange={(hinge) => actions.setItemOption(item.id, 'hinge', hinge === 'left' ? undefined : hinge)}
              options={[
                { value: 'left', label: t.item.left },
                { value: 'right', label: t.item.right },
              ]}
            />
          </OptionRow>
        )}
        {drawersOnly && config.drawers > 1 && (
          <OptionRow label={t.item.drawerFronts}>
            <Segmented
              ariaLabel={t.item.drawerFronts}
              size="sm"
              value={config.drawerLayout}
              onChange={(layout) => actions.setItemOption(item.id, 'drawerLayout', layout === 'equal' ? undefined : layout)}
              options={[
                { value: 'equal', label: t.item.equal },
                { value: 'shallowTop', label: t.item.smallTop },
              ]}
            />
          </OptionRow>
        )}
      </PanelSection>}

      {section === 'materials' && !options.carcass && !options.fronts && <p className="p-4 text-sm text-studio-muted">{t.sheet.noMaterials}</p>}
      {show('materials') && (options.carcass || options.fronts) && (
        <PanelSection title={t.item.materials}>
          {options.carcass && <MaterialField item={item} field="carcassMaterial" label={item.kind === 'bar' ? t.item.barTop : t.item.carcass} kitchenWide={item.kind === 'bar' ? BAR_MATERIAL_ID : construction.carcassMaterial} />}
          {options.back && item.shelfForm !== 'floating' && <MaterialField item={item} field="backMaterial" label={t.item.backPanel} kitchenWide={construction.backMaterial} />}
          {options.fronts && <MaterialField item={item} field="frontMaterial" label={item.kind === 'glassWall' ? t.item.glass : t.item.fronts} kitchenWide={item.kind === 'glassWall' ? GLASS_MATERIAL_ID : construction.frontMaterial} />}
        </PanelSection>
      )}
      {show('materials') && (options.carcass || options.fronts) && (
        <PanelSection title={t.item.appearance}>
          <PickerField<FrontFinish | ''>
            label={t.item.frontFinish} value={item.frontFinish ?? ''}
            options={[{ value: '', label: t.item.inheritFinish }, ...(Object.keys(FRONT_FINISHES) as FrontFinish[]).map((value) => ({ value, label: t.style.frontFinishes[value] }))]}
            onChange={(value) => actions.setItemOption(item.id, 'frontFinish', value || undefined)}
          />
          <PickerField<FrontFinish | ''>
            label={t.item.carcassFinish} value={item.carcassFinish ?? ''}
            options={[{ value: '', label: t.item.inheritFinish }, ...(Object.keys(FRONT_FINISHES) as FrontFinish[]).map((value) => ({ value, label: t.style.frontFinishes[value] }))]}
            onChange={(value) => actions.setItemOption(item.id, 'carcassFinish', value || undefined)}
          />
          <p className="text-xs leading-relaxed text-zinc-600">{t.item.appearanceNote}</p>
        </PanelSection>
      )}

      {show('size') && inPlan && <fieldset className="min-w-0">
        <PanelSection title={t.item.position}>
          {section && <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <NumberField label={t.sheet.customAngle} value={item.rotation} min={0} max={360} suffix="°" precision={1} onCommit={(angle) => actions.setItemAngle(item.id, angle)} />
            </div>
            <RotateButton relative />
          </div>}
          <NumberField
            label={t.item.fromLeftWall}
            value={item.x}
            min={0}
            max={Math.max(0, room.width - footprint.w)}
            onCommit={(v) => actions.setItemPosition(item.id, v, item.y)}
          />
          <NumberField
            label={t.item.fromTopWall}
            value={item.y}
            min={0}
            max={Math.max(0, room.depth - footprint.h)}
            onCommit={(v) => actions.setItemPosition(item.id, item.x, v)}
          />
          <NumberField
            label={t.item.heightFromFloor}
            title={t.item.heightFromFloorTitle}
            value={item.elevation}
            min={ELEVATION_LIMITS.min}
            max={ELEVATION_LIMITS.max}
            onCommit={(v) => actions.setItemElevation(item.id, v)}
          />
          <p className="pl-[112px] text-[11px] text-zinc-400">{t.item.topEdgeAt(item.elevation + item.height)}</p>
        </PanelSection>
      </fieldset>}

      {show('size') && <PanelSection title={t.item.element}>
        <TextField label={t.item.code} value={item.label} maxLength={12} onCommit={(v) => actions.setItemLabel(item.id, v)} />
      </PanelSection>}

      {show('parts') && <PartsSection item={item} ctx={ctx} />}
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
  const t = useT();
  const edits = useDesignStore((s) => s.design.partEdits[item.id]);
  const parts = useMemo(() => unitParts(item, ctx, edits), [item, ctx, edits]);
  const pieces = parts.reduce((sum, p) => sum + p.quantity, 0);
  return (
    <PanelSection
      title={t.item.parts(pieces)}
      aside={
        <button
          type="button"
          onClick={() => useUiStore.getState().setView('list')}
          className="flex items-center text-[11px] font-medium text-blue-600 hover:underline"
        >
          {t.item.toCuttingList}
          <ChevronRight className="size-3.5" />
        </button>
      }
    >
      {parts.length === 0 ? (
        <p className="text-xs text-zinc-500">{t.item.nothingToCut}</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {parts.map((p, i) => (
            <li key={i} className={cn('flex items-baseline gap-2 py-1.5 text-xs', p.quantity <= 0 && 'opacity-50')}>
              <span className="w-6 shrink-0 font-semibold tabular-nums text-zinc-900">{p.quantity}×</span>
              <span className="min-w-0 flex-1 text-zinc-700">
                {p.name}
                {(p.note || p.edgeBandId || p.edited) && (
                  <span className="block text-[11px] leading-snug text-zinc-400">
                    {[
                      p.edited && (p.quantity <= 0 ? t.engine.leftOutByHand : t.engine.changedByHand),
                      p.edgeBandId && t.item.edges(edgeText(p, t.engine)),
                      p.note,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </span>
              <span className={cn('shrink-0 tabular-nums', p.edited ? 'font-medium text-blue-700' : 'text-zinc-500')}>
                {t.mm(p.length)} × {t.mm(p.width)}
                <span className="text-zinc-400"> · {t.mm(p.thickness)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
}

export function RotateButton({ relative = false }: { relative?: boolean }) {
  const t = useT();
  const inPlan = useUiStore((s) => s.view === 'plan');
  if (!inPlan) return null;
  return (
    <TooltipButton variant="outline" tooltip={t.item.turn90Hint} aria-label={t.item.turn90} onClick={() => actions.rotateSelected(1)}>
      <RotateCwSquare className="size-4" aria-hidden="true" />{relative ? '+90°' : '90°'}
    </TooltipButton>
  );
}

export function DuplicateButton({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const t = useT();
  return (
    <TooltipButton variant="outline" className={className} tooltip={t.item.duplicateTitle} aria-label={t.item.duplicate} onClick={actions.duplicateSelected}>
      <Copy className="size-4" />
      {!iconOnly && t.item.duplicate}
    </TooltipButton>
  );
}

export function DeleteButton({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const t = useT();
  return (
    <TooltipButton variant="danger" className={className} tooltip={t.item.deleteTitle} aria-label={t.item.delete} onClick={actions.deleteSelected}>
      <Trash2 className="size-4" />
      {!iconOnly && t.item.delete}
    </TooltipButton>
  );
}
