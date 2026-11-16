import { useMemo } from 'react';
import { checkDesign, type Issue } from '../engine/checks';
import { buildContext, type BuildContext } from '../engine/config';
import { useT } from '../i18n';
import { useDesignStore } from './designStore';

/** Settings, materials and edge bands for the engine, in the interface language, rebuilt only when they change. */
export function useBuildContext(): BuildContext {
  const construction = useDesignStore((s) => s.design.construction);
  const materials = useDesignStore((s) => s.design.materials);
  const edgeBands = useDesignStore((s) => s.design.edgeBands);
  const style = useDesignStore((s) => s.design.style);
  const labels = useT().engine;
  return useMemo(() => buildContext({ construction, materials, edgeBands, style }, labels), [construction, materials, edgeBands, style, labels]);
}

/** Everything the checks find in the current design, in the interface language. */
function useDesignChecks(): Issue[] {
  const design = useDesignStore((s) => s.design);
  const labels = useT().engine;
  return useMemo(() => checkDesign(design, labels), [design, labels]);
}

export function useIssues(): Issue[] {
  const checks = useDesignChecks();
  return useMemo(() => checks.filter((issue) => issue.category !== 'precut'), [checks]);
}

export function usePrecutChecklist(): Issue[] {
  const checks = useDesignChecks();
  return useMemo(() => checks.filter((issue) => issue.category === 'precut'), [checks]);
}
