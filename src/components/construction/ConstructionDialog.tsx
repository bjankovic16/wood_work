import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, type ReactNode } from 'react';
import { materialInUse } from '../../domain/designOps';
import type { ConstructionSettings, EdgeBand, Material } from '../../domain/types';
import { unitParts } from '../../engine/parts';
import { EDGE_LIMITS, MATERIAL_LIMITS, SETTING_LIMITS, type NumericSetting } from '../../engine/settings';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT, type Messages } from '../../i18n';
import { CURRENCY } from '../../i18n/money';
import * as actions from '../../store/actions';
import { useBuildContext } from '../../store/derived';
import { useDesignStore } from '../../store/designStore';
import { useUiStore, type SettingsTab } from '../../store/uiStore';
import { CheckboxField, NumberField, PickerField, TextField } from '../properties/NumberField';
import { Button, Dialog, PanelSection, Segmented } from '../ui';

function Choice({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-zinc-500">{label}</div>
      {children}
      {hint && <p className="text-[11px] leading-snug text-zinc-400">{hint}</p>}
    </div>
  );
}

function SettingField({ settings, field, label, title }: { settings: ConstructionSettings; field: NumericSetting; label: string; title?: string }) {
  return (
    <NumberField
      label={label}
      title={title}
      value={settings[field]}
      {...SETTING_LIMITS[field]}
      onCommit={(value) => actions.setConstruction({ [field]: value })}
    />
  );
}

/** A board as listed: its name in the interface language and its thickness. */
const boardLabel = (m: Material, t: Messages) => `${t.engine.material(m)} ${t.mm(m.thickness)} mm`;

function MaterialCard({ material, used, locked, group }: { material: Material; used: boolean; locked: boolean; group: string }) {
  const t = useT();
  const s = t.settings;
  const name = t.engine.material(material);
  return (
    <details name={group} className="min-w-0 rounded-lg border border-zinc-200 bg-white" data-testid="material-card" data-material-id={material.id}>
      <summary className="board-summary rounded-lg">
        <span className="board-name min-w-0 flex-1 truncate" title={name}>{name}</span>
        {used && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800" title={s.usedBoard}>
          <Check className="size-3" aria-hidden="true" /><span className="max-[400px]:sr-only">{s.usedBoard}</span>
        </span>}
        <span className="board-size shrink-0 whitespace-nowrap text-xs font-normal tabular-nums text-studio-muted">
          {t.mm(material.sheetLength)}×{t.mm(material.sheetWidth)}×{t.mm(material.thickness)} mm
        </span>
        <span className="board-price shrink-0 whitespace-nowrap text-xs tabular-nums">{material.price > 0 ? t.money(material.price) : `— ${CURRENCY}`}</span>
      </summary>
      <div className="grid gap-2 border-t border-zinc-100 p-3 sm:grid-cols-2">
        <TextField label={s.name} value={name} maxLength={60} onCommit={(name) => actions.updateMaterial(material.id, { name: name.trim() })} />
        <NumberField label={s.thickness} value={material.thickness} precision={1} {...MATERIAL_LIMITS.thickness} onCommit={(thickness) => actions.updateMaterial(material.id, { thickness })} />
        <NumberField label={s.sheetLength} value={material.sheetLength} {...MATERIAL_LIMITS.sheetLength} onCommit={(sheetLength) => actions.updateMaterial(material.id, { sheetLength })} />
        <NumberField label={s.sheetWidth} value={material.sheetWidth} {...MATERIAL_LIMITS.sheetWidth} onCommit={(sheetWidth) => actions.updateMaterial(material.id, { sheetWidth })} />
        <NumberField
          label={`${s.pricePerSheet} (${CURRENCY})`}
          shortLabel={s.pricePerSheet}
          suffix={CURRENCY}
          title={s.priceTitle}
          value={material.price}
          precision={2}
          {...MATERIAL_LIMITS.price}
          onCommit={(price) => actions.updateMaterial(material.id, { price })}
        />
        <div className="flex items-center justify-between gap-2">
          <CheckboxField label={s.hasGrain} hint={s.grainHint} checked={material.grain} onChange={(grain) => actions.updateMaterial(material.id, { grain })} />
          <div className="flex gap-1">
            <Button title={s.duplicateBoard} aria-label={s.duplicateNamed(boardLabel(material, t))} onClick={() => actions.addMaterial(material)}>
              <Copy className="size-4" />
            </Button>
            <Button
              title={locked ? s.inUse : s.removeBoard}
              aria-label={s.removeNamed(boardLabel(material, t))}
              disabled={locked}
              onClick={() => actions.removeMaterial(material.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}

function EdgeBandCard({ band }: { band: EdgeBand }) {
  const t = useT();
  const s = t.settings;
  const name = t.engine.edgeBand(band);
  return (
    <div data-testid="edge-band-card" className="edge-band-card min-w-0 space-y-2 rounded-lg border border-zinc-200 p-3">
      <TextField label={s.name} value={name} maxLength={60} onCommit={(next) => actions.updateEdgeBand(band.id, { name: next.trim() })} />
      <NumberField label={s.thickness} value={band.thickness} precision={1} {...EDGE_LIMITS.thickness} onCommit={(thickness) => actions.updateEdgeBand(band.id, { thickness })} />
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <NumberField label={`${s.pricePerMetre} (${CURRENCY})`} shortLabel={s.pricePerMetre} suffix={CURRENCY} value={band.price} precision={2} {...EDGE_LIMITS.price} onCommit={(price) => actions.updateEdgeBand(band.id, { price })} />
        </div>
        <Button className="self-end" title={s.removeBand} aria-label={s.removeNamed(name)} onClick={() => actions.removeEdgeBand(band.id)}>
          <Trash2 className="size-4" /><span className="lg:hidden">{s.removeBand}</span>
        </Button>
      </div>
    </div>
  );
}

function MaterialsTab() {
  const t = useT();
  const s = t.settings;
  const design = useDesignStore((st) => st.design);
  const ctx = useBuildContext();
  const group = useId();
  // Count stock that will actually be cut, including per-piece overrides and extra pieces.
  // Being protected from deletion (e.g. a kitchen default) is a separate rule.
  const used = useMemo(() => {
    const ids = new Set(design.customParts.filter((p) => p.quantity > 0).map((p) => p.materialId));
    for (const item of design.items) {
      for (const part of unitParts(item, ctx, design.partEdits[item.id])) {
        if (part.quantity > 0) ids.add(part.materialId);
      }
    }
    return ids;
  }, [ctx, design.customParts, design.items, design.partEdits]);
  const { construction: c, materials, edgeBands } = design;
  const materialOptions = materials.map((m) => ({ value: m.id, label: boardLabel(m, t) }));
  const bandOptions = [{ value: '', label: s.noBand }, ...edgeBands.map((b) => {
    const name = t.engine.edgeBand(b), thickness = `${t.mm(b.thickness)} mm`;
    return { value: b.id, label: name.endsWith(` ${thickness}`) ? name : `${name} · ${thickness}` };
  })];
  return (
    <>
      <PanelSection title={s.usedInKitchen}>
        <PickerField label={s.carcass} value={c.carcassMaterial} options={materialOptions} onChange={(carcassMaterial) => actions.setConstruction({ carcassMaterial })} />
        <PickerField label={s.backPanels} value={c.backMaterial} options={materialOptions} onChange={(backMaterial) => actions.setConstruction({ backMaterial })} />
        <PickerField label={s.fronts} value={c.frontMaterial} options={materialOptions} onChange={(frontMaterial) => actions.setConstruction({ frontMaterial })} />
        <p className="text-[11px] leading-snug text-zinc-400">{s.unitOverrideHint}</p>
      </PanelSection>

      <PanelSection title={s.edgeBanding}>
        <PickerField
          label={s.carcassEdges}
          title={s.carcassEdgesTitle}
          value={c.carcassEdge ?? ''}
          options={bandOptions}
          onChange={(id) => actions.setConstruction({ carcassEdge: id || null })}
        />
        <PickerField
          label={s.frontEdges}
          title={s.frontEdgesTitle}
          value={c.frontEdge ?? ''}
          options={bandOptions}
          onChange={(id) => actions.setConstruction({ frontEdge: id || null })}
        />
        <CheckboxField label={s.subtract} hint={s.subtractHint} checked={c.subtractEdges} onChange={(subtractEdges) => actions.setConstruction({ subtractEdges })} />
      </PanelSection>

      <PanelSection
        title={s.boards}
        aside={
          <Button variant="outline" className="h-7" onClick={() => actions.addMaterial()}>
            <Plus className="size-3.5" />
            {s.addBoard}
          </Button>
        }
      >
        <div className="grid gap-1.5">
          {[...materials].sort((a, b) => Number(used.has(b.id)) - Number(used.has(a.id))).map((m) => (
            <MaterialCard key={m.id} material={m} used={used.has(m.id)} locked={materialInUse(design, m.id)} group={group} />
          ))}
        </div>
      </PanelSection>

      <PanelSection
        title={s.edgeBands}
        aside={
          <Button variant="outline" className="h-7" onClick={actions.addEdgeBand}>
            <Plus className="size-3.5" />
            {s.addEdgeBand}
          </Button>
        }
      >
        <div className="grid gap-2 lg:grid-cols-2">
          {edgeBands.map((b) => (
            <EdgeBandCard key={b.id} band={b} />
          ))}
        </div>
      </PanelSection>
    </>
  );
}

function ConstructionTab() {
  const s = useT().settings;
  const settings = useDesignStore((st) => st.design.construction);
  return (
    <>
      <PanelSection title={s.carcassSection}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice label={s.bottomPanel}>
            <Segmented
              ariaLabel={s.bottomPanel}
              value={settings.bottomJoint}
              onChange={(bottomJoint) => actions.setConstruction({ bottomJoint })}
              options={[
                { value: 'between', label: s.betweenSides },
                { value: 'under', label: s.underSides },
              ]}
            />
          </Choice>
          <Choice label={s.topPanel}>
            <Segmented
              ariaLabel={s.topPanel}
              value={settings.topJoint}
              onChange={(topJoint) => actions.setConstruction({ topJoint })}
              options={[
                { value: 'between', label: s.betweenSides },
                { value: 'over', label: s.overSides },
              ]}
            />
          </Choice>
          <Choice label={s.topOfBase} hint={s.topOfBaseHint}>
            <Segmented
              ariaLabel={s.topOfBase}
              value={settings.baseTop}
              onChange={(baseTop) => actions.setConstruction({ baseTop })}
              options={[
                { value: 'rails', label: s.twoRails },
                { value: 'full', label: s.fullTop },
              ]}
            />
          </Choice>
          {settings.baseTop === 'rails' && (
            <div className="self-end">
              <SettingField settings={settings} field="railWidth" label={s.railWidth} />
            </div>
          )}
        </div>
      </PanelSection>

      <PanelSection title={s.backPanel}>
        <Segmented
          ariaLabel={s.backPanel}
          value={settings.backMount}
          onChange={(backMount) => actions.setConstruction({ backMount })}
          options={[
            { value: 'nailed', label: s.nailed },
            { value: 'groove', label: s.grooved },
          ]}
        />
        {settings.backMount === 'nailed' ? (
          <SettingField settings={settings} field="backInset" label={s.backInset} title={s.backInsetTitle} />
        ) : (
          <>
            <SettingField settings={settings} field="grooveDepth" label={s.grooveDepth} />
            <SettingField settings={settings} field="grooveOffset" label={s.grooveOffset} title={s.grooveOffsetTitle} />
          </>
        )}
        <p className="text-[11px] leading-snug text-zinc-400">{s.backNote}</p>
      </PanelSection>

      <PanelSection title={s.doorsAndFronts}>
        <Choice label={s.doors} hint={s.doorsHint}>
          <Segmented
            ariaLabel={s.doorType}
            value={settings.doorType}
            onChange={(doorType) => actions.setConstruction({ doorType })}
            options={[
              { value: 'overlay', label: s.fullOverlay },
              { value: 'inset', label: s.inset },
            ]}
          />
        </Choice>
        <SettingField settings={settings} field="frontGap" label={s.frontGap} title={s.frontGapTitle} />
        <SettingField settings={settings} field="drawerFrontHeight" label={s.smallDrawers} title={s.smallDrawersTitle} />
        <SettingField settings={settings} field="shelfSetback" label={s.shelfSetback} title={s.shelfSetbackTitle} />
      </PanelSection>

      <PanelSection title={s.drawers}>
        <Segmented
          ariaLabel={s.drawerSystem}
          value={settings.drawerSystem}
          onChange={(drawerSystem) => actions.setConstruction({ drawerSystem })}
          options={[
            { value: 'wooden', label: s.wooden },
            { value: 'metal', label: s.metal },
          ]}
        />
        {settings.drawerSystem === 'wooden' ? (
          <>
            <SettingField settings={settings} field="slideClearance" label={s.slideSpace} title={s.slideSpaceTitle} />
            <SettingField settings={settings} field="drawerBoxGap" label={s.boxLower} title={s.boxLowerTitle} />
          </>
        ) : (
          <>
            <SettingField settings={settings} field="metalBottomDeduction" label={s.bottomWidth} title={s.bottomWidthTitle} />
            <SettingField settings={settings} field="metalBackDeduction" label={s.backWidth} title={s.backWidthTitle} />
            <SettingField settings={settings} field="metalDepthDeduction" label={s.bottomLength} title={s.bottomLengthTitle} />
            <SettingField settings={settings} field="drawerBoxGap" label={s.backLower} title={s.backLowerTitle} />
            <p className="text-[11px] leading-snug text-zinc-400">{s.metalNote}</p>
          </>
        )}
        <p className="text-[11px] leading-snug text-zinc-400">{s.runnersNote}</p>
      </PanelSection>
    </>
  );
}

/** Kitchen-wide settings: the materials library and edge bands, and the construction rules. */
export function ConstructionDialog() {
  const t = useT();
  const tab = useUiStore((s) => s.settingsTab);
  const compact = useIsCompact();
  const close = () => useUiStore.getState().setSettingsTab(null);
  return (
    <Dialog
      open={tab !== null}
      title={t.settings.title}
      onClose={close}
      sheet={compact}
      wide
      footer={
        <>
          {tab === 'construction' && (
            <Button variant="outline" onClick={actions.resetConstruction} className="mr-auto">
              {t.settings.reset}
            </Button>
          )}
          <Button variant="primary" onClick={close} className="px-4">
            {t.common.done}
          </Button>
        </>
      }
    >
      <div data-sheet-sticky="" className="sticky top-0 z-10 border-b border-zinc-100 bg-white px-5 py-3">
        <Segmented<SettingsTab>
          ariaLabel={t.settings.tabs}
          value={tab ?? 'materials'}
          onChange={(next) => useUiStore.getState().setSettingsTab(next)}
          options={[
            { value: 'materials', label: t.settings.materialsTab },
            { value: 'construction', label: t.settings.constructionTab },
          ]}
        />
        <p className="pt-2 text-xs leading-relaxed text-zinc-500">{t.settings.intro}</p>
      </div>
      {tab === 'construction' ? <ConstructionTab /> : <MaterialsTab />}
    </Dialog>
  );
}
