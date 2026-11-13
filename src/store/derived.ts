import { useMemo } from 'react';
import { checkDesign, type Issue } from '../engine/checks';
import { buildContext, type BuildContext } from '../engine/config';
import { useDesignStore } from './designStore';

/** Settings, materials and edge bands for the engine, rebuilt only when they change. */
export function useBuildContext(): BuildContext {
  const construction = useDesignStore((s) => s.design.construction);
  const materials = useDesignStore((s) => s.design.materials);
  const edgeBands = useDesignStore((s) => s.design.edgeBands);
  const style = useDesignStore((s) => s.design.style);
  return useMemo(() => buildContext({ construction, materials, edgeBands, style }), [construction, materials, edgeBands, style]);
}

/** Everything the checks find in the current design. */
export function useIssues(): Issue[] {
  const design = useDesignStore((s) => s.design);
  return useMemo(() => checkDesign(design), [design]);
}
