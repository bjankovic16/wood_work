import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { wallLength } from '../../domain/openings';
import type { Opening, Room, Wall } from '../../domain/types';
import { WALLS } from '../../domain/geometry';
import { WALL_THICKNESS } from '../../store/viewport';
import { m } from './materials';

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
export function Room3D({ room, openings }: { room: Room; openings: Opening[] }) {
  const W = m(room.width);
  const D = m(room.depth);
  const H = m(room.height);
  const T = m(WALL_THICKNESS);
  const groups = useRef<Partial<Record<Wall, THREE.Group | null>>>({});
  const centres = useMemo<Record<Wall, THREE.Vector3>>(
    () => ({
      top: new THREE.Vector3(W / 2, H / 2, -T / 2),
      bottom: new THREE.Vector3(W / 2, H / 2, D + T / 2),
      left: new THREE.Vector3(-T / 2, H / 2, D / 2),
      right: new THREE.Vector3(W + T / 2, H / 2, D / 2),
    }),
    [W, D, H, T],
  );
  const toCamera = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    for (const wall of WALLS) {
      const group = groups.current[wall];
      if (group) group.visible = toCamera.copy(camera.position).sub(centres[wall]).dot(OUTWARD[wall]) <= 0;
    }
  });

  const wallColor = '#f0ede7';
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0, D / 2]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#d8d0c4" roughness={0.92} />
      </mesh>
      {WALLS.map((wall) => {
        const length = m(wallLength(room, wall));
        const own = openings.filter((o) => o.wall === wall);
        const pieces = solidParts(length, H, own);
        // The top and bottom walls run past the corners to close them.
        const ends: Piece[] =
          wall === 'top' || wall === 'bottom'
            ? [
                { from: -T, to: 0, bottom: 0, top: H },
                { from: length, to: length + T, bottom: 0, top: H },
              ]
            : [];
        return (
          <group
            key={wall}
            ref={(group) => {
              groups.current[wall] = group;
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
