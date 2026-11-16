import { Edges } from '@react-three/drei';
import { memo, useEffect, useMemo, type ReactNode, type Ref } from 'react';
import type * as THREE from 'three';
import { BASE_HEIGHT, PLINTH_HEIGHT, hasWorktop } from '../../domain/catalog';
import { isWallMounted, localToRoom } from '../../domain/geometry';
import type { KitchenItem } from '../../domain/types';
import { DEFAULT_STYLE, type FrontProfile } from '../../domain/style';
import { KIND_OPTIONS, resolveConfig, type BuildContext } from '../../engine/config';
import { cornerDoorWidths, frontLayout, OVEN_NICHE_HEIGHT, TOWER_OVEN_BOTTOM, type FrontRect } from '../../engine/fronts';
import { drawerBoxHeight, innerDepth, slideLength } from '../../engine/parts';
import { createMaterials, disposeMaterials, m, type KitchenMaterials } from './materials';

type Vec3 = [number, number, number];

const ACCENT = '#2563eb';
const WORKTOP = 0.038;
/** How far the worktop reaches past the fronts. */
const WORKTOP_OVERHANG = 0.02;
/** The plinth sits this far back from the front of the carcass. */
const PLINTH_SETBACK = 0.06;
function Box({ size, position, material, rotation }: { size: Vec3; position: Vec3; material: THREE.Material; rotation?: Vec3 }) {
  return (
    <mesh position={position} rotation={rotation} material={material} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function FloorWash({ W, D, E, materials }: { W: number; D: number; E: number; materials: KitchenMaterials }) {
  return (
    <mesh position={[W / 2, -E + 0.003, D + 0.14]} rotation={[-Math.PI / 2, 0, 0]} material={materials.floorGlow} raycast={() => null}>
      <planeGeometry args={[W, 0.45]} />
    </mesh>
  );
}

function DoorSurface({ W, H, thickness, material, profile }: { W: number; H: number; thickness: number; material: THREE.Material; profile?: FrontProfile }) {
  if (profile !== 'shaker') return <Box size={[W, H, thickness]} position={[W / 2, H / 2, thickness / 2]} material={material} />;
  const frame = Math.min(0.055, W * 0.18, H * 0.18);
  const panel = Math.max(thickness * 0.55, thickness - 0.006);
  return (
    <>
      <Box size={[W - 2 * frame, H - 2 * frame, panel]} position={[W / 2, H / 2, panel / 2]} material={material} />
      {[frame / 2, W - frame / 2].map((x) => <Box key={`stile-${x}`} size={[frame, H, thickness]} position={[x, H / 2, thickness / 2]} material={material} />)}
      {[frame / 2, H - frame / 2].map((y) => <Box key={`rail-${y}`} size={[W - 2 * frame, frame, thickness]} position={[W / 2, y, thickness / 2]} material={material} />)}
    </>
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
  glass?: boolean;
  profile?: FrontProfile;
}

function Fronts({ fronts, z, thickness, materials, lowHandles, glass = false, profile }: FrontsProps) {
  return (
    <>
      {fronts.map((front, i) => {
        const w = m(front.w);
        const h = m(front.h);
        const handle = materials.handle ? handleBox(front, z + thickness, lowHandles(front)) : null;
        return (
          <group key={i}>
            <group position={[m(front.x), m(front.y), z]}>
              <DoorSurface W={w} H={h} thickness={thickness} material={glass ? materials.displayGlass : materials.front} profile={glass ? 'flat' : profile} />
            </group>
            {glass && [0.07, h - 0.07].map((offset) => (
              <Box key={offset} size={[0.022, 0.032, 0.018]} position={[m(front.x) + (front.hinge === 'right' ? w - 0.008 : 0.008), m(front.y) + offset, z + thickness]} material={materials.steel} />
            ))}
            {handle && materials.handle && <Box size={handle.size} position={handle.position} material={materials.handle} />}
          </group>
        );
      })}
    </>
  );
}

/** A unit with no fronts, built from its panels so the shelves show. */
function OpenCarcass({ W, H, D, t, tb, shelves, setback, materials, back = true, shelfTop }: {
  W: number; H: number; D: number; t: number; tb: number; shelves: number; setback: number; materials: KitchenMaterials; back?: boolean; shelfTop?: number;
}) {
  const inner = W - 2 * t;
  return (
    <>
      <Box size={[t, H, D]} position={[t / 2, H / 2, D / 2]} material={materials.carcass} />
      <Box size={[t, H, D]} position={[W - t / 2, H / 2, D / 2]} material={materials.carcass} />
      <Box size={[inner, t, D]} position={[W / 2, t / 2, D / 2]} material={materials.carcass} />
      <Box size={[inner, t, D]} position={[W / 2, H - t / 2, D / 2]} material={materials.carcass} />
      {back && <Box size={[inner, H - 2 * t, tb]} position={[W / 2, H / 2, tb / 2]} material={materials.carcass} />}
      {Array.from({ length: shelves }, (_, i) => {
        const y = t + (((shelfTop ?? H - t) - t) * (i + 1)) / (shelves + 1);
        const depth = D - tb - setback;
        return <Box key={i} size={[inner, t, depth]} position={[W / 2, y, tb + depth / 2]} material={materials.carcass} />;
      })}
    </>
  );
}

function DrawerInteriors({ item, ctx, materials, fronts }: { item: KitchenItem; ctx: BuildContext; materials: KitchenMaterials; fronts: FrontRect[] }) {
  const config = resolveConfig(item, ctx);
  const t = m(config.carcass.thickness);
  const metal = ctx.settings.drawerSystem === 'metal';
  const bottomThickness = m(metal ? config.carcass.thickness : config.back.thickness);
  const inside = item.width - 2 * config.carcass.thickness;
  const width = m(inside - (metal ? ctx.settings.metalBottomDeduction : 2 * ctx.settings.slideClearance));
  const depth = m(slideLength(innerDepth(item, config, ctx)) - (metal ? ctx.settings.metalDepthDeduction : 0));
  return <>{fronts.filter((front) => front.kind === 'drawer').map((front, index) => {
    const boxHeight = drawerBoxHeight(front, ctx);
    const height = m(boxHeight);
    const bottom = m(front.y + (front.h - boxHeight) / 2);
    const z = m(item.depth) - depth - (config.doorType === 'inset' ? m(config.front.thickness) : 0);
    return <group key={index} name="cabinet-drawer" position={[(m(item.width) - width) / 2, bottom, z]}>
      <Box size={[width, bottomThickness, depth]} position={[width / 2, -bottomThickness / 2, depth / 2]} material={materials.carcass} />
      <Box size={[metal ? m(inside - ctx.settings.metalBackDeduction) : width - 2 * t, height, t]} position={[width / 2, height / 2, t / 2]} material={materials.carcass} />
      {!metal && <>
        {[t / 2, width - t / 2].map((x) => <Box key={x} size={[t, height, depth]} position={[x, height / 2, depth / 2]} material={materials.carcass} />)}
        <Box size={[width - 2 * t, height, t]} position={[width / 2, height / 2, depth - t / 2]} material={materials.carcass} />
      </>}
    </group>;
  })}</>;
}

function CornerInterior({ W, W2, H, D, t, shelves, materials }: {
  W: number; W2: number; H: number; D: number; t: number; shelves: number; materials: KitchenMaterials;
}) {
  return <group name="cabinet-interior">
    <Box size={[W, H, t]} position={[W / 2, H / 2, t / 2]} material={materials.carcass} />
    <Box size={[t, H, W2 - t]} position={[t / 2, H / 2, (W2 + t) / 2]} material={materials.carcass} />
    <Box size={[t, H, D - t]} position={[W - t / 2, H / 2, (D + t) / 2]} material={materials.carcass} />
    <Box size={[D - t, H, t]} position={[(D + t) / 2, H / 2, W2 - t / 2]} material={materials.carcass} />
    {[t / 2, ...Array.from({ length: shelves }, (_, i) => t + (H - 2 * t) * (i + 1) / (shelves + 1)), H - t / 2].map((y) => <group key={y}>
      <Box size={[W - 2 * t, t, D - t]} position={[W / 2, y, (D + t) / 2]} material={materials.carcass} />
      <Box size={[D - t, t, W2 - D - t]} position={[(D + t) / 2, y, (W2 + D - t) / 2]} material={materials.carcass} />
    </group>)}
  </group>;
}

function ShelfDecor({ W, H, D, t, shelves, materials }: { W: number; H: number; D: number; t: number; shelves: number; materials: KitchenMaterials }) {
  const y = t + (H - 2 * t) / (shelves + 1) + t / 2;
  return (
    <group position={[0, y, D * 0.57]}>
      <mesh position={[W * 0.3, 0.055, 0]} material={materials.ceramic} castShadow>
        <cylinderGeometry args={[0.025, 0.045, 0.11, 16]} />
      </mesh>
      <mesh position={[W * 0.66, 0.028, 0]} material={materials.pot} castShadow>
        <cylinderGeometry args={[0.038, 0.029, 0.056, 14]} />
      </mesh>
      {[-1, 0, 1].map((side) => (
        <mesh key={side} position={[W * 0.66 + side * 0.023, 0.09 + Math.abs(side) * 0.008, 0]} rotation={[0, 0, side * 0.45]} scale={[0.027, 0.052, 0.017]} material={materials.foliage} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      ))}
    </group>
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

function SelectionBox({ size, position, invalid = false }: { size: Vec3; position: Vec3; invalid?: boolean }) {
  const color = invalid ? '#dc2626' : ACCENT;
  return (
    <mesh position={position} raycast={() => null}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={color} transparent opacity={0.07} depthWrite={false} />
      <Edges color={color} />
    </mesh>
  );
}

interface UnitProps {
  item: KitchenItem;
  ctx: BuildContext;
  materials: KitchenMaterials;
  selected: boolean;
  onSelect: (id: string) => void;
  accentLight?: boolean;
  underLighting?: boolean;
  invalid?: boolean;
  objectRef?: Ref<THREE.Group>;
  interior?: boolean;
}

/**
 * One unit in 3D. Its group sits at the unit's back-left corner on the
 * underside of the carcass; inside it, x runs along the front, y up, and z
 * from the back towards the front, matching the plan's local frame.
 */
export const Unit3D = memo(function Unit3D({ item, ctx, materials: sharedMaterials, selected, onSelect, accentLight = false, underLighting = true, invalid = false, objectRef, interior = false }: UnitProps) {
  const localMaterials = useMemo(() => item.frontFinish || item.carcassFinish
    ? createMaterials({ ...(ctx.style ?? DEFAULT_STYLE), front: item.frontFinish ?? ctx.style?.front ?? DEFAULT_STYLE.front }, item.carcassFinish)
    : null, [ctx.style, item.frontFinish, item.carcassFinish]);
  useEffect(() => () => { if (localMaterials) disposeMaterials(localMaterials); }, [localMaterials]);
  const materials = localMaterials ?? sharedMaterials;
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
  const worktop = hasWorktop(item);
  const plinth = !wallUnit && E >= 0.03 && item.kind !== 'fridge' && item.kind !== 'endPanel';
  const worktopDepth = D + tf + WORKTOP_OVERHANG;

  let body: ReactNode;
  let bounds: { size: Vec3; position: Vec3 } = { size: [W, H, D + tf], position: [W / 2, H / 2, (D + tf) / 2] };

  switch (item.kind) {
    case 'bar': {
      const top = m(config.carcass.thickness);
      body = (
        <>
          <Box size={[W, top, D]} position={[W / 2, H - top / 2, D / 2]} material={materials.worktop} />
          {[0.075, W - 0.075].flatMap((x) => [0.075, D - 0.075].map((z) => (
            <Box key={`${x}-${z}`} size={[0.045, H - top, 0.045]} position={[x, (H - top) / 2, z]} material={materials.handle ?? materials.steel} />
          )))}
        </>
      );
      bounds = { size: [W, H, D], position: [W / 2, H / 2, D / 2] };
      break;
    }
    case 'hood':
      body = (
        <>
          <Box size={[W, 0.09, D]} position={[W / 2, 0.045, D / 2]} material={materials.steel} />
          <Box size={[W * 0.36, H - 0.09, D * 0.45]} position={[W / 2, (H + 0.09) / 2, D * 0.225]} material={materials.steel} />
          <Box size={[W * 0.8, 0.008, D * 0.7]} position={[W / 2, -0.004, D / 2]} material={materials.dark} />
          {ctx.style?.lighting && <Box size={[W * 0.75, 0.006, 0.012]} position={[W / 2, -0.009, D - 0.035]} material={materials.light} />}
        </>
      );
      bounds = { size: [W, H, D], position: [W / 2, H / 2, D / 2] };
      break;
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
          <Fronts fronts={fronts} z={D} thickness={tf} materials={materials} lowHandles={() => false} profile={ctx.style?.frontProfile} />
          {ctx.style?.plinthLighting && <Box size={[W - 0.025, 0.006, 0.012]} position={[W / 2, p - 0.015, D - PLINTH_SETBACK + 0.01]} material={materials.light} />}
          {ctx.style?.plinthLighting && <FloorWash W={W} D={D} E={0} materials={materials} />}
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
          {interior ? <CornerInterior W={W} W2={W2} H={H} D={D} t={m(config.carcass.thickness)} shelves={config.shelves} materials={materials} /> : <>
            <Box size={[W, H, D]} position={[W / 2, H / 2, D / 2]} material={materials.carcass} />
            <Box size={[D, H, W2 - D]} position={[D / 2, H / 2, D + (W2 - D) / 2]} material={materials.carcass} />
            <group position={[W - gap / 2 - a, gap / 2, D]}><DoorSurface W={a} H={doorH} thickness={tf} material={materials.front} profile={ctx.style?.frontProfile} /></group>
            <group position={[D, gap / 2, W2 - gap / 2]} rotation={[0, Math.PI / 2, 0]}><DoorSurface W={b} H={doorH} thickness={tf} material={materials.front} profile={ctx.style?.frontProfile} /></group>
          </>}
          {!interior && materials.handle && (
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
          {plinth && ctx.style?.plinthLighting && (
            <>
              <Box size={[W - D + PLINTH_SETBACK, 0.006, 0.012]} position={[(W + D - PLINTH_SETBACK) / 2, -0.015, D - PLINTH_SETBACK + 0.01]} material={materials.light} />
              <Box size={[0.012, 0.006, W2 - D + PLINTH_SETBACK]} position={[D - PLINTH_SETBACK + 0.01, -0.015, (W2 + D - PLINTH_SETBACK) / 2]} material={materials.light} />
              <group position={[D, 0, 0]}><FloorWash W={W - D} D={D} E={E} materials={materials} /></group>
              <group position={[0, 0, W2]} rotation={[0, Math.PI / 2, 0]}><FloorWash W={W2 - D} D={D} E={E} materials={materials} /></group>
            </>
          )}
          {wallUnit && underLighting && ctx.style?.lighting && (
            <>
              <Box size={[W - D, 0.008, 0.015]} position={[(W + D) / 2, -0.008, D - 0.025]} material={materials.light} />
              <Box size={[0.015, 0.008, W2 - D]} position={[D - 0.025, -0.008, (W2 + D) / 2]} material={materials.light} />
              {accentLight && <pointLight position={[D + 0.05, -0.1, D + 0.05]} color="#ffd395" intensity={0.16} distance={1.6} decay={2} />}
            </>
          )}
        </>
      );
      bounds = { size: [W, H, W2], position: [W / 2, H / 2, W2 / 2] };
      return (
        <UnitGroup item={item} anchor={anchor} onSelect={onSelect} objectRef={objectRef}>
          {body}
          {(selected || invalid) && <SelectionBox {...bounds} invalid={invalid} />}
        </UnitGroup>
      );
    }
    default: {
      const glass = item.kind === 'glassWall';
      const open = fronts.length === 0 || item.kind === 'shelf' || glass || item.kind === 'ovenTower';
      // Inset fronts sit inside the carcass, so it is drawn from its panels with the fronts set in.
      const inset = config.doorType === 'inset' && fronts.length > 0;
      body = (
        <>
          {open || inset || interior ? (
            <group name={interior ? 'cabinet-interior' : undefined}>
              <OpenCarcass
                W={W}
                H={H}
                D={D}
                t={m(config.carcass.thickness)}
                tb={m(config.back.thickness)}
                shelves={inset && !interior ? 0 : config.shelves}
                shelfTop={interior ? Math.min(H - m(config.carcass.thickness), ...fronts.filter((front) => front.kind === 'drawer').map((front) => m(front.y))) : undefined}
                setback={m(settings.shelfSetback)}
                materials={materials}
                back={KIND_OPTIONS[item.kind].back}
              />
              {interior && <DrawerInteriors item={item} ctx={ctx} materials={materials} fronts={fronts} />}
            </group>
          ) : (
            <>
              <Box size={[W, H, D]} position={[W / 2, H / 2, D / 2]} material={materials.carcass} />
              {ctx.style?.handles === 'none' && fronts.length > 0 && <Box size={[W, H, 0.001]} position={[W / 2, H / 2, D + 0.0005]} material={materials.glass} />}
            </>
          )}
          <group name="cabinet-fronts">
            <Fronts fronts={interior ? fronts.filter((front) => front.kind === 'panel') : fronts} z={inset ? D - tf : D} thickness={tf} materials={materials} lowHandles={lowHandles} glass={glass} profile={ctx.style?.frontProfile} />
          </group>
          {item.kind === 'oven' && <OvenFront W={W} H={H} D={D} gap={gap} materials={materials} />}
          {item.kind === 'ovenTower' && (
            <>
              {[TOWER_OVEN_BOTTOM, TOWER_OVEN_BOTTOM + OVEN_NICHE_HEIGHT + config.carcass.thickness].map((height) => (
                <Box key={height} size={[W - 2 * m(config.carcass.thickness), m(config.carcass.thickness), D]} position={[W / 2, m(height - config.carcass.thickness / 2), D / 2]} material={materials.carcass} />
              ))}
              <OvenFront W={W} H={m(TOWER_OVEN_BOTTOM + OVEN_NICHE_HEIGHT)} D={D} gap={gap} materials={materials} />
            </>
          )}
          {ctx.style?.decor && (item.kind === 'shelf' || glass) && config.shelves > 0 && (
            <ShelfDecor W={W} H={H} D={D} t={m(config.carcass.thickness)} shelves={config.shelves} materials={materials} />
          )}
          {glass && ctx.style?.lighting && Array.from({ length: config.shelves + 1 }, (_, index) => (
            <Box key={index} size={[Math.max(0.1, W - 0.05), 0.006, 0.008]} position={[W / 2, H - m(config.carcass.thickness) - index * (H - 2 * m(config.carcass.thickness)) / (config.shelves + 1) - 0.01, 0.02]} material={materials.light} />
          ))}
        </>
      );
    }
  }

  return (
    <UnitGroup item={item} anchor={anchor} onSelect={onSelect} objectRef={objectRef}>
      {body}
      {worktop && <Worktop W={W} D={worktopDepth} H={H} materials={materials} />}
      {worktop && item.kind === 'sink' && <Sink W={W} D={worktopDepth} top={H + WORKTOP} materials={materials} />}
      {worktop && (item.kind === 'oven' || item.kind === 'hob') && <Hob W={W} D={worktopDepth} top={H + WORKTOP} materials={materials} />}
      {plinth && <Box size={[W, E, 0.016]} position={[W / 2, -E / 2, D - PLINTH_SETBACK]} material={materials.front} />}
      {plinth && ctx.style?.plinthLighting && (
        <>
          <Box size={[Math.max(0.005, W - 0.025), 0.006, 0.012]} position={[W / 2, -0.015, D - PLINTH_SETBACK + 0.01]} material={materials.light} />
          <FloorWash W={W} D={D} E={E} materials={materials} />
        </>
      )}
      {item.kind === 'integratedFridge' && E > 0.04 && <Box size={[W * 0.82, Math.min(E * 0.6, 0.055), 0.008]} position={[W / 2, -E / 2, D - PLINTH_SETBACK + 0.012]} material={materials.dark} />}
      {ctx.style?.lighting && wallUnit && underLighting && KIND_OPTIONS[item.kind].carcass && (
        <>
          <Box size={[Math.max(0.1, W - 0.08), 0.008, 0.015]} position={[W / 2, -0.008, D - 0.025]} material={materials.light} />
          {accentLight && <pointLight position={[W / 2, item.kind === 'glassWall' ? H * 0.55 : -0.1, D * 0.7]} color="#ffd395" intensity={0.16} distance={1.6} decay={2} />}
        </>
      )}
      {(selected || invalid) && <SelectionBox {...bounds} invalid={invalid} />}
    </UnitGroup>
  );
});

function UnitGroup({ item, anchor, onSelect, children, objectRef }: {
  item: KitchenItem;
  anchor: { x: number; y: number };
  onSelect: (id: string) => void;
  children: ReactNode;
  objectRef?: Ref<THREE.Group>;
}) {
  return (
    <group
      ref={objectRef}
      name={item.id}
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
