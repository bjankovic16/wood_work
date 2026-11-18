import { footprintPolygon, frontEdges, isWallMounted, itemRect } from '../domain/geometry';
import type { Design, KitchenItem, Opening, Room } from '../domain/types';
import { openingFitsRoomWall, roomFeaturePolygon, roomFeaturePose, roomOutline } from '../domain/roomGeometry';
import { EN_LABELS, type EngineLabels } from '../engine/labels';
import { openingFrame, openingIsValid, partitionPolygon, roomSegments, wallPoint } from '../domain/walls';

const WALL = 120;
/** Space around the room for the overall dimensions. */
const MARGIN = 360;

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function openingSvg(room: Room, opening: Opening): string {
  const frame = openingFrame(room, opening);
  if (!frame) return '';
  const thickness = room.partitions?.find((p) => p.id === frame.partitionId)?.thickness ?? WALL;
  const at = (a: number, n: number) => wallPoint(frame, a, n);
  const start = opening.offset;
  const end = opening.offset + opening.width;
  const gap = [at(start, 0), at(end, 0), at(end, -thickness), at(start, -thickness)].map((p) => `${p.x},${p.y}`).join(' ');
  if (opening.kind === 'window') {
    const line = (n: number) => {
      const a = at(start, n);
      const b = at(end, n);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#52525b" stroke-width="10"/>`;
    };
    return `<polygon points="${gap}" fill="#ffffff" stroke="#52525b" stroke-width="10"/>${line(-thickness * 0.38)}${line(-thickness * 0.62)}`;
  }
  const hinge = at(start, 0);
  const leaf = at(start, opening.width);
  const arc = Array.from({ length: 17 }, (_, i) => {
    const angle = (i / 16) * (Math.PI / 2);
    const p = at(start + Math.cos(angle) * opening.width, Math.sin(angle) * opening.width);
    return `${p.x},${p.y}`;
  }).join(' ');
  return (
    `<polygon points="${gap}" fill="#ffffff" stroke="#52525b" stroke-width="10"/>` +
    `<line x1="${hinge.x}" y1="${hinge.y}" x2="${leaf.x}" y2="${leaf.y}" stroke="#3f3f46" stroke-width="20"/>` +
    `<polyline points="${arc}" fill="none" stroke="#a1a1aa" stroke-width="10" stroke-dasharray="40 30"/>`
  );
}

/**
 * A plan of the kitchen as SVG, in millimetres: walls with their windows and
 * doors, every unit with its code, wall units dashed, and the room size.
 */
export function planSvg(design: Design, labels: EngineLabels = EN_LABELS, items: readonly KitchenItem[] = design.items): { svg: string; width: number; height: number } {
  const { room } = design;
  const minX = -WALL - MARGIN;
  const minY = -WALL - MARGIN;
  const width = room.width + 2 * (WALL + MARGIN);
  const height = room.depth + 2 * (WALL + MARGIN);
  const font = Math.max(70, Math.min(140, Math.min(room.width, room.depth) / 28));
  const parts: string[] = [];

  const outline = roomOutline(room).map((point) => `${point.x},${point.y}`).join(' ');
  parts.push(`<polygon points="${outline}" fill="#d4d4d8" stroke="#d4d4d8" stroke-width="${WALL * 2}" stroke-linejoin="miter"/>`);
  parts.push(`<polygon points="${outline}" fill="#ffffff" stroke="#a1a1aa" stroke-width="8"/>`);
  for (const [index, feature] of (room.features ?? []).entries()) {
    const name = `${labels.roomFeatures[feature.kind]} ${index + 1}`;
    const size = Math.min(font * 0.8, feature.width / Math.max(4, name.length * 0.62));
    const shape = roomFeaturePolygon(room, feature).map((p) => `${p.x},${p.y}`).join(' ');
    const { centre } = roomFeaturePose(room, feature);
    parts.push(`<polygon points="${shape}" fill="#d8cdbb" stroke="#847766" stroke-width="10"/>`);
    parts.push(`<text x="${centre.x}" y="${centre.y + size * 0.35}" font-size="${size}" text-anchor="middle" fill="#574b3e">${escape(name)}</text>`);
  }
  for (const partition of room.partitions ?? []) {
    parts.push(`<polygon points="${partitionPolygon(partition).map((p) => `${p.x},${p.y}`).join(' ')}" fill="#d8cdbb" stroke="#847766" stroke-width="10"/>`);
  }
  for (const treatment of room.treatments ?? []) {
    const frame = roomSegments(room).find((s) => s.id === treatment.wallId);
    if (!frame) continue;
    const a = wallPoint(frame, treatment.offset, 10);
    const b = wallPoint(frame, Math.min(frame.length, treatment.offset + treatment.width), 10);
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#aa8050" stroke-width="20"/>`);
  }
  for (const opening of design.openings.filter((entry) => entry.wallId ? openingIsValid(room, entry) : openingFitsRoomWall(room, entry.wall, entry.offset, entry.width))) parts.push(openingSvg(room, opening));
  if (room.vertices) for (const segment of roomSegments(room, false)) {
    const at = wallPoint(segment, segment.length / 2, -WALL / 2);
    parts.push(`<text x="${at.x}" y="${at.y}" font-size="${font * 0.75}" text-anchor="middle" fill="#574b3e" transform="rotate(${segment.angle > 90 && segment.angle < 270 ? segment.angle + 180 : segment.angle} ${at.x} ${at.y})">${Math.round(segment.length)}</text>`);
  }

  const ordered = [...items.filter((i) => !isWallMounted(i)), ...items.filter(isWallMounted)];
  for (const item of ordered) {
    const wall = isWallMounted(item);
    const points = footprintPolygon(item);
    const pairs = points.reduce<string[]>((acc, v, i) => (i % 2 ? [...acc.slice(0, -1), `${acc[acc.length - 1]},${v}`] : [...acc, String(v)]), []).join(' ');
    parts.push(
      wall
        ? `<polygon points="${pairs}" fill="#eff6ff" fill-opacity="0.6" stroke="#2563eb" stroke-width="10" stroke-dasharray="50 30"/>`
        : `<polygon points="${pairs}" fill="#ffffff" stroke="#52525b" stroke-width="10"/>`,
    );
    for (const [a, b] of frontEdges(item)) {
      parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${wall ? '#2563eb' : '#18181b'}" stroke-width="22"/>`);
    }
  }
  for (const item of ordered) {
    const r = itemRect(item);
    const wall = isWallMounted(item);
    // Floor units are labelled towards the front, wall units towards the back.
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h * (wall ? 0.35 : 0.65);
    if (Math.min(r.w, r.h) >= font * 1.6) {
      parts.push(
        `<text x="${cx}" y="${cy + font * 0.35}" font-size="${font}" font-weight="bold" text-anchor="middle" fill="${wall ? '#1d4ed8' : '#27272a'}">${escape(item.label)}</text>`,
      );
    }
  }

  // Overall room size.
  const top = -WALL - MARGIN / 2;
  const left = -WALL - MARGIN / 2;
  parts.push(`<line x1="0" y1="${top}" x2="${room.width}" y2="${top}" stroke="#18181b" stroke-width="8"/>`);
  parts.push(`<text x="${room.width / 2}" y="${top - font * 0.4}" font-size="${font}" text-anchor="middle" fill="#18181b">${room.width}</text>`);
  parts.push(`<line x1="${left}" y1="0" x2="${left}" y2="${room.depth}" stroke="#18181b" stroke-width="8"/>`);
  parts.push(
    `<text x="${left - font * 0.4}" y="${room.depth / 2}" font-size="${font}" text-anchor="middle" fill="#18181b" transform="rotate(-90 ${left - font * 0.4} ${room.depth / 2})">${room.depth}</text>`,
  );

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`,
    width,
    height,
  };
}
