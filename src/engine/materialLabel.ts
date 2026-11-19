import type { Material } from '../domain/types';
import type { EngineLabels } from './labels';

/** Supplier names can already contain the gauge (including a decimal comma or “18mm”). */
export function withThickness(name: string, thickness: number, labels: EngineLabels): string {
  for (const match of name.matchAll(/(\d+(?:[.,]\d+)?)\s*mm\b/gi)) {
    if (Number(match[1].replace(',', '.')) === thickness) return name;
  }
  return `${name} ${labels.mm(thickness)} mm`;
}

/** Display only: keep the actual library name editable and the material ID unchanged. */
export function boardLabel(material: Material, labels: EngineLabels): string {
  return withThickness(labels.material(material), material.thickness, labels);
}
