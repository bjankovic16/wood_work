import { Edges } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type Ref } from 'react';
import type * as THREE from 'three';
import { BASE_HEIGHT, PLINTH_HEIGHT, hasWorktop } from '../../domain/catalog';
import { isWallMounted, localToRoom } from '../../domain/geometry';
import type { KitchenItem } from '../../domain/types';
import type { FrontProfile } from '../../domain/style';
import { KIND_OPTIONS, resolveConfig, type BuildContext } from '../../engine/config';
import { cornerDoorWidths, frontLayout, OVEN_NICHE_HEIGHT, TOWER_OVEN_BOTTOM, type FrontRect } from '../../engine/fronts';
import { drawerBoxHeight, innerDepth, slideLength } from '../../engine/parts';
import { cabinetMaterial, m, type KitchenMaterials } from './materials';
import { boardGrainUV, boardRecess, CoffeeMaker, ShelfStillLife, StudioFront, StudioPull, StudioSink, StudioSlabFront, useRecessMaterial, type RecessFace } from './StudioFittings';

type Vec3 = [number, number, number];

const ACCENT = '#2563eb';
const WORKTOP = 0.038;
/** How far the worktop reaches past the fronts. */
const WORKTOP_OVERHANG = 0.02;
/** The plinth sits this far back from the front of the carcass. */
const PLINTH_SETBACK = 0.06;
/** How far an opened door swings: a little past square, like a 110-degree hinge. */
const DOOR_SWING = Math.PI * 0.6;
export const coffeeCornerId = (items: readonly KitchenItem[]) => items.find((item) => item.kind === 'corner' && hasWorktop(item))?.id;

function Box({ size, position, material, rotation, recess }: {
  size: Vec3; position: Vec3; material: THREE.Material; rotation?: Vec3; recess?: { face: RecessFace; depth: number };
}) {
  return (
    <mesh position={position} rotation={rotation} material={material}>
      <boxGeometry key={`${!!material.userData.woodGrain}:${recess ? `${recess.face}:${recess.depth}:${position[2]}` : ''}`} args={size}
        onUpdate={recess || material.userData.woodGrain ? (g) => {
        if (material.userData.woodGrain) boardGrainUV(g, size[1] < Math.min(size[0], size[2]));
        if (recess) boardRecess(g, recess.face, position[2], recess.depth);
      } : undefined} />
    </mesh>
  );
}

/** Seconds a door or drawer takes to open, and to close again. */
const OPEN_SECONDS = 0.5;
const CLOSE_SECONDS = 0.32;

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** A door that swings by `angle` or a drawer that slides out by `travel`, starting `delay` seconds after its unit opens. */
function OpeningPart({ opened, position, angle = 0, travel = 0, delay = 0, children }: {
  opened: boolean; position: Vec3; angle?: number; travel?: number; delay?: number; children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  // A unit drawn again while it is open stays open instead of opening once more.
  const progress = useRef(opened ? 1 : 0);
  const wait = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  const place = () => {
    const eased = easeInOut(progress.current);
    if (ref.current) {
      ref.current.rotation.y = angle * eased;
      ref.current.position.z = travel * eased;
    }
  };
  useLayoutEffect(place);
  useEffect(() => {
    wait.current = opened && progress.current === 0 ? delay : 0;
    invalidate();
  }, [opened, delay, invalidate]);
  useFrame((_, delta) => {
    const target = opened ? 1 : 0;
    if (progress.current === target) return;
    const step = Math.min(delta, 0.05);
    if (prefersReducedMotion()) {
      progress.current = target;
    } else if (wait.current > 0) {
      wait.current -= step;
    } else {
      progress.current = opened ? Math.min(1, progress.current + step / OPEN_SECONDS) : Math.max(0, progress.current - step / CLOSE_SECONDS);
    }
    place();
    if (progress.current !== target) invalidate();
  });
  return <group position={position}><group ref={ref} name="cabinet-opening">{children}</group></group>;
}

/** How one drawer front opens: lower drawers come out further, so every drawer shows its inside. */
interface DrawerOpening { travel: number; delay: number }

function drawerOpenings(fronts: readonly FrontRect[], slide: number): Map<FrontRect, DrawerOpening> {
  const drawers = fronts.filter((front) => front.kind === 'drawer').sort((a, b) => b.y - a.y);
  return new Map(drawers.map((front, index) => [front, {
    travel: slide * (drawers.length > 1 ? 0.5 + 0.42 * index / (drawers.length - 1) : 0.8),
    delay: index * 0.07,
  }]));
}

function DoorSurface({ W, H, thickness, material, profile, detailed }: { W: number; H: number; thickness: number; material: THREE.MeshStandardMaterial; profile?: FrontProfile; detailed?: boolean }) {
  if (detailed && profile !== 'shaker') return <StudioSlabFront W={W} H={H} thickness={thickness} material={material} />;
  if (profile !== 'shaker') return <Box size={[W, H, thickness]} position={[W / 2, H / 2, thickness / 2]} material={material} />;
  if (detailed) return <StudioFront W={W} H={H} thickness={thickness} material={material} />;
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
  detailed?: boolean;
  opened?: boolean;
  drawers?: Map<FrontRect, DrawerOpening>;
}

function Fronts({ fronts, z, thickness, materials, lowHandles, glass = false, profile, detailed, opened = false, drawers }: FrontsProps) {
  return (
    <>
      {fronts.map((front, i) => {
        const w = m(front.w);
        const h = m(front.h);
        const handle = materials.handle ? handleBox(front, z + thickness, lowHandles(front)) : null;
        const pivot = front.kind === 'door' && front.hinge === 'right' ? m(front.x) + w : m(front.x);
        return (
          <OpeningPart key={i} opened={opened} position={[pivot, m(front.y), z]}
            angle={front.kind === 'door' ? (front.hinge === 'right' ? 1 : -1) * DOOR_SWING : 0}
            travel={drawers?.get(front)?.travel ?? 0} delay={drawers?.get(front)?.delay ?? 0}>
          <group position={[-pivot, -m(front.y), -z]}>
            <group position={[m(front.x), m(front.y), z]}>
              <DoorSurface W={w} H={h} thickness={thickness} material={glass ? materials.displayGlass : materials.front} profile={glass ? 'flat' : profile} detailed={detailed} />
            </group>
            {glass && [0.07, h - 0.07].map((offset) => (
              <Box key={offset} size={[0.022, 0.032, 0.018]} position={[m(front.x) + (front.hinge === 'right' ? w - 0.008 : 0.008), m(front.y) + offset, z + thickness]} material={materials.steel} />
            ))}
            {handle && materials.handle && (detailed
              ? <StudioPull length={Math.max(handle.size[0], handle.size[1])} vertical={front.kind === 'door'} position={handle.position} material={materials.handle} />
              : <Box size={handle.size} position={handle.position} material={materials.handle} />)}
          </group>
          </OpeningPart>
        );
      })}
    </>
  );
}

/** A unit with no fronts, built from its panels so the shelves show. */
function OpenCarcass({ W, H, D, t, tb, shelves, setback, materials, back = true, top = true, shelfTop }: {
  W: number; H: number; D: number; t: number; tb: number; shelves: number; setback: number; materials: KitchenMaterials; back?: boolean; top?: boolean; shelfTop?: number;
}) {
  const inner = W - 2 * t;
  const source = materials.carcass;
  const lining = useRecessMaterial(source);
  const board = (face: RecessFace) => ({ material: lining ?? source, recess: lining ? { face, depth: D } : undefined });
  return (
    <>
      <Box size={[t, H, D]} position={[t / 2, H / 2, D / 2]} {...board('right')} />
      <Box size={[t, H, D]} position={[W - t / 2, H / 2, D / 2]} {...board('left')} />
      <Box size={[inner, t, D]} position={[W / 2, t / 2, D / 2]} {...board('up')} />
      {top && <Box size={[inner, t, D]} position={[W / 2, H - t / 2, D / 2]} {...board('down')} />}
      {back && <Box size={[inner, H - 2 * t, tb]} position={[W / 2, H / 2, tb / 2]} {...board('back')} />}
      {Array.from({ length: shelves }, (_, i) => {
        const y = t + (((shelfTop ?? H - t) - t) * (i + 1)) / (shelves + 1);
        const depth = D - tb - setback;
        return <Box key={i} size={[inner, t, depth]} position={[W / 2, y, tb + depth / 2]} {...board('shelf')} />;
      })}
    </>
  );
}

function DrawerInteriors({ item, ctx, materials, fronts, opened = false, drawers }: { item: KitchenItem; ctx: BuildContext; materials: KitchenMaterials; fronts: FrontRect[]; opened?: boolean; drawers?: Map<FrontRect, DrawerOpening> }) {
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
    return <OpeningPart key={index} opened={opened} position={[(m(item.width) - width) / 2, bottom, z]} travel={drawers?.get(front)?.travel ?? 0} delay={drawers?.get(front)?.delay ?? 0}><group name="cabinet-drawer">
      <Box size={[width, bottomThickness, depth]} position={[width / 2, -bottomThickness / 2, depth / 2]} material={materials.carcass} />
      <Box size={[metal ? m(inside - ctx.settings.metalBackDeduction) : width - 2 * t, height, t]} position={[width / 2, height / 2, t / 2]} material={materials.carcass} />
      {!metal && <>
        {[t / 2, width - t / 2].map((x) => <Box key={x} size={[t, height, depth]} position={[x, height / 2, depth / 2]} material={materials.carcass} />)}
        <Box size={[width - 2 * t, height, t]} position={[width / 2, height / 2, depth - t / 2]} material={materials.carcass} />
      </>}
    </group></OpeningPart>;
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
      <mesh position={[W * 0.3, 0.055, 0]} material={materials.ceramic}>
        <cylinderGeometry args={[0.025, 0.045, 0.11, 16]} />
      </mesh>
      <mesh position={[W * 0.66, 0.028, 0]} material={materials.pot}>
        <cylinderGeometry args={[0.038, 0.029, 0.056, 14]} />
      </mesh>
      {[-1, 0, 1].map((side) => (
        <mesh key={side} position={[W * 0.66 + side * 0.023, 0.09 + Math.abs(side) * 0.008, 0]} rotation={[0, 0, side * 0.45]} scale={[0.027, 0.052, 0.017]} material={materials.foliage}>
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
      <mesh position={[W / 2, top + 0.13, D * 0.13]} material={materials.steel}>
        <cylinderGeometry args={[0.014, 0.017, 0.26, 16]} />
      </mesh>
      <mesh position={[W / 2, top + 0.25, D * 0.13 + 0.09]} rotation={[Math.PI / 2, 0, 0]} material={materials.steel}>
        <cylinderGeometry args={[0.011, 0.011, 0.18, 12]} />
      </mesh>
    </>
  );
}

function Hob({ W, D, top, materials, detailed }: { W: number; D: number; top: number; materials: KitchenMaterials; detailed: boolean }) {
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
      {rings.map(([dx, dz, r]) => detailed ? (
        <mesh key={`${dx}${dz}`} rotation={[-Math.PI / 2, 0, 0]} position={[W / 2 + dx * width / 0.58, top + 0.0065, D / 2 + dz]} material={materials.steel}>
          <ringGeometry args={[r - 0.0025, r, 40]} />
        </mesh>
      ) : (
        <mesh key={`${dx}${dz}`} position={[W / 2 + dx * (width / 0.58), top + 0.0065, D / 2 + dz]} material={materials.dark}>
          <cylinderGeometry args={[r, r, 0.001, 32]} />
        </mesh>
      ))}
    </>
  );
}

function OvenFront({ W, H, D, gap, materials, detailed }: { W: number; H: number; D: number; gap: number; materials: KitchenMaterials; detailed: boolean }) {
  const niche = m(OVEN_NICHE_HEIGHT);
  return (
    <>
      <Box size={[W - gap, niche - gap, 0.022]} position={[W / 2, H - niche / 2, D + 0.011]} material={materials.glass} />
      <Box size={[W * 0.7, niche * 0.4, 0.004]} position={[W / 2, H - niche * 0.56, D + 0.024]} material={materials.dark} />
      {detailed
        ? <StudioPull length={W * 0.7} vertical={false} position={[W / 2, H - 0.11, D + 0.036]} material={materials.steel} />
        : <Box size={[W * 0.7, 0.014, 0.016]} position={[W / 2, H - 0.06, D + 0.04]} material={materials.steel} />}
      {detailed && <>
        <Box size={[W * 0.68, niche * 0.35, 0.002]} position={[W / 2, H - niche * 0.56, D + 0.027]} material={materials.glass} />
        <Box size={[W * 0.22, 0.033, 0.004]} position={[W / 2, H - 0.045, D + 0.024]} material={materials.dark} />
        {[0.20, 0.80].map((x) => <mesh key={x} position={[W * x, H - 0.045, D + 0.031]} rotation={[Math.PI / 2, 0, 0]} material={materials.steel}>
          <cylinderGeometry args={[0.017, 0.017, 0.018, 20]} />
        </mesh>)}
      </>}
    </>
  );
}

function Fridge({ W, H, D, materials, detailed }: { W: number; H: number; D: number; materials: KitchenMaterials; detailed: boolean }) {
  const split = H * 0.36;
  if (detailed) {
    const door = 0.04, gap = 0.006;
    return <group name="freestanding-fridge">
      <Box size={[W, H, D - door]} position={[W / 2, H / 2, (D - door) / 2]} material={materials.appliance} />
      <Box size={[W - 0.012, gap * 2, door - 0.006]} position={[W / 2, split, D - door / 2]} material={materials.dark} />
      {[[0, split], [split, H - split]].map(([base, height]) => <group key={base} position={[gap / 2, base + gap / 2, D - door]}>
        <StudioSlabFront W={W - gap} H={height - gap} thickness={door} material={materials.appliance} />
      </group>)}
      <StudioPull length={0.34} vertical position={[W - 0.06, split + 0.26, D + 0.014]} material={materials.steel} />
      <StudioPull length={0.22} vertical position={[W - 0.06, split - 0.16, D + 0.014]} material={materials.steel} />
    </group>;
  }
  return (
    <>
      <Box size={[W, H, D]} position={[W / 2, H / 2, D / 2]} material={materials.appliance} />
      <Box size={[W - 0.01, 0.006, 0.004]} position={[W / 2, split, D + 0.002]} material={materials.dark} />
      <Box size={[0.018, 0.34, 0.025]} position={[W - 0.06, split + 0.26, D + 0.02]} material={materials.steel} />
      <Box size={[0.018, 0.22, 0.025]} position={[W - 0.06, split - 0.16, D + 0.02]} material={materials.steel} />
    </>
  );
}

function SelectionBox({ size, position, invalid = false, hover = false }: { size: Vec3; position: Vec3; invalid?: boolean; hover?: boolean }) {
  const color = invalid ? '#dc2626' : ACCENT;
  return (
    <mesh position={position} raycast={() => null}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={color} transparent opacity={hover ? 0.035 : 0.07} depthWrite={false} />
      <Edges color={color} transparent opacity={hover ? 0.55 : 1} />
    </mesh>
  );
}

interface UnitProps {
  item: KitchenItem;
  ctx: BuildContext;
  materials: KitchenMaterials;
  detailed?: boolean;
  coffeeMaker?: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  invalid?: boolean;
  objectRef?: Ref<THREE.Group>;
  interior?: boolean;
  opened?: boolean;
  /** Double-click opens or closes the unit; left out for units that cannot open. */
  onToggleOpening?: (id: string) => void;
  /** Under the mouse and ready to be grabbed. */
  hovered?: boolean;
  onHover?: (id: string | null) => void;
}

/**
 * One unit in 3D. Its group sits at the unit's back-left corner on the
 * underside of the carcass; inside it, x runs along the front, y up, and z
 * from the back towards the front, matching the plan's local frame.
 */
export const Unit3D = memo(function Unit3D({ item, ctx, materials: sharedMaterials, detailed = false, coffeeMaker = false, selected, onSelect, invalid = false, objectRef, interior = false, opened = false, onToggleOpening, hovered = false, onHover }: UnitProps) {
  const size = sharedMaterials.front.userData.studioSize;
  const overrides = useMemo(() => ({
    ...(item.frontFinish ? { front: cabinetMaterial(item.frontFinish, undefined, detailed, size) } : {}),
    ...(item.carcassFinish ? { carcass: cabinetMaterial(item.carcassFinish, 0.78, detailed, size) } : {}),
  }), [item.frontFinish, item.carcassFinish, detailed, size]);
  useEffect(() => () => { overrides.front?.dispose(); overrides.carcass?.dispose(); }, [overrides]);
  const materials = { ...sharedMaterials, ...overrides };
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
  const drawers = drawerOpenings(fronts, m(slideLength(innerDepth(item, config, ctx))));
  const wallUnit = isWallMounted(item);
  const lowHandles = (front: FrontRect) => wallUnit || (item.kind === 'tall' && front.y >= BASE_HEIGHT);
  const worktop = hasWorktop(item);
  const plinth = !wallUnit && E >= 0.03 && item.kind !== 'fridge' && item.kind !== 'endPanel' && item.shelfForm !== 'floating';
  const worktopDepth = D + tf + WORKTOP_OVERHANG;
  const detailedSink = detailed && worktop && item.kind === 'sink';

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
          {detailed && H > 0.4 && <>
            <Box size={[W, 0.024, 0.006]} position={[W / 2, 0.017, D + 0.001]} material={materials.glass} />
            {[-2, -1, 0, 1, 2].map((i) => <Box key={i} size={[0.005, 0.048, 0.002]} position={[W / 2 + i * 0.015, H - 0.07, D * 0.45]} material={materials.dark} />)}
          </>}
        </>
      );
      bounds = { size: [W, H, D], position: [W / 2, H / 2, D / 2] };
      break;
    case 'fridge':
      body = <Fridge W={W} H={H} D={D} materials={materials} detailed={detailed} />;
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
          <Fronts fronts={fronts} z={D} thickness={tf} materials={materials} lowHandles={() => false} profile={ctx.style?.frontProfile} detailed={detailed} />
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
          <CornerInterior W={W} W2={W2} H={H} D={D} t={m(config.carcass.thickness)} shelves={config.shelves} materials={materials} />
          {!interior && <>
          <OpeningPart opened={opened} position={[W - gap / 2, gap / 2, D]} angle={DOOR_SWING}>
            <group position={[-a, 0, 0]}>
              <DoorSurface W={a} H={doorH} thickness={tf} material={materials.front} profile={ctx.style?.frontProfile} detailed={detailed} />
              {materials.handle && (detailed
                ? <StudioPull length={Math.min(0.16, doorH * 0.5)} vertical position={[0.035, wallUnit ? 0.13 : doorH - 0.13, tf + 0.014]} material={materials.handle} />
                : <Box size={[0.012, Math.min(0.16, doorH * 0.5), 0.012]} position={[0.035, wallUnit ? 0.13 : doorH - 0.13, tf + 0.014]} material={materials.handle} />)}
            </group>
          </OpeningPart>
          <group position={[D, gap / 2, W2 - gap / 2]} rotation={[0, Math.PI / 2, 0]}>
            <OpeningPart opened={opened} position={[0, 0, 0]} angle={-DOOR_SWING}>
              <DoorSurface W={b} H={doorH} thickness={tf} material={materials.front} profile={ctx.style?.frontProfile} detailed={detailed} />
            </OpeningPart>
          </group>
          </>}
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
          {detailed && ctx.style?.decor && worktop && coffeeMaker && <group position={[D / 2, H + WORKTOP, D / 2]} rotation={[0, Math.PI / 4, 0]}><CoffeeMaker materials={materials} /></group>}
        </>
      );
      bounds = { size: [W, H, W2], position: [W / 2, H / 2, W2 / 2] };
      return (
        <UnitGroup item={item} anchor={anchor} onSelect={onSelect} objectRef={objectRef} onToggleOpening={onToggleOpening} onHover={onHover}>
          {body}
          {(selected || invalid || hovered) && <SelectionBox {...bounds} invalid={invalid} hover={hovered && !selected && !invalid} />}
        </UnitGroup>
      );
    }
    default: {
      const t = m(config.carcass.thickness);
      if (item.kind === 'shelf' && item.shelfForm === 'floating') {
        const step = (H - t) / (config.shelves + 1);
        body = Array.from({ length: config.shelves + 2 }, (_, i) => <group key={i} name="floating-board" position={[0, i * step, 0]}>
          <Box size={[W, t, D]} position={[W / 2, t / 2, D / 2]} material={materials.carcass} />
          {ctx.style?.decor && <group position={[0, t, 0]}><ShelfStillLife width={W} depth={D} clearance={step - t} materials={materials} plant={i % 2 === 1} /></group>}
        </group>);
        break;
      }
      const glass = item.kind === 'glassWall';
      const open = fronts.length === 0 || item.kind === 'shelf' || glass || item.kind === 'ovenTower';
      // Inset fronts sit inside the carcass, so it is drawn from its panels with the fronts set in.
      const inset = config.doorType === 'inset' && fronts.length > 0;
      body = (
        <>
          {open || inset || interior || KIND_OPTIONS[item.kind].carcass ? (
            <group name={interior ? 'cabinet-interior' : ''}>
              <OpenCarcass
                W={W}
                H={H}
                D={D}
                t={m(config.carcass.thickness)}
                tb={m(config.back.thickness)}
                shelves={config.shelves}
                shelfTop={Math.min(H - m(config.carcass.thickness), ...fronts.filter((front) => front.kind === 'drawer').map((front) => m(front.y)))}
                setback={m(settings.shelfSetback)}
                materials={materials}
                back={KIND_OPTIONS[item.kind].back}
                top={!detailedSink}
              />
              <DrawerInteriors item={item} ctx={ctx} materials={materials} fronts={fronts} opened={opened && !interior} drawers={drawers} />
            </group>
          ) : (
            <>
              <Box size={[W, H, D]} position={[W / 2, H / 2, D / 2]} material={materials.carcass} />
              {ctx.style?.handles === 'none' && fronts.length > 0 && <Box size={[W, H, 0.001]} position={[W / 2, H / 2, D + 0.0005]} material={materials.glass} />}
            </>
          )}
          <group name="cabinet-fronts">
            <Fronts fronts={interior ? fronts.filter((front) => front.kind === 'panel') : fronts} z={inset ? D - tf : D} thickness={tf} materials={materials} lowHandles={lowHandles} glass={glass} profile={ctx.style?.frontProfile} detailed={detailed} opened={opened} drawers={drawers} />
          </group>
          {item.kind === 'oven' && <OvenFront W={W} H={H} D={D} gap={gap} materials={materials} detailed={detailed} />}
          {item.kind === 'ovenTower' && (
            <>
              {[TOWER_OVEN_BOTTOM, TOWER_OVEN_BOTTOM + OVEN_NICHE_HEIGHT + config.carcass.thickness].map((height) => (
                <Box key={height} size={[W - 2 * m(config.carcass.thickness), m(config.carcass.thickness), D]} position={[W / 2, m(height - config.carcass.thickness / 2), D / 2]} material={materials.carcass} />
              ))}
              <OvenFront W={W} H={m(TOWER_OVEN_BOTTOM + OVEN_NICHE_HEIGHT)} D={D} gap={gap} materials={materials} detailed={detailed} />
            </>
          )}
          {detailed && ctx.style?.decor && item.kind === 'shelf' && <group position={[0, t, 0]}>
            <ShelfStillLife width={W} depth={D} clearance={(H - 2 * t) / (config.shelves + 1)} materials={materials} />
          </group>}
          {ctx.style?.decor && (item.kind === 'shelf' || glass) && config.shelves > 0 && (
            <ShelfDecor W={W} H={H} D={D} t={m(config.carcass.thickness)} shelves={config.shelves} materials={materials} />
          )}
        </>
      );
    }
  }

  return (
    <UnitGroup item={item} anchor={anchor} onSelect={onSelect} objectRef={objectRef} onToggleOpening={onToggleOpening} onHover={onHover}>
      {body}
      {worktop && !detailedSink && <Worktop W={W} D={worktopDepth} H={H} materials={materials} />}
      {worktop && item.kind === 'sink' && (detailedSink
        ? <StudioSink W={W} D={worktopDepth} top={H + WORKTOP} thickness={WORKTOP} materials={materials} />
        : <Sink W={W} D={worktopDepth} top={H + WORKTOP} materials={materials} />)}
      {worktop && (item.kind === 'oven' || item.kind === 'hob') && <Hob W={W} D={worktopDepth} top={H + WORKTOP} materials={materials} detailed={detailed} />}
      {plinth && <Box size={[W, E, 0.016]} position={[W / 2, -E / 2, D - PLINTH_SETBACK]} material={materials.front} />}
      {detailed && plinth && <Box size={[W - 0.012, E, D - PLINTH_SETBACK]} position={[W / 2, -E / 2, (D - PLINTH_SETBACK) / 2]} material={materials.front} />}
      {item.kind === 'integratedFridge' && E > 0.04 && <Box size={[W * 0.82, Math.min(E * 0.6, 0.055), 0.008]} position={[W / 2, -E / 2, D - PLINTH_SETBACK + 0.012]} material={materials.dark} />}
      {(selected || invalid || hovered) && <SelectionBox {...bounds} invalid={invalid} hover={hovered && !selected && !invalid} />}
    </UnitGroup>
  );
});

function UnitGroup({ item, anchor, onSelect, children, objectRef, onToggleOpening, onHover }: {
  item: KitchenItem;
  anchor: { x: number; y: number };
  onSelect: (id: string) => void;
  children: ReactNode;
  objectRef?: Ref<THREE.Group>;
  onToggleOpening?: (id: string) => void;
  onHover?: (id: string | null) => void;
}) {
  return (
    <group
      ref={objectRef}
      name={item.id}
      position={[m(anchor.x), m(item.elevation), m(anchor.y)]}
      rotation={[0, (-item.rotation * Math.PI) / 180, 0]}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (event.delta <= 2) onToggleOpening?.(item.id);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta <= 2) onSelect(item.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
        // A finger has no hover: the outline would only flash on every tap.
        if (e.nativeEvent.pointerType === 'mouse') onHover?.(item.id);
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
        onHover?.(null);
      }}
    >
      {children}
    </group>
  );
}
