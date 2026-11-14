import { footprintPolygon, frontEdges, isWallMounted, itemRect } from '../domain/geometry';
import type { Design, Opening, Point, Room, Wall } from '../domain/types';

const WALL = 120;
/** Space around the room for the overall dimensions. */
const MARGIN = 360;

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wallFrame(room: Room, wall: Wall): { origin: Point; along: Point; inward: Point } {
  switch (wall) {
    case 'top':
      return { origin: { x: 0, y: 0 }, along: { x: 1, y: 0 }, inward: { x: 0, y: 1 } };
    case 'bottom':
      return { origin: { x: 0, y: room.depth }, along: { x: 1, y: 0 }, inward: { x: 0, y: -1 } };
    case 'left':
      return { origin: { x: 0, y: 0 }, along: { x: 0, y: 1 }, inward: { x: 1, y: 0 } };
    case 'right':
      return { origin: { x: room.width, y: 0 }, along: { x: 0, y: 1 }, inward: { x: -1, y: 0 } };
  }
}

function openingSvg(room: Room, opening: Opening): string {
  const { origin, along, inward } = wallFrame(room, opening.wall);
  const at = (a: number, n: number) => ({ x: origin.x + along.x * a + inward.x * n, y: origin.y + along.y * a + inward.y * n });
  const start = opening.offset;
  const end = opening.offset + opening.width;
  const gap = [at(start, 0), at(end, 0), at(end, -WALL), at(start, -WALL)].map((p) => `${p.x},${p.y}`).join(' ');
  if (opening.kind === 'window') {
    const line = (n: number) => {
      const a = at(start, n);
      const b = at(end, n);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#52525b" stroke-width="10"/>`;
    };
    return `<polygon points="${gap}" fill="#ffffff" stroke="#52525b" stroke-width="10"/>${line(-WALL * 0.38)}${line(-WALL * 0.62)}`;
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
export function planSvg(design: Design): { svg: string; width: number; height: number } {
  const { room } = design;
  const minX = -WALL - MARGIN;
  const minY = -WALL - MARGIN;
  const width = room.width + 2 * (WALL + MARGIN);
  const height = room.depth + 2 * (WALL + MARGIN);
  const font = Math.max(70, Math.min(140, Math.min(room.width, room.depth) / 28));
  const parts: string[] = [];

  parts.push(`<rect x="${-WALL}" y="${-WALL}" width="${room.width + 2 * WALL}" height="${room.depth + 2 * WALL}" fill="#d4d4d8" stroke="#a1a1aa" stroke-width="8"/>`);
  parts.push(`<rect x="0" y="0" width="${room.width}" height="${room.depth}" fill="#ffffff" stroke="#a1a1aa" stroke-width="8"/>`);
  for (const opening of design.openings) parts.push(openingSvg(room, opening));

  const ordered = [...design.items.filter((i) => !isWallMounted(i)), ...design.items.filter(isWallMounted)];
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
