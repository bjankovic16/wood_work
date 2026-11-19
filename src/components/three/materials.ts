import * as THREE from 'three';
import { studioFinish, studioSize } from './studioFinish';
import type { Room } from '../../domain/types';
import { APPLIANCE_FINISHES, BACKSPLASH_FINISHES, DEFAULT_FLOOR_COLOR, DEFAULT_FLOOR_GROUT_COLOR, DEFAULT_FLOOR_TILE_SIZE, DEFAULT_WALL_COLOR, FRONT_FINISHES, HANDLE_STYLES, WORKTOP_FINISHES, type Finish, type FrontFinish, type KitchenStyle } from '../../domain/style';

/** Millimetres to scene units (metres). */
export const m = (mm: number): number => mm / 1000;

const textures = new Map<string, THREE.CanvasTexture>();
const floorTextures = new Map<string, THREE.CanvasTexture>();

/**
 * A wood grain drawn on a canvas, so no image files are needed. Grain runs
 * up the texture; `across` turns it sideways (for worktops).
 */
function woodTexture(color: string, across: boolean, figured = false): THREE.CanvasTexture {
  const key = `${color}|${across}|${figured}`;
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
  if (figured) {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const u = x * Math.PI * 2 / canvas.width, v = y * Math.PI * 2 / canvas.height;
      const growth = 12 * u + 2.8 * Math.cos(v + 0.6 * Math.sin(u)) + 1.6 * Math.sin(2 * u - v);
      const ring = (0.5 + 0.5 * Math.cos(growth)) ** 9;
      const fibre = 0.5 * Math.sin(6 * growth + 0.8 * Math.sin(v)) + random() - 0.5;
      const grain = 1.025 - 0.11 * ring + 0.045 * fibre;
      const index = (y * canvas.width + x) * 4;
      for (let c = 0; c < 3; c++) image.data[index + c] *= grain;
    }
    ctx.putImageData(image, 0, 0);
  }
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
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  windowFrame: THREE.MeshStandardMaterial;
  windowGlass: THREE.MeshStandardMaterial;
  doorFrame: THREE.MeshStandardMaterial;
  doorLeaf: THREE.MeshStandardMaterial;
  carcass: THREE.MeshStandardMaterial;
  front: THREE.MeshStandardMaterial;
  worktop: THREE.MeshStandardMaterial;
  handle: THREE.MeshStandardMaterial | null;
  steel: THREE.MeshStandardMaterial;
  basin: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  appliance: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  displayGlass: THREE.MeshPhysicalMaterial;
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
  } else if (finish.texture === 'granite' || finish.texture === 'quartz' || finish.texture === 'concrete') {
    const noise = (size: number) => {
      const grid = Array.from({ length: size * size }, random);
      const at = (x: number, y: number) => grid[(y % size) * size + x % size];
      return (x: number, y: number) => {
        const u = x * size / 512, v = y * size / 512, i = Math.floor(u), j = Math.floor(v);
        const dx = u - i, dy = v - j;
        return (1 - dy) * ((1 - dx) * at(i, j) + dx * at(i + 1, j))
          + dy * ((1 - dx) * at(i, j + 1) + dx * at(i + 1, j + 1)) - 0.5;
      };
    };
    const concrete = finish.texture === 'concrete', quartz = finish.texture === 'quartz';
    const cloud = noise(concrete ? 4 : 6), mineral = noise(36);
    const cloudStrength = concrete ? 34 : quartz ? 9 : 20;
    const field = ctx.getImageData(0, 0, 512, 512);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const grain = cloudStrength * cloud(x, y) + 13 * mineral(x, y) + 11 * (random() - 0.5);
      const at = (y * 512 + x) * 4;
      for (let c = 0; c < 3; c++) field.data[at + c] += grain;
    }
    ctx.putImageData(field, 0, 0);
    for (let i = 0; i < (concrete ? 1600 : 14500); i++) {
      if (concrete) ctx.fillStyle = `rgba(65,62,58,${0.08 + random() * 0.22})`;
      else if (quartz) ctx.fillStyle = random() < 0.45 ? 'rgba(255,255,255,0.65)' : `rgba(98,92,84,${0.09 + random() * 0.34})`;
      else ctx.fillStyle = random() < 0.6 ? `rgba(225,220,210,${0.04 + random() * 0.22})` : `rgba(25,21,19,${random() * 0.38})`;
      ctx.fillRect(random() * 512, random() * 512, 0.7 + random() * 1.8, 0.6 + random() * 1.5);
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

function finishMap(finish: Finish, across = false, detailed = false): THREE.CanvasTexture | null {
  if (!detailed && (finish.texture === 'quartz' || finish.texture === 'concrete')) return null;
  return finish.wood ? woodTexture(finish.color, across, detailed) : finish.texture ? stoneTexture(finish) : null;
}

function brushedMetal(): THREE.CanvasTexture {
  const key = 'brushed-metal';
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const pen = canvas.getContext('2d')!;
  const pixels = pen.createImageData(128, 128);
  let seed = 113;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (let y = 0; y < 128; y++) {
    const line = 188 + random() * 52;
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      pixels.data.fill(line + 14 * random(), i, i + 3); pixels.data[i + 3] = 255;
    }
  }
  pen.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  textures.set(key, texture);
  return texture;
}

export function cabinetMaterial(key: FrontFinish, roughness?: number, detailed = false, size?: ReturnType<typeof studioSize>): THREE.MeshStandardMaterial {
  const finish = FRONT_FINISHES[key];
  const material = new THREE.MeshStandardMaterial({
    color: finish.wood ? '#ffffff' : finish.color, map: finishMap(finish, false, detailed), roughness: roughness ?? (finish.wood ? 0.7 : 0.55),
  });
  if (detailed && finish.wood) material.userData.woodGrain = true;
  if (detailed) studioFinish(material, size);
  return material;
}

function floorTileTexture(style: KitchenStyle): THREE.CanvasTexture {
  const color = style.floorColor ?? DEFAULT_FLOOR_COLOR;
  const grout = style.floorGroutColor ?? DEFAULT_FLOOR_GROUT_COLOR;
  const size = style.floorTileSize ?? DEFAULT_FLOOR_TILE_SIZE;
  const key = `floor-tiles|${color}|${grout}|${size}`;
  const cached = floorTextures.get(key);
  if (cached) {
    floorTextures.delete(key);
    floorTextures.set(key, cached);
    return cached;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The floor tile texture could not be created.');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = grout;
  const joint = 512 * 3 / size;
  ctx.fillRect(0, 0, 512, joint);
  ctx.fillRect(0, 0, joint, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // Floor shape UVs are in metres, so tile sizes stay true across every room shape.
  texture.repeat.set(1000 / size, 1000 / size);
  texture.anisotropy = 4;
  floorTextures.set(key, texture);
  if (floorTextures.size > 8) {
    const oldest = floorTextures.keys().next().value!;
    floorTextures.get(oldest)!.dispose();
    floorTextures.delete(oldest);
  }
  return texture;
}

/** The shared materials for one style. Callers should dispose them when the style changes. */
export function createMaterials(style: KitchenStyle, detailed = false, room?: Room): KitchenMaterials {
  const worktop = WORKTOP_FINISHES[style.worktop];
  const handle = HANDLE_STYLES[style.handles];
  const backsplash = BACKSPLASH_FINISHES[style.backsplash ?? 'none'];
  const worktopMap = finishMap(worktop, true, detailed), backsplashMap = finishMap(backsplash, false, detailed);
  const frame = (finish?: FrontFinish) => finish ? cabinetMaterial(finish) : new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.9 });
  const pane = (color: string, opacity: number) => new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.2, depthWrite: false });
  const materials: KitchenMaterials = {
    wall: new THREE.MeshStandardMaterial({ color: style.wallColor ?? DEFAULT_WALL_COLOR, roughness: 0.9 }),
    floor: new THREE.MeshStandardMaterial({
      color: style.floorPattern === 'tiles' ? '#ffffff' : style.floorColor ?? DEFAULT_FLOOR_COLOR,
      map: style.floorPattern === 'tiles' ? floorTileTexture(style) : null,
      roughness: style.floorPattern === 'tiles' ? 0.65 : 0.92,
    }),
    windowFrame: frame(style.windowFrame),
    windowGlass: pane('#cfe6f5', 0.35),
    doorFrame: frame(style.doorFrame),
    doorLeaf: style.doorLeaf ? cabinetMaterial(style.doorLeaf) : pane('#cbb89c', 0.16),
    carcass: new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.78 }),
    front: cabinetMaterial(style.front, undefined, detailed),
    worktop: new THREE.MeshStandardMaterial({
      color: worktopMap ? '#ffffff' : worktop.color, map: worktopMap,
      roughness: style.worktop === 'black' ? 0.35 : 0.6,
    }),
    handle: handle.color
      ? new THREE.MeshStandardMaterial({ color: handle.color, metalness: handle.metal ? 0.85 : 0.1, roughness: handle.metal ? 0.3 : 0.5 })
      : null,
    steel: new THREE.MeshStandardMaterial({ color: '#c3c7cc', metalness: 0.8, roughness: 0.32 }),
    basin: new THREE.MeshStandardMaterial({ color: '#878c8e', metalness: 0.6, roughness: 0.42 }),
    glass: new THREE.MeshStandardMaterial({ color: '#141518', metalness: 0.2, roughness: 0.15 }),
    appliance: new THREE.MeshStandardMaterial({ color: APPLIANCE_FINISHES[style.appliances ?? 'white'].color, metalness: style.appliances === 'steel' ? 0.55 : 0.15, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.6 }),
    displayGlass: new THREE.MeshPhysicalMaterial({ color: '#e3ece5', transparent: true, opacity: 0.23, roughness: 0.08, metalness: 0.08, depthWrite: false, side: THREE.DoubleSide }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#e4d7c3', roughness: 0.48 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#63734b', roughness: 0.9 }),
    pot: new THREE.MeshStandardMaterial({ color: '#a66f51', roughness: 0.82 }),
    backsplash: style.backsplash && style.backsplash !== 'none'
      ? new THREE.MeshStandardMaterial({ color: backsplashMap ? '#ffffff' : backsplash.color, map: backsplashMap, roughness: 0.55 })
      : null,
  };
  if (detailed) {
    if (worktop.texture) materials.worktop.userData.stoneSlab = true;
    if (backsplash.texture && materials.backsplash) materials.backsplash.userData.stoneSlab = true;
    materials.worktop.roughness = worktop.wood ? 0.56 : style.worktop === 'concrete' ? 0.72 : 0.33;
    materials.basin.roughness = 0.27;
    materials.basin.vertexColors = true;
    materials.steel.roughness = 0.25;
    materials.steel.roughnessMap = materials.basin.roughnessMap = brushedMetal();
    if (style.appliances === 'steel') materials.appliance.roughnessMap = materials.steel.roughnessMap;
    const size = room && studioSize(room);
    for (const material of Object.values(materials)) if (material) studioFinish(material, size);
  }
  return materials;
}

export function disposeMaterials(materials: KitchenMaterials): void {
  for (const material of Object.values(materials)) material?.dispose();
}
