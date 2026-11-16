import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hasWorktop, WORKTOP_THICKNESS } from '../../domain/catalog';
import { localDepthExtent, localToRoom } from '../../domain/geometry';
import { isUpperCabinet } from '../../domain/upperCabinets';
import { roomOutline } from '../../domain/roomGeometry';
import { FRONT_FINISHES, WORKTOP_FINISHES } from '../../domain/style';
import type { KitchenItem, Opening, Room, WallTreatment } from '../../domain/types';
import { openingsOnSegment, roomSegments, solidWallPieces, wallCoordinates, type WallPiece, type WallSegment } from '../../domain/walls';
import { useUiStore } from '../../store/uiStore';
import { WALL_THICKNESS } from '../../store/viewport';
import { createMaterials, disposeMaterials, m, type KitchenMaterials } from './materials';

function mountedSpan(item: KitchenItem, segment: WallSegment): [number, number] | null {
  const edges = [
    [localToRoom(item, 0, 0), localToRoom(item, item.width, 0)],
    ...(item.kind === 'corner' ? [[localToRoom(item, 0, 0), localToRoom(item, 0, localDepthExtent(item))]] : []),
  ];
  for (const [a, b] of edges) {
    const p = wallCoordinates(segment, a);
    const q = wallCoordinates(segment, b);
    if (Math.abs(p.y) < 1.1 && Math.abs(q.y) < 1.1) return [Math.max(0, Math.min(p.x, q.x)), Math.min(segment.length, Math.max(p.x, q.x))];
  }
  return null;
}

function WallBox({ piece, thickness, inset = -thickness / 2, material, color = '#f0ede7', name }: {
  piece: WallPiece; thickness: number; inset?: number; material?: THREE.Material; color?: string; name?: string;
}) {
  return <mesh name={name} position={[m((piece.from + piece.to) / 2), m((piece.bottom + piece.top) / 2), m(inset)]} material={material} castShadow receiveShadow>
    <boxGeometry args={[m(piece.to - piece.from), m(piece.top - piece.bottom), m(thickness)]} />
    {!material && <meshStandardMaterial color={color} roughness={0.9} />}
  </mesh>;
}

function Treatment({ treatment, segment, holes }: { treatment: WallTreatment; segment: WallSegment; holes: WallPiece[] }) {
  const materials = useMemo(() => createMaterials({
    front: Object.hasOwn(FRONT_FINISHES, treatment.finish) ? treatment.finish as keyof typeof FRONT_FINISHES : 'white',
    worktop: Object.hasOwn(WORKTOP_FINISHES, treatment.finish) ? treatment.finish as keyof typeof WORKTOP_FINISHES : 'stone',
    handles: 'none',
  }), [treatment.finish]);
  const material = Object.hasOwn(FRONT_FINISHES, treatment.finish) ? materials.front : materials.worktop;
  const pieces = solidWallPieces(segment, holes, { from: treatment.offset, to: Math.min(segment.length, treatment.offset + treatment.width),
    bottom: treatment.elevation, top: Math.min(segment.height, treatment.elevation + treatment.height) });
  useEffect(() => () => disposeMaterials(materials), [materials]);
  return <>{pieces.map((piece, i) => <WallBox key={i} name={`wall-finish-${treatment.id}-${i}`} piece={piece} thickness={12} inset={6} material={material} />)}</>;
}

export function Room3D({ room, openings, items, materials }: { room: Room; openings: Opening[]; items: KitchenItem[]; materials: KitchenMaterials }) {
  const outline = useMemo(() => roomOutline(room), [room]);
  const segments = useMemo(() => roomSegments(room), [room]);
  const groups = useRef(new Map<string, THREE.Group>());
  const floor = useMemo(() => {
    const shape = new THREE.Shape();
    outline.forEach((point, index) => index === 0 ? shape.moveTo(m(point.x), -m(point.y)) : shape.lineTo(m(point.x), -m(point.y)));
    shape.closePath();
    return shape;
  }, [outline]);
  useFrame(({ camera }) => {
    for (const segment of segments) {
      const group = groups.current.get(segment.id);
      if (group && !segment.partitionId) {
        const dx = camera.position.x - m((segment.start.x + segment.end.x) / 2);
        const dz = camera.position.z - m((segment.start.y + segment.end.y) / 2);
        group.visible = dx * segment.inward.x + dz * segment.inward.y >= 0;
      }
    }
  });
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[floor]} />
      <meshStandardMaterial color="#d8d0c4" roughness={0.92} />
    </mesh>
    {(room.features ?? []).map((feature) => <mesh key={feature.id}
      position={[m(feature.x + feature.width / 2), m(room.height / 2), m(feature.y + feature.depth / 2)]}
      castShadow receiveShadow onClick={(event) => { event.stopPropagation(); useUiStore.getState().setRoomOpen(true); }}>
      <boxGeometry args={[m(feature.width), m(room.height), m(feature.depth)]} />
      <meshStandardMaterial color={feature.kind === 'chimney' ? '#d2c3ad' : '#e1dacf'} roughness={0.9} />
    </mesh>)}
    {segments.map((segment) => {
      const partition = room.partitions?.find((p) => p.id === segment.partitionId);
      const physicalWall = !partition || segment.id.endsWith(':1');
      const thickness = partition?.thickness ?? WALL_THICKNESS;
      const holes = openingsOnSegment(room, segment, openings);
      const pieces = solidWallPieces(segment, holes);
      const treatments = room.treatments?.filter((t) => t.wallId === segment.id) ?? [];
      const manualAreas = treatments.map((t) => ({ from: t.offset, to: t.offset + t.width, bottom: t.elevation, top: t.elevation + t.height }));
      const cladding = materials.backsplash ? items.filter(hasWorktop).flatMap((base) => {
        const span = mountedSpan(base, segment);
        if (!span || span[1] <= span[0]) return [];
        const bottom = base.elevation + base.height + WORKTOP_THICKNESS;
        const above = items.filter((upper) => isUpperCabinet(upper) && upper.elevation > bottom).flatMap((upper) => {
          const own = mountedSpan(upper, segment);
          return own && own[1] > span[0] && own[0] < span[1] ? [upper.elevation] : [];
        });
        const top = Math.min(segment.height, above.length ? Math.min(...above) : bottom + 600);
        return solidWallPieces(segment, [...holes, ...manualAreas], { from: span[0], to: span[1], bottom, top });
      }) : [];
      return <group key={segment.id} position={[m(segment.start.x), 0, m(segment.start.y)]} rotation={[0, -segment.angle * Math.PI / 180, 0]}
        ref={(group) => { if (group) groups.current.set(segment.id, group); else groups.current.delete(segment.id); }}>
        {physicalWall && pieces.map((piece, i) => <WallBox key={`wall-${i}`} piece={piece} thickness={thickness} />)}
        {physicalWall && holes.map((hole, index) => <group key={`opening-${index}`}>
          {[
            { ...hole, to: hole.from + 40 }, { ...hole, from: hole.to - 40 },
            { ...hole, bottom: hole.top - 40 }, ...(hole.bottom > 0 ? [{ ...hole, top: hole.bottom + 40 }] : []),
          ].map((piece, i) => <WallBox key={i} piece={piece} thickness={thickness + 12} color="#fafafa" />)}
          {hole.bottom > 0 && <mesh position={[m((hole.from + hole.to) / 2), m((hole.bottom + hole.top) / 2), -m(thickness / 2)]}>
            <boxGeometry args={[m(hole.to - hole.from), m(hole.top - hole.bottom), 0.008]} />
            <meshStandardMaterial color="#cfe6f5" transparent opacity={0.35} roughness={0.05} metalness={0.1} />
          </mesh>}
        </group>)}
        {materials.backsplash && cladding.map((piece, i) => <WallBox key={`cladding-${i}`} name={`kitchen-backsplash-${segment.id}-${i}`} piece={piece} thickness={12} inset={6} material={materials.backsplash!} />)}
        {treatments.map((treatment) => <Treatment key={treatment.id} treatment={treatment} segment={segment} holes={holes} />)}
      </group>;
    })}
  </>;
}
