import type * as THREE from 'three';

/** The selection blue, shared by outlines, measurements and handles in 3D. */
export const HANDLE_COLOR = '#2563eb';

/**
 * Draws a transform gizmo's arrows in the selection colour instead of the
 * red/green/blue of 3D modelling tools: each arrow already points the way it moves.
 */
export function tintGizmo(gizmo: THREE.Object3D, color: string = HANDLE_COLOR): void {
  gizmo.traverse((child) => {
    if (child.name !== 'X' && child.name !== 'Y' && child.name !== 'Z') return;
    const material: unknown = Reflect.get(child, 'material');
    if (!material || typeof material !== 'object' || !('color' in material)) return;
    const paint = material.color as THREE.Color;
    paint.set(color);
    // The controls restore this colour after every hover highlight.
    Reflect.set(material, 'tempColor', paint.clone());
  });
}
