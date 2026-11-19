import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hasWorktop, WORKTOP_THICKNESS } from '../../domain/catalog';
import { mountedSpan } from '../../domain/geometry';
import { isUpperCabinet } from '../../domain/upperCabinets';
import { roomFeaturePose, roomOutline } from '../../domain/roomGeometry';
import { FRONT_FINISHES, WORKTOP_FINISHES } from '../../domain/style';
import type { KitchenItem, Opening, Room, WallTreatment } from '../../domain/types';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { openingFrame, openingsOnSegment, roomSegments, solidWallPieces, wallPoint, type WallPiece, type WallSegment } from '../../domain/walls';
import { WALL_THICKNESS } from '../../store/viewport';
import type { BuildContext } from '../../engine/config';
import { createMaterials, disposeMaterials, m, type KitchenMaterials } from './materials';
import { projectContactUV, studioContacts } from './studioContact';

function WallBox({ piece, thickness, inset = -thickness / 2, material, color = '#f0ede7', name, projection }: {
  piece: WallPiece; thickness: number; inset?: number; material?: THREE.Material; color?: string; name?: string; projection?: WallSegment;
}) {
  return <mesh name={name} position={[m((piece.from + piece.to) / 2), m((piece.bottom + piece.top) / 2), m(inset)]} material={material}>
    <boxGeometry key={projection ? `${projection.length}:${projection.height}:${piece.from}:${piece.bottom}` : 'plain'}
      args={[m(piece.to - piece.from), m(piece.top - piece.bottom), m(thickness)]} onUpdate={projection ? (g) =>
      projectContactUV(g, (piece.from + piece.to) / 2, (piece.bottom + piece.top) / 2, projection.length, projection.height) : undefined} />
    {!material && <meshStandardMaterial color={color} roughness={0.9} />}
  </mesh>;
}

function Treatment({ treatment, room, segment, holes, detailed, contact }: { treatment: WallTreatment; room: Room; segment: WallSegment; holes: WallPiece[]; detailed: boolean; contact?: THREE.Texture }) {
  const materials = useMemo(() => {
    const palette = createMaterials({
      front: Object.hasOwn(FRONT_FINISHES, treatment.finish) ? treatment.finish as keyof typeof FRONT_FINISHES : 'white',
      worktop: Object.hasOwn(WORKTOP_FINISHES, treatment.finish) ? treatment.finish as keyof typeof WORKTOP_FINISHES : 'stone',
      handles: 'none',
    }, detailed, room);
    if (contact) palette.front.aoMap = palette.worktop.aoMap = contact;
    return palette;
  }, [treatment.finish, detailed, room, contact]);
  const material = Object.hasOwn(FRONT_FINISHES, treatment.finish) ? materials.front : materials.worktop;
  const pieces = solidWallPieces(segment, holes, { from: treatment.offset, to: Math.min(segment.length, treatment.offset + treatment.width),
    bottom: treatment.elevation, top: Math.min(segment.height, treatment.elevation + treatment.height) });
  useEffect(() => () => disposeMaterials(materials), [materials]);
  return <>{pieces.map((piece, i) => <WallBox key={i} name={`wall-finish-${treatment.id}-${i}`} piece={piece} thickness={12} inset={6} material={material} projection={contact ? segment : undefined} />)}</>;
}

/** Only this small geometric hint is shared with the offline viewer. */
function cutawayData(frame: WallSegment) {
  return frame.partitionId ? undefined : { cutaway: [m((frame.start.x + frame.end.x) / 2), m((frame.start.y + frame.end.y) / 2), frame.inward.x, frame.inward.y] };
}

export function Room3D({ room, openings, items = [], materials, selection, onSelect, selectedWallId, onWallSelect, exportModel = false, detailed = false, build }: {
  room: Room; openings: Opening[]; items?: KitchenItem[]; materials: KitchenMaterials;
  selection?: RoomObjectSelection | null; onSelect?: (selection: RoomObjectSelection) => void;
  selectedWallId?: string | null; onWallSelect?: (id: string) => void;
  exportModel?: boolean; detailed?: boolean; build?: BuildContext;
}) {
  const outline = useMemo(() => roomOutline(room), [room]);
  const segments = useMemo(() => roomSegments(room), [room]);
  const contacts = useMemo(() => detailed && build && items.length ? studioContacts(room, segments, items, build, materials) : null,
    [detailed, build, room, segments, items, materials]);
  useEffect(() => () => contacts?.dispose(), [contacts]);
  const groups = useRef(new Map<string, THREE.Group>());
  const floor = useMemo(() => {
    const shape = new THREE.Shape();
    outline.forEach((point, index) => index === 0 ? shape.moveTo(m(point.x), -m(point.y)) : shape.lineTo(m(point.x), -m(point.y)));
    shape.closePath();
    return shape;
  }, [outline]);
  useFrame(({ camera }) => {
    if (exportModel) return;
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
    <mesh name="room-floor" rotation={[-Math.PI / 2, 0, 0]} material={contacts?.floor ?? materials.floor}>
      <shapeGeometry key={contacts?.floor.aoMap ? `${room.width}:${room.depth}` : 'plain'}
        args={[floor]} onUpdate={contacts?.floor.aoMap ? (g) => projectContactUV(g, 0, room.depth, room.width, room.depth) : undefined} />
    </mesh>
    {(room.features ?? []).map((feature) => {
      const { centre, angle } = roomFeaturePose(room, feature);
      return <group key={feature.id} name={`room-feature-${feature.id}`}
      rotation={[0, -angle * Math.PI / 180, 0]} position={[m(centre.x), m(room.height / 2), m(centre.y)]}
      onClick={(event) => { event.stopPropagation(); if (event.delta <= 2) onSelect?.({ type: 'feature', id: feature.id }); }}>
      <mesh>
        <boxGeometry args={[m(feature.width), m(room.height), m(feature.depth)]} />
        <meshStandardMaterial color={feature.kind === 'chimney' ? '#d2c3ad' : '#e1dacf'} roughness={0.9} />
        {selection?.type === 'feature' && selection.id === feature.id && <Edges color="#2563eb" raycast={() => null} />}
      </mesh>
    </group>; })}
    {openings.map((opening) => {
      const frame = openingFrame(room, opening);
      if (!frame) return null;
      const centre = wallPoint(frame, opening.offset + opening.width / 2);
      const thickness = room.partitions?.find((partition) => partition.id === frame.partitionId)?.thickness ?? WALL_THICKNESS;
      const selected = selection?.type === 'opening' && selection.id === opening.id;
      const frameMaterial = opening.kind === 'window' ? materials.windowFrame : materials.doorFrame;
      const W = m(opening.width);
      const H = m(opening.height);
      const frameParts: Array<{ size: [number, number, number]; at: [number, number, number] }> = [
        { size: [0.04, H, m(thickness + 12)], at: [-W / 2 + 0.02, 0, 0] },
        { size: [0.04, H, m(thickness + 12)], at: [W / 2 - 0.02, 0, 0] },
        { size: [W, 0.04, m(thickness + 12)], at: [0, H / 2 - 0.02, 0] },
      ];
      if (opening.kind === 'window') frameParts.push({ size: [W, 0.04, m(thickness + 12)], at: [0, -H / 2 + 0.02, 0] });
      return <group key={opening.id} name={`room-opening-${opening.id}`} userData={exportModel ? cutawayData(frame) : undefined}
        position={[m(centre.x), m(opening.sill + opening.height / 2), m(centre.y)]} rotation={[0, -frame.angle * Math.PI / 180, 0]}
        onClick={(event) => { event.stopPropagation(); if (event.delta <= 2) onSelect?.({ type: 'opening', id: opening.id }); }}>
        <mesh position={[0, 0, 0.008]} material={opening.kind === 'window' ? materials.windowGlass : materials.doorLeaf}>
          <boxGeometry args={[W, H, 0.016]} />
          {selected && <Edges color="#2563eb" raycast={() => null} />}
        </mesh>
        {frameParts.map((part, index) => <mesh key={index} position={part.at} material={frameMaterial}>
          <boxGeometry args={part.size} />
          {selected && <Edges color="#2563eb" raycast={() => null} />}
        </mesh>)}
      </group>;
    })}
    {segments.map((segment) => {
      const contact = contacts?.walls.get(segment.id);
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
      return <group key={segment.id} position={[m(segment.start.x), 0, m(segment.start.y)]} rotation={[0, -segment.angle * Math.PI / 180, 0]} userData={exportModel ? cutawayData(segment) : undefined}
        onClick={onWallSelect ? (event) => {
          if (event.delta <= 2 && groups.current.get(segment.id)?.visible) { event.stopPropagation(); onWallSelect(segment.id); }
        } : undefined}
        ref={(group) => { if (group) groups.current.set(segment.id, group); else groups.current.delete(segment.id); }}>
        {selectedWallId === segment.id && <mesh position={[m(segment.length / 2), m(segment.height), 0]}>
          <boxGeometry args={[m(segment.length), 0.035, 0.04]} /><meshBasicMaterial color="#376b4a" />
        </mesh>}
        {physicalWall && pieces.map((piece, i) => <WallBox key={`wall-${i}`} name={`room-wall-${segment.id}-${i}`} piece={piece} thickness={thickness} material={contact?.wall ?? materials.wall} projection={contact ? segment : undefined} />)}
        {materials.backsplash && cladding.map((piece, i) => <WallBox key={`cladding-${i}`} name={`kitchen-backsplash-${segment.id}-${i}`} piece={piece} thickness={12} inset={6} material={contact?.cladding ?? materials.backsplash!} projection={contact ? segment : undefined} />)}
        {treatments.map((treatment) => <Treatment key={treatment.id} treatment={treatment} room={room} segment={segment} holes={holes} detailed={detailed} contact={contact?.map} />)}
      </group>;
    })}
  </>;
}
