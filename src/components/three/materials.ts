import * as THREE from 'three';
import { APPLIANCE_FINISHES, BACKSPLASH_FINISHES, FRONT_FINISHES, HANDLE_STYLES, WORKTOP_FINISHES, type Finish, type FrontFinish, type KitchenStyle } from '../../domain/style';

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
  displayGlass: THREE.MeshPhysicalMaterial;
  light: THREE.MeshStandardMaterial;
  floorGlow: THREE.MeshBasicMaterial;
  ceramic: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  pot: THREE.MeshStandardMaterial;
  backsplash: THREE.MeshStandardMaterial | null;
}

function stoneTexture(finish: Finish): THREE.CanvasTexture {
  const key = `${finish.texture}|${finish.color}`;
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = finish.color;
  ctx.fillRect(0, 0, 512, 512);
  let seed = 41;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  if (finish.texture === 'marble') {
    for (let i = 0; i < 9; i++) {
      const start = random() * 650 - 100;
      ctx.strokeStyle = `rgba(125, 108, 88, ${0.08 + random() * 0.18})`;
      ctx.lineWidth = 0.6 + random() * 2;
      ctx.beginPath();
      ctx.moveTo(start, 0);
      ctx.bezierCurveTo(start - 90, 160, start + 140, 320, start + 180, 512);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 1400; i++) {
      const x = random() * 512;
      const y = random() * 512;
      ctx.fillStyle = `rgba(104, 79, 49, ${0.025 + random() * 0.1})`;
      ctx.fillRect(x, y, 1 + random() * 12, 0.5 + random() * 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  textures.set(key, texture);
  return texture;
}

function finishMap(finish: Finish, across = false): THREE.CanvasTexture | null {
  return finish.wood ? woodTexture(finish.color, across) : finish.texture ? stoneTexture(finish) : null;
}

function floorGlowTexture(): THREE.CanvasTexture {
  const cached = textures.get('plinth-light');
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The plinth lighting texture could not be created.');
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.65)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textures.set('plinth-light', texture);
  return texture;
}

/** The shared materials for one style. Callers should dispose them when the style changes. */
export function createMaterials(style: KitchenStyle, carcassFinish?: FrontFinish): KitchenMaterials {
  const front = FRONT_FINISHES[style.front];
  const worktop = WORKTOP_FINISHES[style.worktop];
  const handle = HANDLE_STYLES[style.handles];
  const backsplash = BACKSPLASH_FINISHES[style.backsplash ?? 'none'];
  const carcass: Finish = carcassFinish ? FRONT_FINISHES[carcassFinish] : { color: '#f3f2ee' };
  return {
    carcass: new THREE.MeshStandardMaterial({ color: carcass.wood ? '#ffffff' : carcass.color, map: finishMap(carcass), roughness: 0.78 }),
    front: new THREE.MeshStandardMaterial({
      color: front.wood ? '#ffffff' : front.color,
      map: finishMap(front),
      roughness: front.wood ? 0.7 : 0.55,
    }),
    worktop: new THREE.MeshStandardMaterial({
      color: worktop.wood || worktop.texture ? '#ffffff' : worktop.color,
      map: finishMap(worktop, true),
      roughness: style.worktop === 'black' ? 0.35 : 0.6,
    }),
    handle: handle.color
      ? new THREE.MeshStandardMaterial({ color: handle.color, metalness: handle.metal ? 0.85 : 0.1, roughness: handle.metal ? 0.3 : 0.5 })
      : null,
    steel: new THREE.MeshStandardMaterial({ color: '#c3c7cc', metalness: 0.8, roughness: 0.32 }),
    glass: new THREE.MeshStandardMaterial({ color: '#141518', metalness: 0.2, roughness: 0.15 }),
    appliance: new THREE.MeshStandardMaterial({ color: APPLIANCE_FINISHES[style.appliances ?? 'white'].color, metalness: style.appliances === 'steel' ? 0.55 : 0.15, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.6 }),
    displayGlass: new THREE.MeshPhysicalMaterial({ color: '#e3ece5', transparent: true, opacity: 0.23, roughness: 0.08, metalness: 0.08, depthWrite: false, side: THREE.DoubleSide }),
    light: new THREE.MeshStandardMaterial({ color: '#ffe2ad', emissive: '#ffcb83', emissiveIntensity: 2, toneMapped: false }),
    floorGlow: new THREE.MeshBasicMaterial({ color: '#ffd394', map: floorGlowTexture(), transparent: true, opacity: 0.65, depthWrite: false, toneMapped: false }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#e4d7c3', roughness: 0.48 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#63734b', roughness: 0.9 }),
    pot: new THREE.MeshStandardMaterial({ color: '#a66f51', roughness: 0.82 }),
    backsplash: style.backsplash && style.backsplash !== 'none'
      ? new THREE.MeshStandardMaterial({ color: backsplash.texture ? '#ffffff' : backsplash.color, map: finishMap(backsplash), roughness: 0.55 })
      : null,
  };
}

export function disposeMaterials(materials: KitchenMaterials): void {
  for (const material of Object.values(materials)) material?.dispose();
}
