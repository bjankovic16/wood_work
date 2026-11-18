import { useMemo } from 'react';
import type { Design } from '../domain/types';
import { checkDesign, checkPlacement, type Issue } from '../engine/checks';
import { buildContext, type BuildContext } from '../engine/config';
import type { EngineLabels } from '../engine/labels';
import { useT } from '../i18n';
import { committedDesign, useDesignStore } from './designStore';

/** Settings, materials and edge bands for the engine, in the interface language, rebuilt only when they change. */
export function useBuildContext(): BuildContext {
  const construction = useDesignStore((s) => s.design.construction);
  const materials = useDesignStore((s) => s.design.materials);
  const edgeBands = useDesignStore((s) => s.design.edgeBands);
  const style = useDesignStore((s) => s.design.style);
  const labels = useT().engine;
  return useMemo(() => buildContext({ construction, materials, edgeBands, style }, labels), [construction, materials, edgeBands, style, labels]);
}

interface Report { issues: Issue[]; precut: Issue[] }
const reports = new WeakMap<Design, Map<EngineLabels, Report>>();

export function workshopReport(design: Design, labels: EngineLabels): Report {
  let locales = reports.get(design);
  if (!locales) reports.set(design, locales = new Map());
  let report = locales.get(labels);
  if (!report) {
    const checks = checkDesign(design, labels);
    report = { issues: checks.filter((i) => i.category !== 'precut'), precut: checks.filter((i) => i.category === 'precut') };
    locales.set(labels, report);
  }
  return report;
}

let preview: { design: Design; base: Design; labels: EngineLabels; issues: Issue[] } | null = null;

/** Canvas, 3D, badge and inspector share the same report. Only placements are transient. */
export function currentIssues(state: { design: Design; gestureBase: Design | null }, labels: EngineLabels): Issue[] {
  const { design, gestureBase: base } = state;
  const report = workshopReport(base ?? design, labels);
  if (!base || design === base) { preview = null; return report.issues; }
  if (preview?.design === design && preview.base === base && preview.labels === labels) return preview.issues;
  const moving = base.room === design.room && base.openings === design.openings
    ? new Set(design.items.filter((item, index) => item !== base.items[index]).map((item) => item.id))
    : undefined; // Moving a room obstacle can affect every cabinet.
  const live = checkPlacement(design, labels, moving);
  const keep = report.issues.filter((issue) => !issue.placement || (moving && !issue.itemIds.some((id) => moving.has(id))));
  const issues = !live.length && keep.length === report.issues.length ? report.issues
    : [...keep, ...live].sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'));
  preview = { design, base, labels, issues };
  return issues;
}

export function useIssues(): Issue[] {
  const labels = useT().engine;
  return useDesignStore((state) => currentIssues(state, labels));
}

export function usePrecutChecklist(): Issue[] {
  const labels = useT().engine;
  return useDesignStore((state) => workshopReport(committedDesign(state), labels).precut);
}
