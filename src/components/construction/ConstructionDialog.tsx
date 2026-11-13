import { Copy, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { materialInUse } from '../../domain/designOps';
import type { ConstructionSettings, EdgeBand, Material } from '../../domain/types';
import { EDGE_LIMITS, MATERIAL_LIMITS, SETTING_LIMITS, type NumericSetting } from '../../engine/settings';
import { useIsCompact } from '../../hooks/useMediaQuery';
import * as actions from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore, type SettingsTab } from '../../store/uiStore';
import { CheckboxField, NumberField, SelectField, TextField } from '../properties/NumberField';
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

const materialLabel = (m: Material) => `${m.name} ${m.thickness} mm`;

function MaterialCard({ material, inUse }: { material: Material; inUse: boolean }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-zinc-200 p-3" data-testid="material-card">
      <TextField label="Name" value={material.name} maxLength={60} onCommit={(name) => actions.updateMaterial(material.id, { name: name.trim() })} />
      <NumberField label="Thickness" value={material.thickness} precision={1} {...MATERIAL_LIMITS.thickness} onCommit={(thickness) => actions.updateMaterial(material.id, { thickness })} />
      <NumberField label="Sheet length" value={material.sheetLength} {...MATERIAL_LIMITS.sheetLength} onCommit={(sheetLength) => actions.updateMaterial(material.id, { sheetLength })} />
      <NumberField label="Sheet width" value={material.sheetWidth} {...MATERIAL_LIMITS.sheetWidth} onCommit={(sheetWidth) => actions.updateMaterial(material.id, { sheetWidth })} />
      <NumberField
        label="Price per sheet"
        suffix=""
        title="Leave at 0 if you do not want costs in the cutting list"
        value={material.price}
        precision={2}
        {...MATERIAL_LIMITS.price}
        onCommit={(price) => actions.updateMaterial(material.id, { price })}
      />
      <div className="flex items-center justify-between pt-1">
        <CheckboxField
          label="Has grain"
          hint="Pieces keep the grain along their length"
          checked={material.grain}
          onChange={(grain) => actions.updateMaterial(material.id, { grain })}
        />
        <div className="flex gap-1">
          <Button title="Duplicate this board" aria-label={`Duplicate ${materialLabel(material)}`} onClick={() => actions.addMaterial(material)}>
            <Copy className="size-4" />
          </Button>
          <Button
            title={inUse ? 'In use by the kitchen; choose another board first' : 'Remove this board'}
            aria-label={`Remove ${materialLabel(material)}`}
            disabled={inUse}
            onClick={() => actions.removeMaterial(material.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function EdgeBandCard({ band }: { band: EdgeBand }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-zinc-200 p-3">
      <TextField label="Name" value={band.name} maxLength={60} onCommit={(name) => actions.updateEdgeBand(band.id, { name: name.trim() })} />
      <NumberField label="Thickness" value={band.thickness} precision={1} {...EDGE_LIMITS.thickness} onCommit={(thickness) => actions.updateEdgeBand(band.id, { thickness })} />
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <NumberField label="Price per metre" suffix="" value={band.price} precision={2} {...EDGE_LIMITS.price} onCommit={(price) => actions.updateEdgeBand(band.id, { price })} />
        </div>
        <Button title="Remove this edge band" aria-label={`Remove ${band.name}`} onClick={() => actions.removeEdgeBand(band.id)}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function MaterialsTab() {
  const design = useDesignStore((s) => s.design);
  const { construction: c, materials, edgeBands } = design;
  const materialOptions = materials.map((m) => ({ value: m.id, label: materialLabel(m) }));
  const bandOptions = [{ value: '', label: 'None' }, ...edgeBands.map((b) => ({ value: b.id, label: b.name }))];
  return (
    <>
      <PanelSection title="Used in this kitchen">
        <SelectField label="Carcass" value={c.carcassMaterial} options={materialOptions} onChange={(carcassMaterial) => actions.setConstruction({ carcassMaterial })} />
        <SelectField label="Back panels" value={c.backMaterial} options={materialOptions} onChange={(backMaterial) => actions.setConstruction({ backMaterial })} />
        <SelectField label="Fronts" value={c.frontMaterial} options={materialOptions} onChange={(frontMaterial) => actions.setConstruction({ frontMaterial })} />
        <p className="text-[11px] leading-snug text-zinc-400">A single unit can use a different board: select it on the plan.</p>
      </PanelSection>

      <PanelSection title="Edge banding">
        <SelectField
          label="Carcass edges"
          title="Front edges of sides, bottoms, tops, shelves and rails"
          value={c.carcassEdge ?? ''}
          options={bandOptions}
          onChange={(id) => actions.setConstruction({ carcassEdge: id || null })}
        />
        <SelectField
          label="Front edges"
          title="All four edges of doors, drawer fronts and panels; None for painted fronts"
          value={c.frontEdge ?? ''}
          options={bandOptions}
          onChange={(id) => actions.setConstruction({ frontEdge: id || null })}
        />
        <CheckboxField
          label="Cut parts smaller by the band thickness"
          hint="Parts come out at their finished size once edged. Leave off if your cutting service does this."
          checked={c.subtractEdges}
          onChange={(subtractEdges) => actions.setConstruction({ subtractEdges })}
        />
      </PanelSection>

      <PanelSection
        title="Boards"
        aside={
          <Button variant="outline" className="h-7" onClick={() => actions.addMaterial()}>
            <Plus className="size-3.5" />
            Add board
          </Button>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {materials.map((m) => (
            <MaterialCard key={m.id} material={m} inUse={materialInUse(design, m.id)} />
          ))}
        </div>
      </PanelSection>

      <PanelSection
        title="Edge bands"
        aside={
          <Button variant="outline" className="h-7" onClick={actions.addEdgeBand}>
            <Plus className="size-3.5" />
            Add edge band
          </Button>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {edgeBands.map((b) => (
            <EdgeBandCard key={b.id} band={b} />
          ))}
        </div>
      </PanelSection>
    </>
  );
}

function ConstructionTab() {
  const settings = useDesignStore((s) => s.design.construction);
  return (
    <>
      <PanelSection title="Carcass">
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice label="Bottom panel">
            <Segmented
              ariaLabel="Bottom panel"
              value={settings.bottomJoint}
              onChange={(bottomJoint) => actions.setConstruction({ bottomJoint })}
              options={[
                { value: 'between', label: 'Between the sides' },
                { value: 'under', label: 'Under the sides' },
              ]}
            />
          </Choice>
          <Choice label="Top panel">
            <Segmented
              ariaLabel="Top panel"
              value={settings.topJoint}
              onChange={(topJoint) => actions.setConstruction({ topJoint })}
              options={[
                { value: 'between', label: 'Between the sides' },
                { value: 'over', label: 'Over the sides' },
              ]}
            />
          </Choice>
          <Choice label="Top of base units" hint="Rails save board; the worktop covers the unit anyway.">
            <Segmented
              ariaLabel="Top of base units"
              value={settings.baseTop}
              onChange={(baseTop) => actions.setConstruction({ baseTop })}
              options={[
                { value: 'rails', label: 'Two rails' },
                { value: 'full', label: 'Full top' },
              ]}
            />
          </Choice>
          {settings.baseTop === 'rails' && (
            <div className="self-end">
              <SettingField settings={settings} field="railWidth" label="Rail width" />
            </div>
          )}
        </div>
      </PanelSection>

      <PanelSection title="Back panel">
        <Segmented
          ariaLabel="Back panel"
          value={settings.backMount}
          onChange={(backMount) => actions.setConstruction({ backMount })}
          options={[
            { value: 'nailed', label: 'Nailed on the back' },
            { value: 'groove', label: 'Set into grooves' },
          ]}
        />
        {settings.backMount === 'nailed' ? (
          <SettingField settings={settings} field="backInset" label="Inset from edges" title="How far the back stays inside the outer edges of the carcass, on every side" />
        ) : (
          <>
            <SettingField settings={settings} field="grooveDepth" label="Groove depth" />
            <SettingField settings={settings} field="grooveOffset" label="Groove from back" title="Distance from the rear edge of the panels to the back panel" />
          </>
        )}
        <p className="text-[11px] leading-snug text-zinc-400">
          Sink and oven units are left open at the back. Corner units always have their two backs nailed on.
        </p>
      </PanelSection>

      <PanelSection title="Doors and fronts">
        <Choice label="Doors" hint="Units can choose their own. Corner units and integrated appliances are always full overlay.">
          <Segmented
            ariaLabel="Door type"
            value={settings.doorType}
            onChange={(doorType) => actions.setConstruction({ doorType })}
            options={[
              { value: 'overlay', label: 'Full overlay' },
              { value: 'inset', label: 'Inset' },
            ]}
          />
        </Choice>
        <SettingField settings={settings} field="frontGap" label="Gap between fronts" title="Between neighbouring doors and drawers" />
        <SettingField settings={settings} field="drawerFrontHeight" label="Small drawers" title="Height of drawer fronts above doors, and of a shallow top drawer" />
        <SettingField settings={settings} field="shelfSetback" label="Shelf set back" title="Shelves stop this far behind the front edge of the carcass" />
      </PanelSection>

      <PanelSection title="Drawers">
        <Segmented
          ariaLabel="Drawer system"
          value={settings.drawerSystem}
          onChange={(drawerSystem) => actions.setConstruction({ drawerSystem })}
          options={[
            { value: 'wooden', label: 'Wooden boxes' },
            { value: 'metal', label: 'Metal system' },
          ]}
        />
        {settings.drawerSystem === 'wooden' ? (
          <>
            <SettingField settings={settings} field="slideClearance" label="Slide space" title="Space for the drawer slide on each side of the box" />
            <SettingField settings={settings} field="drawerBoxGap" label="Box lower by" title="How much lower the drawer box is than its front" />
          </>
        ) : (
          <>
            <SettingField settings={settings} field="metalBottomDeduction" label="Bottom: width −" title="The bottom panel is the inside width of the unit minus this" />
            <SettingField settings={settings} field="metalBackDeduction" label="Back: width −" title="The back panel is the inside width of the unit minus this" />
            <SettingField settings={settings} field="metalDepthDeduction" label="Bottom: length −" title="The bottom panel is the runner length minus this" />
            <SettingField settings={settings} field="drawerBoxGap" label="Back lower by" title="How much lower the back panel is than the drawer front" />
            <p className="text-[11px] leading-snug text-zinc-400">
              Only the bottom and back are cut; the sides come with the system. The defaults are Blum TANDEMBOX values: check your
              system’s catalogue.
            </p>
          </>
        )}
        <p className="text-[11px] leading-snug text-zinc-400">Runners are the longest standard size (250–650 mm) that fits inside the unit.</p>
      </PanelSection>
    </>
  );
}

/** Kitchen-wide settings: the materials library and edge bands, and the construction rules. */
export function ConstructionDialog() {
  const tab = useUiStore((s) => s.settingsTab);
  const compact = useIsCompact();
  const close = () => useUiStore.getState().setSettingsTab(null);
  return (
    <Dialog
      open={tab !== null}
      title="Kitchen settings"
      onClose={close}
      sheet={compact}
      wide
      footer={
        <>
          {tab === 'construction' && (
            <Button variant="outline" onClick={actions.resetConstruction} className="mr-auto">
              Reset to defaults
            </Button>
          )}
          <Button variant="primary" onClick={close} className="px-4">
            Done
          </Button>
        </>
      }
    >
      <div className="sticky top-0 z-10 border-b border-zinc-100 bg-white px-5 py-3">
        <Segmented<SettingsTab>
          ariaLabel="Settings"
          value={tab ?? 'materials'}
          onChange={(next) => useUiStore.getState().setSettingsTab(next)}
          options={[
            { value: 'materials', label: 'Materials and edges' },
            { value: 'construction', label: 'Construction' },
          ]}
        />
        <p className="pt-2 text-xs leading-relaxed text-zinc-500">
          These apply to every unit in the kitchen; all part sizes in the cutting list are calculated from them.
        </p>
      </div>
      {tab === 'construction' ? <ConstructionTab /> : <MaterialsTab />}
    </Dialog>
  );
}
