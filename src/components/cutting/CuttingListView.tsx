import { ClipboardCopy, Download, Hammer, Layers, Printer, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { KIND_SPECS } from '../../domain/catalog';
import { buildCuttingList, cuttingListCsv, edgeText, formatMm, type CuttingRow } from '../../engine/cuttingList';
import type { Part } from '../../engine/parts';
import { cn } from '../../lib/cn';
import { embedded, hostDownloads, saveTextFile } from '../../lib/platform';
import { useDesignStore } from '../../store/designStore';
import { useIssues } from '../../store/derived';
import { useUiStore } from '../../store/uiStore';
import { Button, Segmented } from '../ui';

const fileName = (projectName: string) => `${projectName.replace(/[\\/:*?"<>|]+/g, '').trim() || 'kitchen'} - cutting list.csv`;

/** Whether this view can save files: always in a normal tab, only through the host page when embedded. */
function useCanSaveFiles(): boolean {
  const [available, setAvailable] = useState(!embedded);
  useEffect(() => {
    if (!embedded) return;
    let active = true;
    hostDownloads().then((downloads) => {
      if (active) setAvailable(downloads !== null);
    });
    return () => {
      active = false;
    };
  }, []);
  return available;
}

const money = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-400';
const td = 'px-3 py-2 align-top';

type TableRow = Part & { materialName: string; bandName?: string | null; units?: string[] };

function PartsTable({ rows, showUnits, bandThickness }: { rows: TableRow[]; showUnits: boolean; bandThickness: (id: string | null) => number | null }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white print:overflow-visible print:rounded-none print:border-zinc-400">
      <table className="w-full min-w-[720px] border-collapse text-[13px] print:min-w-0 print:text-[11px]">
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <th className={th}>Piece</th>
            <th className={cn(th, 'text-right')}>Qty</th>
            <th className={cn(th, 'text-right')}>Length</th>
            <th className={cn(th, 'text-right')}>Width</th>
            <th className={cn(th, 'text-right')}>Thick.</th>
            <th className={th}>Material</th>
            <th className={th} title="Edge-banded edges along the length (L) and the width (W)">
              Edges
            </th>
            {showUnits && <th className={th}>Units</th>}
            <th className={th}>Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 tabular-nums">
          {rows.map((row, i) => {
            const band = bandThickness(row.edgeBandId);
            return (
              <tr key={i} className="break-inside-avoid hover:bg-zinc-50/60">
                <td className={cn(td, 'font-medium text-zinc-900')}>{row.name}</td>
                <td className={cn(td, 'text-right font-semibold text-zinc-900')}>{row.quantity}</td>
                <td className={cn(td, 'text-right')}>{formatMm(row.length)}</td>
                <td className={cn(td, 'text-right')}>{formatMm(row.width)}</td>
                <td className={cn(td, 'text-right')}>{formatMm(row.thickness)}</td>
                <td className={cn(td, 'text-zinc-600')}>
                  {row.materialName}
                  {row.grain && <span className="ml-1 text-[11px] text-zinc-400">(grain)</span>}
                </td>
                <td className={cn(td, 'whitespace-nowrap text-zinc-600')}>
                  {row.edgeBandId ? (
                    <>
                      {edgeText(row)}
                      {band !== null && <span className="text-zinc-400"> · {formatMm(band)} mm</span>}
                    </>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
                {showUnits && <td className={cn(td, 'text-zinc-600')}>{row.units?.join(', ')}</td>}
                <td className={cn(td, 'text-xs text-zinc-500')}>{row.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The "Cutting list" section: every piece to cut, grouped, with board, edging and hardware totals. */
export function CuttingListView() {
  const design = useDesignStore((s) => s.design);
  const list = useMemo(() => buildCuttingList(design), [design]);
  const issues = useIssues();
  const errors = issues.filter((i) => i.severity === 'error');
  const [grouping, setGrouping] = useState<'pieces' | 'units'>('pieces');
  const [status, setStatus] = useState<string | null>(null);
  const canSave = useCanSaveFiles();
  const unitsWithParts = list.units.filter((u) => u.parts.length > 0);
  const bandThickness = (id: string | null) => (id ? (design.edgeBands.find((b) => b.id === id)?.thickness ?? null) : null);
  const ui = useUiStore.getState();

  const flash = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus((current) => (current === message ? null : current)), 2500);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cuttingListCsv(list, '\t'));
      flash('Copied. Paste it into a spreadsheet.');
    } catch {
      flash('Copying is not allowed here.');
    }
  };
  const save = async () => {
    const outcome = await saveTextFile(fileName(design.name), cuttingListCsv(list), 'text/csv;charset=utf-8');
    if (outcome === 'unavailable') flash('Saving files is not available here; use Copy instead.');
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-50 print:h-auto print:overflow-visible print:bg-white">
      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Cutting list</h1>
            <p className="text-[13px] text-zinc-500">
              {design.name} · {list.pieceCount} {list.pieceCount === 1 ? 'piece' : 'pieces'} for {unitsWithParts.length}{' '}
              {unitsWithParts.length === 1 ? 'unit' : 'units'} · all sizes in mm
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={() => ui.setSettingsTab('materials')}>
              <Layers className="size-4" />
              Materials
            </Button>
            <Button variant="outline" onClick={() => ui.setSettingsTab('construction')}>
              <Hammer className="size-4" />
              Construction
            </Button>
            <Button variant="outline" disabled={list.rows.length === 0} onClick={copy} title="Copy the table, to paste into a spreadsheet">
              <ClipboardCopy className="size-4" />
              Copy
            </Button>
            {canSave && (
              <Button variant="outline" disabled={list.rows.length === 0} onClick={save} title="Download as a CSV file">
                <Download className="size-4" />
                CSV
              </Button>
            )}
            {!embedded && (
              <Button variant="outline" disabled={list.rows.length === 0} onClick={() => window.print()}>
                <Printer className="size-4" />
                Print
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
              <div className="font-semibold">
                {errors.length === 1 ? 'One problem needs fixing' : `${errors.length} problems need fixing`} before cutting
              </div>
              <ul className="mt-1 list-disc pl-4">
                {errors.slice(0, 4).map((issue) => (
                  <li key={issue.key}>{issue.message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {list.rows.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
            <p className="text-sm font-medium text-zinc-700">Nothing to cut yet</p>
            <p className="mt-1 text-[13px] text-zinc-500">Add cabinets on the plan; their parts appear here straight away.</p>
            <Button variant="primary" className="mt-4 px-4" onClick={() => ui.setView('plan')}>
              Go to the plan
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="material-totals">
              {list.materials.map((total) => (
                <div key={`${total.materialId}-${total.thickness}`} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 print:rounded-none">
                  <div className="text-[13px] font-medium text-zinc-900">
                    {total.materialName} <span className="text-zinc-400">{formatMm(total.thickness)} mm</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-3 tabular-nums">
                    <span className="text-xl font-semibold text-zinc-900">{total.area.toFixed(2)} m²</span>
                    <span className="text-xs text-zinc-500">{total.pieces} pieces</span>
                  </div>
                  <div className="mt-1 text-xs tabular-nums text-zinc-600">
                    {total.sheets} {total.sheets === 1 ? 'sheet' : 'sheets'} of {total.sheetLength} × {total.sheetWidth} · {Math.round(total.used * 100)}% used
                    {total.cost !== null && <span className="font-medium text-zinc-800"> · {money(total.cost)}</span>}
                  </div>
                  {total.oversize > 0 && (
                    <div className="mt-1 text-xs font-medium text-red-700">{total.oversize} pieces are larger than the sheet</div>
                  )}
                </div>
              ))}
              {list.edges.map((edge) => (
                <div key={edge.bandId} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 print:rounded-none">
                  <div className="text-[13px] font-medium text-zinc-900">{edge.name}</div>
                  <div className="mt-1 flex items-baseline gap-3 tabular-nums">
                    <span className="text-xl font-semibold text-zinc-900">{formatMm(edge.metres)} m</span>
                    <span className="text-xs text-zinc-500">edge banding</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Includes 30 mm per edge for trimming
                    {edge.cost !== null && <span className="font-medium text-zinc-800"> · {money(edge.cost)}</span>}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              Sheet counts are a safe estimate from a simple layout with a 4 mm saw cut and 10 mm edge trim; cutting software usually needs no more.
              {list.cost !== null && <span className="font-medium text-zinc-600"> Material cost: {money(list.cost)}.</span>}
            </p>

            <div className="mt-6 flex items-center justify-between gap-3 print:hidden">
              <Segmented
                ariaLabel="Group the list"
                size="sm"
                className="w-72"
                value={grouping}
                onChange={setGrouping}
                options={[
                  { value: 'pieces', label: 'Identical pieces together' },
                  { value: 'units', label: 'By unit' },
                ]}
              />
            </div>

            <div className="mt-3 space-y-6">
              {grouping === 'pieces' ? (
                <PartsTable rows={list.rows as CuttingRow[]} showUnits bandThickness={bandThickness} />
              ) : (
                unitsWithParts.map(({ item, parts }) => (
                  <section key={item.id} className="break-inside-avoid">
                    <h2 className="mb-2 text-sm font-semibold text-zinc-900">
                      {item.label}{' '}
                      <span className="font-normal text-zinc-500">
                        · {KIND_SPECS[item.kind].name} · {item.width} × {item.height} × {item.depth}
                      </span>
                    </h2>
                    <PartsTable rows={parts as TableRow[]} showUnits={false} bandThickness={bandThickness} />
                  </section>
                ))
              )}
            </div>

            {list.hardware.length > 0 && (
              <section className="mt-8 break-inside-avoid">
                <h2 className="mb-2 text-sm font-semibold text-zinc-900">Hardware</h2>
                <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white print:rounded-none print:border-zinc-400">
                  <table className="w-full min-w-[480px] border-collapse text-[13px] print:text-[11px]">
                    <thead className="border-b border-zinc-200 bg-zinc-50">
                      <tr>
                        <th className={th}>Item</th>
                        <th className={cn(th, 'text-right')}>Qty</th>
                        <th className={th}>Units</th>
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
      </div>
    </div>
  );
}
