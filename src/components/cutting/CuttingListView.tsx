import {
  Check,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Printer,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { evaluateExpression } from '../../domain/math';
import type { CustomPart, Design, Material, PartEdit } from '../../domain/types';
import { buildCuttingList, cuttingListCsv, edgeText, type CuttingList, type CuttingRow } from '../../engine/cuttingList';
import type { Part } from '../../engine/parts';
import { planSvg } from '../../export/planSvg';
import { useCanSaveFiles } from '../../hooks/useCanSaveFiles';
import { useT, type Messages } from '../../i18n';
import { cn } from '../../lib/cn';
import { embedded, safeFileName, saveFile } from '../../lib/platform';
import * as actions from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useBuildContext, useIssues, usePrecutChecklist } from '../../store/derived';
import { useUiStore } from '../../store/uiStore';
import { NumberField, SelectField, TextField } from '../properties/NumberField';
import { FrontPreview } from '../properties/FrontPreview';
import { Button, Menu, Segmented } from '../ui';

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-400';
const td = 'px-3 py-2 align-top';

type TableRow = Part & { materialName: string; bandName?: string | null; units?: string[] };

/** A board as listed: its name in the interface language and its thickness. */
const boardLabel = (m: Material, t: Messages) => `${t.engine.material(m)} ${t.mm(m.thickness)} mm`;

/** Quantity, size and board of one piece, changed in place. */
function PartEditor({ part, itemId, colSpan, onDone }: { part: TableRow; itemId: string; colSpan: number; onDone: () => void }) {
  const t = useT();
  const e = t.cutting.editor;
  const materials = useDesignStore((s) => s.design.materials);
  const [quantity, setQuantity] = useState(String(part.quantity));
  const [length, setLength] = useState(t.number(part.length));
  const [width, setWidth] = useState(t.number(part.width));
  const [materialId, setMaterialId] = useState(part.materialId);
  const [invalid, setInvalid] = useState(false);
  const calculated = part.calculated ?? { length: part.length, width: part.width, quantity: part.quantity, materialId: part.materialId, thickness: part.thickness };
  const chosen = materials.find((m) => m.id === materialId);
  const save = () => {
    const q = evaluateExpression(quantity);
    const l = evaluateExpression(length);
    const w = evaluateExpression(width);
    if (q === null || l === null || w === null || q < 0 || q > 999 || l <= 0 || w <= 0 || l > 6000 || w > 6000) {
      setInvalid(true);
      return;
    }
    // Keep only what differs from the calculation; matching it again removes the change.
    const next = { quantity: Math.round(q), length: Math.round(l * 10) / 10, width: Math.round(w * 10) / 10 };
    const edit: PartEdit = {};
    if (next.quantity !== calculated.quantity) edit.quantity = next.quantity;
    if (next.length !== calculated.length) edit.length = next.length;
    if (next.width !== calculated.width) edit.width = next.width;
    if (materialId !== calculated.materialId) edit.materialId = materialId;
    actions.setPartEdit(itemId, part.key, Object.keys(edit).length > 0 ? edit : undefined);
    onDone();
  };
  const input = (label: string, value: string, set: (v: string) => void, size: string, autoFocus = false) => (
    <label className="flex items-center gap-1 text-xs text-zinc-500">
      {label}
      <input
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        onFocus={(ev) => ev.currentTarget.select()}
        value={value}
        aria-invalid={invalid}
        onChange={(ev) => {
          set(ev.target.value);
          setInvalid(false);
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') save();
          if (ev.key === 'Escape') onDone();
        }}
        className={cn(
          'h-8 rounded-md border bg-white px-2 text-right text-base tabular-nums focus:outline-none sm:text-sm',
          invalid ? 'border-red-400 focus:border-red-500' : 'border-zinc-300 focus:border-blue-500',
          size,
        )}
      />
    </label>
  );
  const calculatedBoard = materials.find((m) => m.id === calculated.materialId);
  return (
    <tr className="bg-blue-50/50" data-testid="part-editor">
      <td className={cn(td, 'font-medium text-zinc-900')}>{part.name}</td>
      <td className={td} colSpan={colSpan - 1}>
        <div className="flex flex-wrap items-center gap-3">
          {input(e.qty, quantity, setQuantity, 'w-14', true)}
          {input(e.length, length, setLength, 'w-20')}
          {input(e.width, width, setWidth, 'w-20')}
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            {e.board}
            <select
              aria-label={e.board}
              value={materialId}
              onChange={(ev) => setMaterialId(ev.target.value)}
              className="h-8 max-w-76 rounded-md border border-zinc-300 bg-white px-1.5 text-base text-zinc-900 focus:border-blue-500 focus:outline-none sm:text-sm"
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {boardLabel(m, t)}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" className="h-8" onClick={save}>
            <Check className="size-4" />
            {e.save}
          </Button>
          <Button onClick={onDone} aria-label={e.cancel} title={e.cancelTitle}>
            <X className="size-4" />
          </Button>
        </div>
        <p className={cn('mt-1.5 text-xs', invalid ? 'font-medium text-red-700' : 'text-zinc-500')}>
          {invalid
            ? e.invalid
            : e.calculated(calculated.quantity, t.mm(calculated.length), t.mm(calculated.width), calculatedBoard ? boardLabel(calculatedBoard, t) : null)}
          {!invalid && chosen && chosen.thickness !== calculated.thickness && (
            <span className="font-medium text-amber-700">{e.thicker(t.mm(calculated.thickness))}</span>
          )}
        </p>
      </td>
    </tr>
  );
}

function PartsTable({
  rows,
  showUnits,
  bandThickness,
  editFor,
}: {
  rows: TableRow[];
  showUnits: boolean;
  bandThickness: (id: string | null) => number | null;
  /** Unit whose pieces can be changed by hand. */
  editFor?: string;
}) {
  const t = useT();
  const c = t.cutting;
  const [editing, setEditing] = useState<string | null>(null);
  const columns = 8 + (showUnits ? 1 : 0) + (editFor ? 1 : 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white print:overflow-visible print:rounded-none print:border-zinc-400">
      <table className="w-full min-w-180 border-collapse text-[13px] print:min-w-0 print:text-[11px]">
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <th className={th}>{c.piece}</th>
            <th className={cn(th, 'text-right')}>{c.qty}</th>
            <th className={cn(th, 'text-right')}>{c.length}</th>
            <th className={cn(th, 'text-right')}>{c.width}</th>
            <th className={cn(th, 'text-right')}>{c.thick}</th>
            <th className={cn(th, 'min-w-44 print:min-w-0')}>{c.material}</th>
            <th className={th} title={c.edgesTitle}>
              {c.edges}
            </th>
            {showUnits && <th className={th}>{c.units}</th>}
            <th className={th}>{c.note}</th>
            {editFor && <th className={cn(th, 'print:hidden')} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 tabular-nums">
          {rows.map((row, i) => {
            if (editFor && editing === row.key) {
              return <PartEditor key={row.key} part={row} itemId={editFor} colSpan={columns} onDone={() => setEditing(null)} />;
            }
            const band = bandThickness(row.edgeBandId);
            /** Highlights a value that differs from the calculation. */
            const changed = (key: 'quantity' | 'length' | 'width' | 'thickness' | 'materialId') =>
              row.calculated !== undefined && row.calculated[key] !== row[key] && 'font-semibold text-blue-700';
            return (
              <tr key={`${row.key}-${i}`} className={cn('break-inside-avoid hover:bg-zinc-50/60', row.quantity <= 0 && 'text-zinc-400 [&_td]:text-zinc-400')}>
                <td className={cn(td, 'font-medium text-zinc-900')}>
                  {row.name}
                  {row.edited && (
                    <span
                      className="ml-1.5 rounded bg-blue-50 px-1 text-[10px] font-medium uppercase tracking-wide text-blue-700"
                      title={
                        row.calculated
                          ? c.calculatedTitle(row.calculated.quantity, t.mm(row.calculated.length), t.mm(row.calculated.width), t.mm(row.calculated.thickness))
                          : c.changedByHand
                      }
                    >
                      {row.quantity <= 0 ? c.leftOutBadge : c.changedBadge}
                    </span>
                  )}
                </td>
                <td className={cn(td, 'text-right font-semibold text-zinc-900', changed('quantity'))}>{row.quantity}</td>
                <td className={cn(td, 'text-right', changed('length'))}>{t.mm(row.length)}</td>
                <td className={cn(td, 'text-right', changed('width'))}>{t.mm(row.width)}</td>
                <td className={cn(td, 'text-right', changed('thickness'))}>{t.mm(row.thickness)}</td>
                <td className={cn(td, 'text-zinc-600', changed('materialId'))}>
                  {row.materialName}
                  {row.grain && <span className="ml-1 text-[11px] text-zinc-400">{c.grain}</span>}
                </td>
                <td className={cn(td, 'whitespace-nowrap text-zinc-600')}>
                  {row.edgeBandId ? (
                    <>
                      {edgeText(row, t.engine)}
                      {band !== null && <span className="text-zinc-400"> · {t.mm(band)} mm</span>}
                    </>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                {showUnits && <td className={cn(td, 'text-zinc-600')}>{row.units?.join(', ')}</td>}
                <td className={cn(td, 'text-xs text-zinc-500')}>{row.note}</td>
                {editFor && (
                  <td className={cn(td, 'whitespace-nowrap py-1 text-right print:hidden')}>
                    {row.edited && (
                      <Button title={c.undoChangeTitle} aria-label={c.undoChangeAria(row.name)} onClick={() => actions.setPartEdit(editFor, row.key, undefined)}>
                        <Undo2 className="size-4" />
                      </Button>
                    )}
                    <Button title={c.changeTitle} aria-label={c.changeAria(row.name)} onClick={() => setEditing(row.key)}>
                      <Pencil className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CustomPartCard({ part, design }: { part: CustomPart; design: Design }) {
  const t = useT();
  const x = t.cutting.extra;
  const update = (patch: Partial<Omit<CustomPart, 'id'>>) => actions.updateCustomPart(part.id, patch);
  const edgeCounts = x.edgeCounts.map((label, count) => ({ value: String(count), label }));
  return (
    <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-white p-3" data-testid="custom-part">
      <TextField label={x.name} value={part.name} maxLength={40} onCommit={(name) => update({ name: name.trim() })} />
      <NumberField label={x.quantity} suffix={x.pcs} value={part.quantity} min={1} max={999} onCommit={(quantity) => update({ quantity })} />
      <NumberField label={x.length} title={x.lengthTitle} value={part.length} min={1} max={6000} precision={1} onCommit={(length) => update({ length })} />
      <NumberField label={x.width} value={part.width} min={1} max={6000} precision={1} onCommit={(width) => update({ width })} />
      <SelectField
        label={x.material}
        value={part.materialId}
        options={design.materials.map((m) => ({ value: m.id, label: boardLabel(m, t) }))}
        onChange={(materialId) => update({ materialId })}
      />
      <SelectField
        label={x.band}
        value={part.edgeBandId ?? ''}
        options={[{ value: '', label: x.noBand }, ...design.edgeBands.map((b) => ({ value: b.id, label: t.engine.edgeBand(b) }))]}
        onChange={(id) => update({ edgeBandId: id || null })}
      />
      {part.edgeBandId && (
        <>
          <SelectField label={x.lengthEdges} value={String(part.edgesLength)} options={edgeCounts} onChange={(v) => update({ edgesLength: Number(v) })} />
          <SelectField label={x.widthEdges} value={String(part.edgesWidth)} options={edgeCounts} onChange={(v) => update({ edgesWidth: Number(v) })} />
        </>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TextField label={x.note} value={part.note} maxLength={80} allowEmpty onCommit={(note) => update({ note: note.trim() })} />
        </div>
        <Button title={x.remove} aria-label={x.removeAria(part.name)} onClick={() => actions.removeCustomPart(part.id)}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Pieces the units do not include, added by hand. */
function ExtraPieces({ design }: { design: Design }) {
  const x = useT().cutting.extra;
  return (
    <section className="mt-8 print:hidden" aria-label={x.title}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">{x.title}</h2>
        <Button variant="outline" onClick={actions.addCustomPart}>
          <Plus className="size-4" />
          {x.add}
        </Button>
      </div>
      {design.customParts.length === 0 ? (
        <p className="text-[13px] text-zinc-500">{x.hint}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {design.customParts.map((part) => (
            <CustomPartCard key={part.id} part={part} design={design} />
          ))}
        </div>
      )}
    </section>
  );
}

type ExportKind = 'pdf' | 'xlsx' | 'csv';

/** The "Cutting list" section: every piece to cut, grouped, with board, edging and hardware totals. */
export function CuttingListView() {
  const t = useT();
  const c = t.cutting;
  const design = useDesignStore((s) => s.design);
  const list: CuttingList = useMemo(() => buildCuttingList(design, t.engine), [design, t.engine]);
  const ctx = useBuildContext();
  const plan = useMemo(() => planSvg(design, t.engine), [design, t.engine]);
  const issues = useIssues();
  const checklist = usePrecutChecklist();
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const [grouping, setGrouping] = useState<'pieces' | 'units'>('pieces');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const canSave = useCanSaveFiles();
  const unitsWithParts = list.units.filter((u) => u.parts.length > 0);
  const preview = unitsWithParts.find(({ item }) => item.id === previewId) ?? unitsWithParts[0];
  const bandThickness = (id: string | null) => (id ? (design.edgeBands.find((b) => b.id === id)?.thickness ?? null) : null);
  const materialName = (id: string) => {
    const material = design.materials.find((m) => m.id === id);
    return material ? t.engine.material(material) : t.engine.unknownBoard;
  };
  const ui = useUiStore.getState();
  const empty = list.rows.length === 0;

  const flash = (message: string, sticky = false) => {
    setStatus(message);
    if (!sticky) window.setTimeout(() => setStatus((current) => (current === message ? null : current)), 3000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cuttingListCsv(list, '\t', t.engine));
      flash(c.copied);
    } catch {
      flash(c.copyBlocked);
    }
  };
  const exportAs = async (kind: ExportKind) => {
    const name = c.fileName(safeFileName(design.name), kind);
    flash(kind === 'pdf' ? c.preparingPdf : kind === 'xlsx' ? c.preparingXlsx : c.preparingFile, true);
    let file: Blob;
    try {
      if (kind === 'csv') {
        // The byte-order mark makes spreadsheet programs read the file as UTF-8.
        file = new Blob(['﻿', cuttingListCsv(list, ';', t.engine)], { type: 'text/csv;charset=utf-8' });
      } else if (kind === 'xlsx') {
        const { cuttingListWorkbook } = await import('../../export/excel');
        file = await cuttingListWorkbook(design, list, new Date(), t);
      } else {
        const { cuttingListPdf } = await import('../../export/pdf');
        file = await cuttingListPdf(design, list, issues, t);
      }
    } catch {
      flash(c.makeFailed);
      return;
    }
    // Embedded, the hosting page asks the viewer before saving.
    if (embedded) flash(c.confirmSave, true);
    const outcome = await saveFile(name, file, file.type || 'application/octet-stream');
    flash(outcome === 'saved' ? t.files.saved(name) : t.files[outcome] + (outcome === 'unavailable' ? c.useCopy : ''));
  };

  return (
    <div className="h-full select-text overflow-y-auto bg-[#f5f2eb] print:h-auto print:overflow-visible print:bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{c.title}</h1>
            <p className="text-[13px] text-zinc-500">{c.summary(design.name, list.pieceCount, unitsWithParts.length)}</p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            {!empty && (
              <Menu label={c.exportLabel} text={c.export} icon={<Download className="size-4" />} variant="outline">
                <div className="space-y-1">
                  {canSave && (
                    <>
                      <Button className="w-full justify-start" data-close-menu onClick={() => void exportAs('pdf')}>
                        <FileText className="size-4" />
                        {c.pdf}
                      </Button>
                      <Button className="w-full justify-start" data-close-menu onClick={() => void exportAs('xlsx')}>
                        <FileSpreadsheet className="size-4" />
                        {c.xlsx}
                      </Button>
                      <Button className="w-full justify-start" data-close-menu onClick={() => void exportAs('csv')}>
                        <Download className="size-4" />
                        {c.csv}
                      </Button>
                    </>
                  )}
                  <Button className="w-full justify-start" data-close-menu onClick={() => void copy()}>
                    <ClipboardCopy className="size-4" />
                    {c.copy}
                  </Button>
                </div>
              </Menu>
            )}
            {!embedded && !empty && (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="size-4" />
                {c.print}
              </Button>
            )}
          </div>
        </div>
        {status && (
          <p role="status" className="mt-2 text-[13px] font-medium text-blue-700 print:hidden">
            {status}
          </p>
        )}

        {errors.length > 0 && (
          <div className="mt-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-semibold">{c.problems(errors.length)}</div>
              <ul className="mt-1 list-disc pl-4">
                {errors.slice(0, 4).map((issue) => (
                  <li key={issue.key}>{issue.message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {empty ? (
          <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
            <p className="text-sm font-medium text-zinc-700">{c.emptyTitle}</p>
            <p className="mt-1 text-[13px] text-zinc-500">{c.emptyText}</p>
            <Button variant="primary" className="mt-4 px-4" onClick={() => ui.setView('plan')}>
              {c.goToPlan}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="material-totals">
              {list.materials.map((total) => (
                <div key={`${total.materialId}-${total.thickness}`} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 print:rounded-none">
                  <div className="text-[13px] font-medium text-zinc-900">
                    {total.materialName} <span className="text-zinc-400">{t.mm(total.thickness)} mm</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-3 tabular-nums">
                    <span className="text-xl font-semibold text-zinc-900">{t.decimal(total.area, 2)} m²</span>
                    <span className="text-xs text-zinc-500">{c.pieces(total.pieces)}</span>
                  </div>
                  <div className="mt-1 text-xs tabular-nums text-zinc-600">
                    {c.sheets(total.sheets, total.sheetLength, total.sheetWidth, Math.round(total.used * 100))}
                    {total.cost !== null && <span className="font-medium text-zinc-800"> · {t.money(total.cost)}</span>}
                  </div>
                  {total.oversize > 0 && <div className="mt-1 text-xs font-medium text-red-700">{c.oversize(total.oversize)}</div>}
                </div>
              ))}
              {list.edges.map((edge) => (
                <div key={edge.bandId} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 print:rounded-none">
                  <div className="text-[13px] font-medium text-zinc-900">{edge.name}</div>
                  <div className="mt-1 flex items-baseline gap-3 tabular-nums">
                    <span className="text-xl font-semibold text-zinc-900">{t.mm(edge.metres)} m</span>
                    <span className="text-xs text-zinc-500">{c.edgeBanding}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {c.trimNote}
                    {edge.cost !== null && <span className="font-medium text-zinc-800"> · {t.money(edge.cost)}</span>}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              {c.estimateNote}
              {list.cost !== null && <span className="font-medium text-zinc-600">{c.materialCost(t.money(list.cost))}</span>}
            </p>

            {warnings.length > 0 && (
              <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                <summary className="cursor-pointer font-semibold">{c.reviewWarnings(warnings.length)}</summary>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {warnings.map((issue) => <li key={issue.key}>{issue.message}</li>)}
                </ul>
              </details>
            )}
            {checklist.length > 0 && <details className="mt-4 rounded-xl border border-studio-line bg-studio-paper px-4 py-3 text-[13px] text-studio-muted" data-testid="precut-checklist">
              <summary className="cursor-pointer font-semibold">{t.checks.precut} ({checklist.length})</summary>
              <p className="mt-2">{t.checks.precutHint}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">{checklist.map((issue) => <li key={issue.key}>{issue.message}</li>)}</ul>
            </details>}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <Segmented
                ariaLabel={c.groupAria}
                size="sm"
                className="w-full sm:w-80"
                value={grouping}
                onChange={setGrouping}
                options={[
                  { value: 'pieces', label: c.groupPieces },
                  { value: 'units', label: c.groupUnits },
                ]}
              />
              {grouping === 'units' && <span className="text-xs text-zinc-500">{c.pencilHint}</span>}
            </div>

            <div className="mt-3 space-y-6">
              {grouping === 'pieces' ? (
                <PartsTable rows={list.rows as CuttingRow[]} showUnits bandThickness={bandThickness} />
              ) : (
                unitsWithParts.map(({ item, parts }) => (
                  <section key={item.id} className="break-inside-avoid rounded-2xl border border-[#ded8ce] bg-[#fffefa] p-3 sm:p-4 print:rounded-none">
                    <div className="mb-3 flex flex-wrap items-center gap-4">
                      <FrontPreview item={item} ctx={ctx} />
                      <div>
                        <h2 className="text-sm font-semibold text-zinc-900">
                          {item.label}{' '}
                          <span className="font-normal text-zinc-500">· {t.kinds[item.kind]}</span>
                        </h2>
                        <p className="mt-1 text-xs tabular-nums text-zinc-600">{c.unitDimensions(t.mm(item.width), t.mm(item.height), t.mm(item.depth))}</p>
                        <p className="mt-2 text-xs font-semibold text-[#4f6249]">{c.pieces(parts.reduce((sum, part) => sum + part.quantity, 0))}</p>
                      </div>
                    </div>
                    <PartsTable
                      rows={parts.map((p) => ({ ...p, materialName: materialName(p.materialId) }))}
                      showUnits={false}
                      bandThickness={bandThickness}
                      editFor={item.id}
                    />
                  </section>
                ))
              )}
              {grouping === 'units' && list.extra.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-zinc-900">{c.extra.title}</h2>
                  <PartsTable rows={list.extra} showUnits={false} bandThickness={bandThickness} />
                </section>
              )}
            </div>

            <details className="mt-6 rounded-2xl border border-studio-line bg-studio-paper p-4">
              <summary className="cursor-pointer text-sm font-semibold text-studio-ink">{c.overview}</summary>
              <section aria-label={c.overview} className="mt-4 grid gap-4 lg:grid-cols-2" data-testid="cutting-overview">
                <figure className="min-w-0">
                  <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#625b50]">{c.planPreview}</figcaption>
                  <img
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(plan.svg)}`}
                    alt={c.planPreview}
                    width={plan.width}
                    height={plan.height}
                    className="h-52 w-full rounded-xl border border-[#e6e0d5] bg-white object-contain"
                  />
                  <p className="mt-2 text-xs tabular-nums text-zinc-500">{t.mm(design.room.width)} × {t.mm(design.room.depth)} mm · {c.pieces(list.pieceCount)}</p>
                </figure>
                {preview && (
                  <div className="min-w-0" data-testid="cutting-cabinet-preview">
                    <label className="mb-3 block text-xs font-semibold text-[#625b50]">
                      {c.previewCabinet}
                      <select
                        aria-label={c.previewCabinet}
                        value={preview.item.id}
                        onChange={(event) => setPreviewId(event.target.value)}
                        className="mt-1.5 min-h-10 w-full rounded-lg border border-[#d6d0c4] bg-white px-3 text-base font-normal text-zinc-900 sm:text-sm print:hidden"
                      >
                        {unitsWithParts.map(({ item }) => <option key={item.id} value={item.id}>{item.label} · {t.kinds[item.kind]}</option>)}
                      </select>
                    </label>
                    <div className="flex flex-wrap items-center gap-4">
                      <FrontPreview item={preview.item} ctx={ctx} />
                      <div className="min-w-0 flex-1 text-[13px] text-zinc-600">
                        <p className="font-semibold text-zinc-900">{preview.item.label} · {t.kinds[preview.item.kind]}</p>
                        <p className="mt-1 tabular-nums">{c.unitDimensions(t.mm(preview.item.width), t.mm(preview.item.height), t.mm(preview.item.depth))}</p>
                        <p className="mt-2 font-medium text-[#4f6249]">{c.pieces(preview.parts.reduce((sum, part) => sum + part.quantity, 0))}</p>
                        <p className="mt-2 text-xs leading-relaxed">{c.previewNote}</p>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-zinc-500 lg:col-span-2">{c.verifyNote}</p>
              </section>
            </details>

            {list.hardware.length > 0 && (
              <section className="mt-8 break-inside-avoid">
                <h2 className="mb-2 text-sm font-semibold text-zinc-900">{c.hardware}</h2>
                <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white print:rounded-none print:border-zinc-400">
                  <table className="w-full min-w-120 border-collapse text-[13px] print:text-[11px]">
                    <thead className="border-b border-zinc-200 bg-zinc-50">
                      <tr>
                        <th className={th}>{c.item}</th>
                        <th className={cn(th, 'text-right')}>{c.qty}</th>
                        <th className={th}>{c.units}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 tabular-nums">
                      {list.hardware.map((h) => (
                        <tr key={h.name}>
                          <td className={cn(td, 'font-medium text-zinc-900')}>{h.name}</td>
                          <td className={cn(td, 'text-right font-semibold text-zinc-900')}>{h.quantity}</td>
                          <td className={cn(td, 'text-zinc-600')}>{h.units.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {(!empty || design.customParts.length > 0) && <ExtraPieces design={design} />}
      </div>
    </div>
  );
}
