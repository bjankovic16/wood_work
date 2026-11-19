import { CanvasTexture, Float32BufferAttribute, type BufferGeometry, type MeshStandardMaterial } from 'three';
import { hasWorktop, WORKTOP_THICKNESS } from '../../domain/catalog';
import { footprintPieces, isWallMounted, mountedSpan } from '../../domain/geometry';
import type { KitchenItem, Point, Room } from '../../domain/types';
import type { WallSegment } from '../../domain/walls';
import { resolveConfig, type BuildContext } from '../../engine/config';
import type { KitchenMaterials } from './materials';
import { studioFinish } from './studioFinish';

/** Static ambient occlusion on the receiving surface, not a projected shadow. Millimetres, Y up. */
function contactMap(width: number, height: number, outlines: Point[][]): CanvasTexture | null {
  if (!outlines.length) return null;
  const scale = Math.min(1 / 8, 512 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const pen = canvas.getContext('2d')!;
  pen.fillStyle = 'white';
  pen.fillRect(0, 0, canvas.width, canvas.height);
  pen.setTransform(canvas.width / width, 0, 0, -canvas.height / height, 0, canvas.height);
  pen.lineJoin = 'round';
  pen.globalCompositeOperation = 'darken'; // Neighbouring carcasses meet without double-dark seams.
  const path = new Path2D();
  for (const [first, ...rest] of outlines) {
    path.moveTo(first.x, first.y);
    for (const p of rest) path.lineTo(p.x, p.y);
    path.closePath();
  }
  for (let i = 16; i >= 1; i--) {
    const distance = i / 16;
    const level = Math.round(255 * (1 - 0.77 * (1 - distance) ** 2));
    pen.strokeStyle = `rgb(${level},${level},${level})`;
    pen.lineWidth = 2 * 170 * distance;
    pen.stroke(path);
  }
  pen.fillStyle = '#414141';
  pen.fill(path);
  const map = new CanvasTexture(canvas);
  map.channel = 1; // Leave the board/grout UVs and their real-world repeat untouched.
  return map;
}

function wallOutlines(segment: WallSegment, items: KitchenItem[], build: BuildContext): Point[][] {
  const outlines: Point[][] = [];
  for (const item of items) {
    const span = mountedSpan(item, segment);
    if (!span) continue;
    const [left, right] = span, { height, elevation } = item;
    const rect = (bottom: number, top: number, x = left, end = right) =>
      outlines.push([{ x, y: bottom }, { x: end, y: bottom }, { x: end, y: top }, { x, y: top }]);
    if (item.shelfForm === 'floating') {
      const { carcass, shelves } = resolveConfig(item, build);
      for (let i = 0; i < shelves + 2; i++) {
        const base = elevation + i * (height - carcass.thickness) / (shelves + 1);
        rect(base, base + carcass.thickness);
      }
    } else if (item.kind === 'hood') {
      rect(elevation, elevation + 90);
      rect(elevation + 90, elevation + height, left + (right - left) * 0.32, right - (right - left) * 0.32);
    } else if (item.kind !== 'bar') {
      rect(elevation, elevation + height + (hasWorktop(item) ? WORKTOP_THICKNESS : 0));
    }
  }
  return outlines;
}

export function projectContactUV(geometry: BufferGeometry, x: number, y: number, width: number, height: number) {
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv1') ?? new Float32BufferAttribute(new Float32Array(2 * positions.count), 2);
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(i, (x + positions.getX(i) * 1000) / width, (y + positions.getY(i) * 1000) / height);
  }
  geometry.setAttribute('uv1', uv);
  uv.needsUpdate = true;
}

export function studioContacts(room: Room, segments: WallSegment[], items: KitchenItem[], build: BuildContext, materials: KitchenMaterials) {
  const maps: CanvasTexture[] = [], surfaces: MeshStandardMaterial[] = [];
  const surface = (source: MeshStandardMaterial, map: CanvasTexture) => {
    const material = source.clone();
    material.aoMap = map;
    studioFinish(material);
    surfaces.push(material);
    return material;
  };
  const footprints = items.filter((item) => !isWallMounted(item) && item.kind !== 'bar' && item.shelfForm !== 'floating'
    && (item.elevation === 0 || !['fridge', 'hood', 'endPanel'].includes(item.kind)))
    .flatMap(footprintPieces).map((polygon) => polygon.map(({ x, y }) => ({ x, y: room.depth - y })));
  const floorMap = contactMap(room.width, room.depth, footprints);
  if (floorMap) maps.push(floorMap);
  const walls = new Map<string, { wall: MeshStandardMaterial; cladding: MeshStandardMaterial | null; map: CanvasTexture }>();
  for (const segment of segments) {
    const map = contactMap(segment.length, segment.height, wallOutlines(segment, items, build));
    if (!map) continue;
    maps.push(map);
    walls.set(segment.id, { wall: surface(materials.wall, map), cladding: materials.backsplash && surface(materials.backsplash, map), map });
  }
  return { floor: floorMap ? surface(materials.floor, floorMap) : materials.floor, walls,
    dispose() { for (const map of maps) map.dispose(); for (const material of surfaces) material.dispose(); } };
}
