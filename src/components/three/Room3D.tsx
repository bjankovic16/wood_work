import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { alongWall, wallLength } from '../../domain/openings';
import { roomOutline, roomWallRuns } from '../../domain/roomGeometry';
import { hasWorktop, WORKTOP_THICKNESS } from '../../domain/catalog';
import type { KitchenItem, Opening, Room, Wall } from '../../domain/types';
import { itemRect, mountingWalls } from '../../domain/geometry';
import { backsplashTop } from '../../domain/upperCabinets';
import { useUiStore } from '../../store/uiStore';
import { WALL_THICKNESS } from '../../store/viewport';
import { m, type KitchenMaterials } from './materials';

type Vec3 = [number, number, number];

interface Piece {
  /** Along the wall, from its start (metres). */
  from: number;
  to: number;
  bottom: number;
  top: number;
}

/** The solid parts of a wall around its openings. */
function solidParts(length: number, height: number, openings: Opening[]): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;
  for (const o of [...openings].sort((a, b) => a.offset - b.offset)) {
    const from = m(o.offset);
    const to = m(o.offset + o.width);
    const bottom = m(o.sill);
    const top = m(o.sill + o.height);
    if (from > cursor) pieces.push({ from: cursor, to: from, bottom: 0, top: height });
    if (bottom > 0) pieces.push({ from, to, bottom: 0, top: bottom });
    if (top < height) pieces.push({ from, to, bottom: top, top: height });
    cursor = Math.max(cursor, to);
  }
  if (cursor < length) pieces.push({ from: cursor, to: length, bottom: 0, top: height });
  return pieces;
}

/** Turns a piece along a wall into a box in the room: centre and size. */
function boxFor(wall: Wall, room: { W: number; D: number }, T: number, piece: { from: number; to: number; bottom: number; top: number; inset?: number; depth?: number }): { position: Vec3; size: Vec3 } {
  const along = (piece.from + piece.to) / 2;
  const length = piece.to - piece.from;
  const height = piece.top - piece.bottom;
  const y = (piece.bottom + piece.top) / 2;
  const depth = piece.depth ?? T;
  // Distance of the box centre from the room face of the wall, outwards.
  const out = (piece.inset ?? T / 2);
  switch (wall) {
    case 'top':
      return { position: [along, y, -out], size: [length, height, depth] };
    case 'bottom':
      return { position: [along, y, room.D + out], size: [length, height, depth] };
    case 'left':
      return { position: [-out, y, along], size: [depth, height, length] };
    case 'right':
      return { position: [room.W + out, y, along], size: [depth, height, length] };
  }
}

const OUTWARD: Record<Wall, THREE.Vector3> = {
  top: new THREE.Vector3(0, 0, -1),
  bottom: new THREE.Vector3(0, 0, 1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
};

const FRAME = 0.05;

/**
 * Floor and walls, with windows and doors cut out of them. A wall standing
 * between the camera and the room is hidden, so the kitchen can be seen from
 * any side.
 */
export function Room3D({ room, openings, items, materials }: { room: Room; openings: Opening[]; items: KitchenItem[]; materials: KitchenMaterials }) {
  const W = m(room.width);
  const D = m(room.depth);
  const H = m(room.height);
  const T = m(WALL_THICKNESS);
  const groups = useRef<Array<THREE.Group | null>>([]);
  const diagonalGroups = useRef<Array<THREE.Group | null>>([]);
  const outline = useMemo(() => roomOutline(room), [room]);
  const surfaces = useMemo(() => roomWallRuns(room, false), [room]);
  const centres = useMemo(() => surfaces.map((surface) => {
    const along = m((surface.from + surface.to) / 2);
    const offset = m(surface.offset);
    const normal = OUTWARD[surface.wall];
    return new THREE.Vector3(surface.wall === 'top' || surface.wall === 'bottom' ? along : offset, H / 2, surface.wall === 'top' || surface.wall === 'bottom' ? offset : along).addScaledVector(normal, T / 2);
  }), [surfaces, H, T]);
  const diagonal = useMemo(() => outline.flatMap((point, index) => {
    const end = outline[(index + 1) % outline.length];
    const dx = m(end.x - point.x);
    const dz = m(end.y - point.y);
    if (!dx || !dz) return [];
    const length = Math.hypot(dx, dz);
    const outward = new THREE.Vector3(dz / length, 0, -dx / length);
    const centre = new THREE.Vector3(m((point.x + end.x) / 2), H / 2, m((point.y + end.y) / 2)).addScaledVector(outward, T / 2);
    return [{ length, outward, centre, angle: -Math.atan2(dz, dx) }];
  }), [outline, H, T]);
  const floor = useMemo(() => {
    const shape = new THREE.Shape();
    outline.forEach((point, index) => index === 0 ? shape.moveTo(m(point.x), -m(point.y)) : shape.lineTo(m(point.x), -m(point.y)));
    shape.closePath();
    return shape;
  }, [outline]);
  const toCamera = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    surfaces.forEach((surface, index) => {
      const group = groups.current[index];
      if (group) group.visible = toCamera.copy(camera.position).sub(centres[index]).dot(OUTWARD[surface.wall]) <= 0;
    });
    diagonal.forEach((surface, index) => {
      const group = diagonalGroups.current[index];
      if (group) group.visible = toCamera.copy(camera.position).sub(surface.centre).dot(surface.outward) <= 0;
    });
  });

  const wallColor = '#f0ede7';
  const backsplash = materials.backsplash;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <shapeGeometry args={[floor]} />
        <meshStandardMaterial color="#d8d0c4" roughness={0.92} />
      </mesh>
      {(room.features ?? []).map((feature) => (
        <mesh key={feature.id} position={[m(feature.x + feature.width / 2), H / 2, m(feature.y + feature.depth / 2)]} castShadow receiveShadow onClick={(event) => { event.stopPropagation(); useUiStore.getState().setRoomOpen(true); }}>
          <boxGeometry args={[m(feature.width), H, m(feature.depth)]} />
          <meshStandardMaterial color={feature.kind === 'chimney' ? '#d2c3ad' : '#e1dacf'} roughness={0.9} />
        </mesh>
      ))}
      {diagonal.map((surface, index) => (
        <group key={`diagonal-${index}`} ref={(group) => { diagonalGroups.current[index] = group; }}>
          <mesh position={surface.centre} rotation={[0, surface.angle, 0]} receiveShadow>
            <boxGeometry args={[surface.length + T, H, T]} />
            <meshStandardMaterial color={wallColor} roughness={0.95} />
          </mesh>
        </group>
      ))}
      {surfaces.map((surface, index) => {
        const wall = surface.wall;
        const length = m(wallLength(room, wall));
        const outerOffset = wall === 'top' || wall === 'left' ? 0 : wall === 'bottom' ? room.depth : room.width;
        const own = surface.offset === outerOffset ? openings.filter((o) => o.wall === wall && o.offset >= surface.from && o.offset + o.width <= surface.to) : [];
        const pieces = solidParts(length, H, own).map((piece) => ({ ...piece, from: Math.max(piece.from, m(surface.from)), to: Math.min(piece.to, m(surface.to)) })).filter((piece) => piece.to > piece.from);
        const cladding = backsplash
          ? items.filter((item) => {
              const rect = itemRect(item);
              const back = wall === 'top' ? rect.y : wall === 'bottom' ? rect.y + rect.h : wall === 'left' ? rect.x : rect.x + rect.w;
              return hasWorktop(item) && mountingWalls(item).includes(wall) && Math.abs(back - surface.offset) <= 1;
            })
            .flatMap((item) => {
              const [start, end] = alongWall(itemRect(item), wall);
              const bottom = m(item.elevation + item.height + WORKTOP_THICKNESS);
              const top = m(backsplashTop(item, items, wall));
              return pieces.map((piece) => ({
                from: Math.max(m(start), piece.from), to: Math.min(m(end), piece.to),
                bottom: Math.max(bottom, piece.bottom), top: Math.min(top, piece.top),
              })).filter((piece) => piece.to > piece.from && piece.top > piece.bottom);
            })
          : [];
        // The top and bottom walls run past the corners to close them.
        const ends: Piece[] =
          wall === 'top' || wall === 'bottom'
            ? [
                { from: m(surface.from) - T, to: m(surface.from), bottom: 0, top: H },
                { from: m(surface.to), to: m(surface.to) + T, bottom: 0, top: H },
              ]
            : [];
        return (
          <group
            key={`${wall}-${index}`}
            position={wall === 'top' || wall === 'bottom' ? [0, 0, m(surface.offset - outerOffset)] : [m(surface.offset - outerOffset), 0, 0]}
            ref={(group) => {
              groups.current[index] = group;
            }}
          >
            {[...pieces, ...ends].map((piece, i) => {
              const box = boxFor(wall, { W, D }, T, piece);
              return (
                <mesh key={i} position={box.position} receiveShadow>
                  <boxGeometry args={box.size} />
                  <meshStandardMaterial color={wallColor} roughness={0.95} />
                </mesh>
              );
            })}
            {backsplash && cladding.map((piece, i) => {
              const box = boxFor(wall, { W, D }, T, { ...piece, inset: -0.006, depth: 0.012 });
              return <mesh key={`cladding-${i}`} name={`kitchen-backsplash-${index}-${i}`} position={box.position} material={backsplash} receiveShadow><boxGeometry args={box.size} /></mesh>;
            })}
            {own.map((o) => {
              const from = m(o.offset);
              const to = m(o.offset + o.width);
              const bottom = m(o.sill);
              const top = m(o.sill + o.height);
              const frames: Piece[] = [
                { from, to: from + FRAME, bottom, top },
                { from: to - FRAME, to, bottom, top },
                { from, to, bottom: top - FRAME, top },
                ...(o.kind === 'window' ? [{ from, to, bottom, top: bottom + FRAME }] : []),
              ];
              const glass = boxFor(wall, { W, D }, T, { from, to, bottom, top, depth: 0.01 });
              return (
                <group key={o.id}>
                  {frames.map((frame, i) => {
                    const box = boxFor(wall, { W, D }, T, { ...frame, depth: T + 0.02 });
                    return (
                      <mesh key={i} position={box.position}>
                        <boxGeometry args={box.size} />
                        <meshStandardMaterial color="#fafafa" roughness={0.5} />
                      </mesh>
                    );
                  })}
                  {o.kind === 'window' && (
                    <mesh position={glass.position}>
                      <boxGeometry args={glass.size} />
                      <meshStandardMaterial color="#cfe6f5" transparent opacity={0.35} roughness={0.05} metalness={0.1} />
                    </mesh>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}
    </>
  );
}
