import * as THREE from 'three';
import { FRONT_FINISHES, HANDLE_STYLES, WORKTOP_FINISHES, type KitchenStyle } from '../../domain/style';

/** Millimetres to scene units (metres). */
export const m = (mm: number): number => mm / 1000;

const textures = new Map<string, THREE.CanvasTexture>();

/**
 * A wood grain drawn on a canvas, so no image files are needed. Grain runs
 * up the texture; `across` turns it sideways (for worktops).
 */
function woodTexture(color: string, across: boolean): THREE.CanvasTexture {
  const key = `${color}|${across}`;
  const cached = textures.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 110; i++) {
    const x = random() * canvas.width;
    const amplitude = 1 + random() * 4;
    const waves = 0.5 + random() * 1.5;
    const phase = random() * Math.PI * 2;
    const dark = random() < 0.62;
    ctx.strokeStyle = dark ? `rgba(70, 40, 15, ${0.05 + random() * 0.13})` : `rgba(255, 238, 210, ${0.04 + random() * 0.08})`;
    ctx.lineWidth = 0.5 + random() * 2.4;
    ctx.beginPath();
    for (let y = 0; y <= canvas.height; y += 8) {
      const dx = Math.sin((y / canvas.height) * Math.PI * 2 * waves + phase) * amplitude;
      if (y === 0) ctx.moveTo(x + dx, y);
      else ctx.lineTo(x + dx, y);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (across) {
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI / 2;
  }
  textures.set(key, texture);
  return texture;
}

export interface KitchenMaterials {
  carcass: THREE.MeshStandardMaterial;
  front: THREE.MeshStandardMaterial;
  worktop: THREE.MeshStandardMaterial;
  handle: THREE.MeshStandardMaterial | null;
  steel: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  appliance: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
}

/** The shared materials for one style. Callers should dispose them when the style changes. */
export function createMaterials(style: KitchenStyle): KitchenMaterials {
  const front = FRONT_FINISHES[style.front];
  const worktop = WORKTOP_FINISHES[style.worktop];
  const handle = HANDLE_STYLES[style.handles];
  return {
    carcass: new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.85 }),
    front: new THREE.MeshStandardMaterial({
      color: front.wood ? '#ffffff' : front.color,
      map: front.wood ? woodTexture(front.color, false) : null,
      roughness: front.wood ? 0.7 : 0.55,
    }),
    worktop: new THREE.MeshStandardMaterial({
      color: worktop.wood ? '#ffffff' : worktop.color,
      map: worktop.wood ? woodTexture(worktop.color, true) : null,
      roughness: style.worktop === 'black' ? 0.35 : 0.6,
    }),
    handle: handle.color
      ? new THREE.MeshStandardMaterial({ color: handle.color, metalness: handle.metal ? 0.85 : 0.1, roughness: handle.metal ? 0.3 : 0.5 })
      : null,
    steel: new THREE.MeshStandardMaterial({ color: '#c3c7cc', metalness: 0.8, roughness: 0.32 }),
    glass: new THREE.MeshStandardMaterial({ color: '#141518', metalness: 0.2, roughness: 0.15 }),
    appliance: new THREE.MeshStandardMaterial({ color: '#f4f5f6', metalness: 0.15, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.6 }),
  };
}

export function disposeMaterials(materials: KitchenMaterials): void {
  for (const material of Object.values(materials)) material?.dispose();
}
