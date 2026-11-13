import { Edges } from '@react-three/drei';
import { memo, type ReactNode } from 'react';
import type * as THREE from 'three';
import { BASE_HEIGHT, PLINTH_HEIGHT } from '../../domain/catalog';
import { isWallMounted, localToRoom } from '../../domain/geometry';
import type { KitchenItem } from '../../domain/types';
import { resolveConfig, type BuildContext } from '../../engine/config';
import { cornerDoorWidths, frontLayout, OVEN_NICHE_HEIGHT, type FrontRect } from '../../engine/fronts';
import { m, type KitchenMaterials } from './materials';

type Vec3 = [number, number, number];

const ACCENT = '#2563eb';
const WORKTOP = 0.038;
/** How far the worktop reaches past the fronts. */
const WORKTOP_OVERHANG = 0.02;
/** The plinth sits this far back from the front of the carcass. */
const PLINTH_SETBACK = 0.06;
const WORKTOP_KINDS = new Set<KitchenItem['kind']>(['base', 'sink', 'oven', 'drawer', 'dishwasher', 'filler', 'corner']);

function Box({ size, position, material, rotation }: { size: Vec3; position: Vec3; material: THREE.Material; rotation?: Vec3 }) {
  return (
    <mesh position={position} rotation={rotation} material={material} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

/** Where a handle goes on a front: near the opening edge of doors, along the top of drawers. */
function handleBox(front: FrontRect, frontZ: number, low: boolean): { size: Vec3; position: Vec3 } {
  const x = m(front.x);
  const y = m(front.y);
  const w = m(front.w);
  const h = m(front.h);
  const z = frontZ + 0.014;
  if (front.kind === 'door') {
    const length = Math.min(0.16, h * 0.5);
    const hx = front.hinge === 'right' ? x + 0.035 : x + w - 0.035;
    const hy = low ? y + 0.05 + length / 2 : y + h - 0.05 - length / 2;
    return { size: [0.012, length, 0.012], position: [hx, hy, z] };
  }
  const length = Math.min(0.2, w * 0.5);
  return { size: [length, 0.012, 0.012], position: [x + w / 2, y + h - Math.min(0.04, h / 3), z] };
}

interface FrontsProps {
  fronts: FrontRect[];
  /** Back face of the fronts (the front face of the carcass). */
  z: number;
  thickness: number;
  materials: KitchenMaterials;
  /** Handles at the bottom of doors, as on wall units. */
  lowHandles: (front: FrontRect) => boolean;
}

function Fronts({ fronts, z, thickness, materials, lowHandles }: FrontsProps) {
  return (
    <>
      {fronts.map((front, i) => {
        const w = m(front.w);
        const h = m(front.h);
        const handle = materials.handle ? handleBox(front, z + thickness, lowHandles(front)) : null;
        return (
          <group key={i}>
            <Box size={[w, h, thickness]} position={[m(front.x) + w / 2, m(front.y) + h / 2, z + thickness / 2]} material={materials.front} />
            {handle && materials.handle && <Box size={handle.size} position={handle.position} material={materials.handle} />}
          </group>
        );
      })}
    </>
  );
}

/** A unit with no fronts, built from its panels so the shelves show. */
function OpenCarcass({ W, H, D, t, tb, shelves, setback, materials }: {
  W: number; H: number; D: number; t: number; tb: number; shelves: number; setback: number; materials: KitchenMaterials;
}) {
  const inner = W - 2 * t;
  return (
    <>
      <Box size={[t, H, D]} position={[t / 2, H / 2, D / 2]} material={materials.carcass} />
      <Box size={[t, H, D]} position={[W - t / 2, H / 2, D / 2]} material={materials.carcass} />
      <Box size={[inner, t, D]} position={[W / 2, t / 2, D / 2]} material={materials.carcass} />
      <Box size={[inner, t, D]} position={[W / 2, H - t / 2, D / 2]} material={materials.carcass} />
      <Box size={[inner, H - 2 * t, tb]} position={[W / 2, H / 2, tb / 2]} material={materials.carcass} />
      {Array.from({ length: shelves }, (_, i) => {
        const y = t + ((H - 2 * t) * (i + 1)) / (shelves + 1);
        const depth = D - tb - setback;
        return <Box key={i} size={[inner, t, depth]} position={[W / 2, y, tb + depth / 2]} material={materials.carcass} />;
      })}
    </>
  );
}

function Worktop({ W, D, H, materials }: { W: number; D: number; H: number; materials: KitchenMaterials }) {
  return <Box size={[W, WORKTOP, D]} position={[W / 2, H + WORKTOP / 2, D / 2]} material={materials.worktop} />;
}

function Sink({ W, D, top, materials }: { W: number; D: number; top: number; materials: KitchenMaterials }) {
  const z = D * 0.5;
  return (
    <>
      <Box size={[W * 0.64, 0.004, D * 0.56]} position={[W / 2, top + 0.002, z]} material={materials.steel} />
      <Box size={[W * 0.56, 0.005, D * 0.46]} position={[W / 2, top + 0.003, z]} material={materials.dark} />
      <mesh position={[W / 2, top + 0.13, D * 0.13]} material={materials.steel} castShadow>
        <cylinderGeometry args={[0.014, 0.017, 0.26, 16]} />
      </mesh>
      <mesh position={[W / 2, top + 0.25, D * 0.13 + 0.09]} rotation={[Math.PI / 2, 0, 0]} material={materials.steel} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 0.18, 12]} />
      </mesh>
    </>
  );
}

function Hob({ W, D, top, materials }: { W: number; D: number; top: number; materials: KitchenMaterials }) {
  const width = Math.min(W - 0.06, 0.58);
  const rings: Array<[number, number, number]> = [
    [-0.15, -0.1, 0.085],
    [0.15, -0.1, 0.06],
    [-0.15, 0.12, 0.06],
    [0.15, 0.12, 0.085],
  ];
  return (
    <>
      <Box size={[width, 0.006, 0.51]} position={[W / 2, top + 0.003, D / 2]} material={materials.glass} />
      {rings.map(([dx, dz, r]) => (
        <mesh key={`${dx}${dz}`} position={[W / 2 + dx * (width / 0.58), top + 0.0065, D / 2 + dz]} material={materials.dark}>
          <cylinderGeometry args={[r, r, 0.001, 32]} />
        </mesh>
      ))}
    </>
  );
}

function OvenFront({ W, H, D, gap, materials }: { W: number; H: number; D: number; gap: number; materials: KitchenMaterials }) {
  const niche = m(OVEN_NICHE_HEIGHT);
  return (
    <>
      <Box size={[W - gap, niche - gap, 0.022]} position={[W / 2, H - niche / 2, D + 0.011]} material={materials.glass} />
      <Box size={[W * 0.7, niche * 0.4, 0.004]} position={[W / 2, H - niche * 0.56, D + 0.024]} material={materials.dark} />
      <Box size={[W * 0.7, 0.014, 0.016]} position={[W / 2, H - 0.06, D + 0.04]} material={materials.steel} />
    </>
  );
}

function Fridge({ W, H, D, materials }: { W: number; H: number; D: number; materials: KitchenMaterials }) {
  const split = H * 0.36;
  return (
    <>
      <Box size={[W, H, D]} position={[W / 2, H / 2, D / 2]} material={materials.appliance} />
      <Box size={[W - 0.01, 0.006, 0.004]} position={[W / 2, split, D + 0.002]} material={materials.dark} />
      <Box size={[0.018, 0.34, 0.025]} position={[W - 0.06, split + 0.26, D + 0.02]} material={materials.steel} />
      <Box size={[0.018, 0.22, 0.025]} position={[W - 0.06, split - 0.16, D + 0.02]} material={materials.steel} />
    </>
  );
}

function SelectionBox({ size, position }: { size: Vec3; position: Vec3 }) {
  return (
    <mesh position={position} raycast={() => null}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={ACCENT} transparent opacity={0.07} depthWrite={false} />
      <Edges color={ACCENT} />
    </mesh>
  );
}

interface UnitProps {
  item: KitchenItem;
  ctx: BuildContext;
  materials: KitchenMaterials;
  selected: boolean;
  onSelect: (id: string) => void;
}

/**
 * One unit in 3D. Its group sits at the unit's back-left corner on the
 * underside of the carcass; inside it, x runs along the front, y up, and z
 * from the back towards the front, matching the plan's local frame.
 */
export const Unit3D = memo(function Unit3D({ item, ctx, materials, selected, onSelect }: UnitProps) {
  const { settings } = ctx;
  const anchor = localToRoom(item, 0, 0);
  const W = m(item.width);
  const H = m(item.height);
  const D = m(item.depth);
  const E = m(item.elevation);
  const config = resolveConfig(item, ctx);
  const tf = m(config.front.thickness);
  const gap = m(settings.frontGap);
  const fronts = frontLayout(item, config, settings);
  const wallUnit = isWallMounted(item);
  const lowHandles = (front: FrontRect) => wallUnit || (item.kind === 'tall' && front.y >= BASE_HEIGHT);
  const worktop = WORKTOP_KINDS.has(item.kind) && !wallUnit && item.elevation + item.height <= 1000;
  const plinth = !wallUnit && E >= 0.03 && item.kind !== 'fridge' && item.kind !== 'endPanel';
  const worktopDepth = D + tf + WORKTOP_OVERHANG;

  let body: ReactNode;
  let bounds: { size: Vec3; position: Vec3 } = { size: [W, H, D + tf], position: [W / 2, H / 2, (D + tf) / 2] };

  switch (item.kind) {
    case 'fridge':
      body = <Fridge W={W} H={H} D={D} materials={materials} />;
      bounds = { size: [W, H, D], position: [W / 2, H / 2, D / 2] };
      break;
    case 'endPanel':
      body = <Box size={[W, H, D]} position={[W / 2, H / 2, D / 2]} material={materials.front} />;
      bounds = { size: [W, H, D], position: [W / 2, H / 2, D / 2] };
      break;
    case 'filler':
      body = <Box size={[W, H, tf]} position={[W / 2, H / 2, D + tf / 2]} material={materials.front} />;
      break;
    case 'dishwasher': {
      const p = m(PLINTH_HEIGHT);
      body = (
        <>
          <Box size={[W - 0.004, H - p, D - 0.06]} position={[W / 2, p + (H - p) / 2, (D - 0.06) / 2 + 0.03]} material={materials.appliance} />
          <Box size={[W, p, 0.016]} position={[W / 2, p / 2, D - PLINTH_SETBACK]} material={materials.front} />
          <Fronts fronts={fronts} z={D} thickness={tf} materials={materials} lowHandles={() => false} />
        </>
      );
      break;
    }
    case 'corner': {
      const W2 = m(item.width2 ?? item.width);
      const [a, b] = cornerDoorWidths(item, config, settings).map(m);
      const doorH = H - gap;
      body = (
        <>
          <Box size={[W, H, D]} position={[W / 2, H / 2, D / 2]} material={materials.carcass} />
          <Box size={[D, H, W2 - D]} position={[D / 2, H / 2, D + (W2 - D) / 2]} material={materials.carcass} />
          <Box size={[a, doorH, tf]} position={[W - gap / 2 - a / 2, H / 2, D + tf / 2]} material={materials.front} />
          <Box size={[tf, doorH, b]} position={[D + tf / 2, H / 2, W2 - gap / 2 - b / 2]} material={materials.front} />
          {materials.handle && (
            <Box
              size={[0.012, Math.min(0.16, doorH * 0.5), 0.012]}
              position={[W - gap / 2 - a + 0.035, wallUnit ? 0.13 : H - 0.13, D + tf + 0.014]}
              material={materials.handle}
            />
          )}
          {worktop && (
            <>
              <Box size={[W, WORKTOP, worktopDepth]} position={[W / 2, H + WORKTOP / 2, worktopDepth / 2]} material={materials.worktop} />
              <Box
                size={[worktopDepth, WORKTOP, W2 - worktopDepth]}
                position={[worktopDepth / 2, H + WORKTOP / 2, worktopDepth + (W2 - worktopDepth) / 2]}
                material={materials.worktop}
              />
            </>
          )}
          {plinth && (
            <>
              <Box size={[W - D + PLINTH_SETBACK, E, 0.016]} position={[(W + D - PLINTH_SETBACK) / 2, -E / 2, D - PLINTH_SETBACK]} material={materials.front} />
              <Box size={[0.016, E, W2 - D + PLINTH_SETBACK]} position={[D - PLINTH_SETBACK, -E / 2, (W2 + D - PLINTH_SETBACK) / 2]} material={materials.front} />
            </>
          )}
        </>
      );
      bounds = { size: [W, H, W2], position: [W / 2, H / 2, W2 / 2] };
      return (
        <UnitGroup item={item} anchor={anchor} onSelect={onSelect}>
          {body}
          {selected && <SelectionBox {...bounds} />}
        </UnitGroup>
      );
    }
    default: {
      const open = fronts.length === 0 || item.kind === 'shelf';
      // Inset fronts sit inside the carcass, so it is drawn from its panels with the fronts set in.
      const inset = config.doorType === 'inset' && fronts.length > 0;
      body = (
        <>
          {open || inset ? (
            <OpenCarcass
              W={W}
              H={H}
              D={D}
              t={m(config.carcass.thickness)}
              tb={m(config.back.thickness)}
              shelves={inset ? 0 : config.shelves}
              setback={m(settings.shelfSetback)}
              materials={materials}
            />
          ) : (
            <Box size={[W, H, D]} position={[W / 2, H / 2, D / 2]} material={materials.carcass} />
          )}
          <Fronts fronts={fronts} z={inset ? D - tf : D} thickness={tf} materials={materials} lowHandles={lowHandles} />
          {item.kind === 'oven' && <OvenFront W={W} H={H} D={D} gap={gap} materials={materials} />}
        </>
      );
    }
  }

  return (
    <UnitGroup item={item} anchor={anchor} onSelect={onSelect}>
      {body}
      {worktop && <Worktop W={W} D={worktopDepth} H={H} materials={materials} />}
      {worktop && item.kind === 'sink' && <Sink W={W} D={worktopDepth} top={H + WORKTOP} materials={materials} />}
      {worktop && item.kind === 'oven' && <Hob W={W} D={worktopDepth} top={H + WORKTOP} materials={materials} />}
      {plinth && <Box size={[W, E, 0.016]} position={[W / 2, -E / 2, D - PLINTH_SETBACK]} material={materials.front} />}
      {selected && <SelectionBox {...bounds} />}
    </UnitGroup>
  );
});

function UnitGroup({ item, anchor, onSelect, children }: {
  item: KitchenItem;
  anchor: { x: number; y: number };
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <group
      position={[m(anchor.x), m(item.elevation), m(anchor.y)]}
      rotation={[0, (-item.rotation * Math.PI) / 180, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      {children}
    </group>
  );
}
