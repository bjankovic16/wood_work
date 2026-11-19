import { useEffect, useMemo } from 'react';
import { extend } from '@react-three/fiber';
import { BufferGeometry, CubicBezierCurve3, CurvePath, Float32BufferAttribute, LineCurve3, Path, QuadraticBezierCurve3, Shape, Vector2, Vector3, type Material, type MeshStandardMaterial } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { KitchenMaterials } from './materials';
import { studioFinish } from './studioFinish';

function rounded<T extends Path>(path: T, w: number, d: number, r: number): T {
  const x = w / 2, y = d / 2;
  path.moveTo(-x + r, -y); path.lineTo(x - r, -y); path.quadraticCurveTo(x, -y, x, -y + r);
  path.lineTo(x, y - r); path.quadraticCurveTo(x, y, x - r, y);
  path.lineTo(-x + r, y); path.quadraticCurveTo(-x, y, -x, y - r);
  path.lineTo(-x, -y + r); path.quadraticCurveTo(-x, -y, -x + r, -y);
  return path;
}

const spout = new CubicBezierCurve3(new Vector3(0, 0.06, 0), new Vector3(0, 0.46, 0),
  new Vector3(0, 0.45, 0.18), new Vector3(0, 0.215, 0.18));
const flat = -Math.PI / 2;
const EasedBox = extend(RoundedBoxGeometry);

/** Grain follows the board, not the camera or the unit square of a stretched box. */
export function boardGrainUV(g: BufferGeometry, horizontal: boolean) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const end = Math.abs(n.getX(i)) > 0.7, top = Math.abs(n.getY(i)) > 0.7;
    const across = horizontal ? (top ? p.getZ(i) : p.getY(i)) : (end ? p.getZ(i) : p.getX(i));
    const along = horizontal ? (end ? p.getZ(i) : p.getX(i)) : (top ? p.getZ(i) : p.getY(i));
    uv.setXY(i, 0.5 + across / 0.42, 0.5 + along / 1.35);
  }
  uv.needsUpdate = true;
}

export type RecessFace = 'left' | 'right' | 'up' | 'down' | 'back' | 'shelf';
export function useRecessMaterial(source: MeshStandardMaterial) {
  const lining = useMemo(() => {
    if (!source.userData.studioFinish) return null;
    const material = source.clone();
    material.vertexColors = true;
    studioFinish(material);
    return material;
  }, [source]);
  useEffect(() => () => lining?.dispose(), [lining]);
  return lining;
}

export function boardRecess(g: BufferGeometry, face: RecessFace, z: number, depth: number) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const colors = g.getAttribute('color') ?? new Float32BufferAttribute(new Float32Array(p.count * 3), 3);
  for (let i = 0; i < p.count; i++) {
    const inward = face === 'left' ? -n.getX(i) : face === 'right' ? n.getX(i) : face === 'back' ? n.getZ(i)
      : face === 'up' ? n.getY(i) : face === 'down' ? -n.getY(i) : Math.abs(n.getY(i));
    const reach = Math.min(1, Math.max(0, (z + p.getZ(i)) / depth));
    const shade = 1 - 0.63 * Math.max(0, inward) * (1 - reach);
    colors.setXYZ(i, shade, shade, shade);
  }
  g.setAttribute('color', colors);
  colors.needsUpdate = true;
}

export function StudioSlabFront({ W, H, thickness, material }: { W: number; H: number; thickness: number; material: Material }) {
  return <mesh position={[W / 2, H / 2, thickness / 2]} material={material}>
    <EasedBox key={material.userData.woodGrain ? 'wood' : 'solid'} args={[W, H, thickness, 1, 0.0025]} onUpdate={material.userData.woodGrain ? (g) => boardGrainUV(g, false) : undefined} />
  </mesh>;
}

/** One swept bar with returned feet touching the door, rather than a floating rectangle. */
export function StudioPull({ length, vertical, position, material }: {
  length: number; vertical: boolean; position: [number, number, number]; material: Material;
}) {
  const path = useMemo(() => {
    const curve = new CurvePath<Vector3>(), x = length / 2, bend = Math.min(0.012, x / 2);
    const p = (a: number, z: number) => new Vector3(a, 0, z);
    curve.add(new LineCurve3(p(-x, -0.017), p(-x, 0)));
    curve.add(new QuadraticBezierCurve3(p(-x, 0), p(-x, bend), p(-x + bend, bend)));
    curve.add(new LineCurve3(p(-x + bend, bend), p(x - bend, bend)));
    curve.add(new QuadraticBezierCurve3(p(x - bend, bend), p(x, bend), p(x, 0)));
    curve.add(new LineCurve3(p(x, 0), p(x, -0.017)));
    return curve;
  }, [length]);
  return <mesh name="cabinet-pull" position={position} rotation={[0, 0, vertical ? Math.PI / 2 : 0]} material={material}>
    <tubeGeometry args={[path, 24, 0.006, 8, false]} />
  </mesh>;
}

/** One continuous profile: outside arris, rail, bevel and recessed field. No overlapping front faces. */
export function StudioFront({ W, H, thickness, material }: { W: number; H: number; thickness: number; material: MeshStandardMaterial }) {
  const finish = useRecessMaterial(material);
  const geometry = useMemo(() => {
    const bevel = Math.min(0.003, thickness / 5, W / 36, H / 36), rail = Math.min(0.032, W / 5, H / 5);
    const field = thickness - 2.4 * bevel;
    const profile = [[bevel, 0, 1], [0, bevel, 1], [0, thickness - bevel, 1], [bevel, thickness, 1],
      [rail - bevel, thickness, 1], [rail, thickness - bevel, 0.88], [rail + bevel, field, 0.65],
      [rail + 3 * bevel, field, 1]];
    const positions: number[] = [], colors: number[] = [], uv: number[] = [];
    const corner = (ring: number, i: number) => {
      const [inset, z, tint] = profile[ring], x = i === 1 || i === 2 ? W - inset : inset, y = i >= 2 ? H - inset : inset;
      positions.push(x, y, z); colors.push(tint, tint, tint); uv.push(x / 0.42, y / 1.35);
    };
    for (let ring = 1; ring < profile.length; ring++) for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      corner(ring - 1, i); corner(ring - 1, j); corner(ring, j);
      corner(ring - 1, i); corner(ring, j); corner(ring, i);
    }
    for (const i of [0, 1, 2, 0, 2, 3]) corner(profile.length - 1, i);
    for (const i of [0, 2, 1, 0, 3, 2]) corner(0, i);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }, [W, H, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={finish ?? material} />;
}

/** One pierced slab and an inset bowl; no opaque worktop or cabinet lid behind the drain. */
export function StudioSink({ W, D, top, thickness, materials }: { W: number; D: number; top: number; thickness: number; materials: KitchenMaterials }) {
  const w = Math.min(0.57, W * 0.72), d = Math.min(0.39, D * 0.61), drop = 0.145;
  const { slab, lip, bottom, positions, indices, colors, uv } = useMemo(() => {
    const slab = new Shape();
    slab.moveTo(-W / 2, -D / 2); slab.lineTo(W / 2, -D / 2); slab.lineTo(W / 2, D / 2); slab.lineTo(-W / 2, D / 2); slab.closePath();
    slab.holes.push(rounded(new Path(), w, d, 0.028));
    const lip = rounded(new Shape(), w + 0.025, d + 0.025, 0.037);
    lip.holes.push(rounded(new Path(), w, d, 0.028));
    const upper = rounded(new Shape(), w, d, 0.028).getPoints(5);
    const bottom = rounded(new Shape(), w - 0.052, d - 0.052, 0.035);
    bottom.holes.push(new Path().absarc(0, d * 0.18, 0.014, 0, Math.PI * 2, true));
    const positions = new Float32Array([...upper.flatMap((p) => [p.x, 0.004, -p.y]),
      ...bottom.getPoints(5).flatMap((p) => [p.x, -drop, -p.y])]);
    const colors = new Float32Array(positions.length).fill(1);
    colors.fill(0.27, upper.length * 3);
    const uv = new Float32Array(upper.length * 4);
    for (let i = 0; i < 2 * upper.length; i++) uv.set([(i % upper.length) / (upper.length - 1), i < upper.length ? 1 : 0], i * 2);
    const indices = [];
    for (let i = 0, n = upper.length; i < n - 1; i++) indices.push(i, i + 1, n + i + 1, i, n + i + 1, n + i);
    return { slab, lip, bottom, positions, indices: new Uint16Array(indices), colors, uv };
  }, [W, D, w, d]);
  return <group name="studio-sink" position={[W / 2, top, D / 2]}>
    <mesh rotation={[flat, 0, 0]} position={[0, -thickness, 0]} material={materials.worktop}>
      <extrudeGeometry args={[slab, { depth: thickness, bevelEnabled: false, curveSegments: 5 }]} />
    </mesh>
    <mesh rotation={[flat, 0, 0]} position={[0, 0.001, 0]} material={materials.steel}>
      <extrudeGeometry args={[lip, { depth: 0.003, bevelEnabled: false, curveSegments: 5 }]} />
    </mesh>
    <mesh material={materials.basin}>
      <bufferGeometry onUpdate={(g) => g.computeVertexNormals()}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-uv" args={[uv, 2]} />
        <bufferAttribute attach="index" args={[indices, 1]} />
      </bufferGeometry>
    </mesh>
    <mesh rotation={[flat, 0, 0]} position={[0, -drop, 0]} material={materials.basin}>
      <shapeGeometry args={[bottom, 5]} onUpdate={(g) => g.setAttribute('color', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(0.38), 3))} />
    </mesh>
    <mesh rotation={[flat, 0, 0]} position={[0, -drop + 0.001, -d * 0.18]} material={materials.steel}><ringGeometry args={[0.013, 0.024, 24]} /></mesh>
    <mesh rotation={[flat, 0, 0]} position={[0, -drop - 0.004, -d * 0.18]} material={materials.dark}><circleGeometry args={[0.016, 24]} /></mesh>
    <group name="arched-mixer" position={[0, 0, -(d + D) / 4]}>
      <mesh position={[0, 0.043, 0]} material={materials.steel}><cylinderGeometry args={[0.018, 0.021, 0.086, 20]} /></mesh>
      <mesh material={materials.steel}><tubeGeometry args={[spout, 22, 0.011, 10, false]} /></mesh>
      <mesh position={[0.032, 0.09, 0]} rotation={[0, 0, -0.46]} material={materials.steel}><cylinderGeometry args={[0.005, 0.008, 0.075, 10]} /></mesh>
    </group>
  </group>;
}

export function ShelfStillLife({ width, depth, clearance, materials, plant = false }: {
  width: number; depth: number; clearance: number; materials: KitchenMaterials; plant?: boolean;
}) {
  const scale = Math.min(1, clearance / 0.23, width / 0.55, depth / 0.19);
  if (scale <= 0) return null;
  return <group name="shelf-accessories" position={[width / 2, 0, depth / 2]} scale={scale}>
    {Array.from({ length: 4 }, (_, i) => <mesh key={i} position={[-0.13, 0.009 + i * 0.011, 0.002]} material={materials.ceramic}>
      <cylinderGeometry args={[0.086, 0.059, 0.014, 24]} />
    </mesh>)}
    {plant ? <group position={[0.12, 0, 0]}>
      <mesh position={[0, 0.039, 0]} material={materials.pot}><cylinderGeometry args={[0.047, 0.035, 0.078, 20]} /></mesh>
      {Array.from({ length: 9 }, (_, i) => <group key={i} rotation={[0, i * 2.4, 0]}>
        <mesh position={[0.018, 0.123 + i % 3 * 0.012, 0]} rotation={[0, 0, -0.35 - i % 2 * 0.3]} scale={[0.017, 0.061, 0.009]} material={materials.foliage}>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      </group>)}
    </group> : [0.07, 0.174].map((x, i) => <group key={x} position={[x, 0, -0.02]}>
      <mesh position={[0, 0.06 + i * 0.015, 0]} material={materials.ceramic}><cylinderGeometry args={[0.039, 0.041, 0.12 + i * 0.03, 20]} /></mesh>
      <mesh position={[0, 0.125 + i * 0.03, 0]} material={materials.pot}><cylinderGeometry args={[0.041, 0.041, 0.012, 20]} /></mesh>
    </group>)}
  </group>;
}

export function CoffeeMaker({ materials }: { materials: KitchenMaterials }) {
  const cup = useMemo(() => [[0, 0], [0.026, 0], [0.035, 0.067], [0.032, 0.067], [0.024, 0.007], [0, 0.007]].map(([x, y]) => new Vector2(x, y)), []);
  return <group name="countertop-coffee-maker">
    <mesh position={[0, 0.14, -0.045]} material={materials.steel}><EasedBox args={[0.19, 0.28, 0.13, 2, 0.015]} /></mesh>
    <mesh position={[0, 0.226, 0.022]} material={materials.steel}><EasedBox args={[0.19, 0.106, 0.18, 2, 0.016]} /></mesh>
    <mesh position={[0, 0.23, 0.111]} material={materials.glass}><EasedBox args={[0.162, 0.048, 0.006, 1, 0.003]} /></mesh>
    <mesh position={[0.053, 0.23, 0.118]} rotation={[Math.PI / 2, 0, 0]} material={materials.steel}><cylinderGeometry args={[0.013, 0.014, 0.01, 16]} /></mesh>
    <mesh position={[0, 0.163, 0.07]} material={materials.steel}><cylinderGeometry args={[0.025, 0.018, 0.025, 16]} /></mesh>
    <mesh position={[0, 0.014, 0.006]} material={materials.dark}><EasedBox args={[0.19, 0.028, 0.235, 1, 0.009]} /></mesh>
    <mesh position={[0, 0.029, 0.067]} material={materials.ceramic}><latheGeometry args={[cup, 20]} /></mesh>
    <mesh position={[0.034, 0.065, 0.067]} material={materials.ceramic}><torusGeometry args={[0.017, 0.0035, 6, 16]} /></mesh>
  </group>;
}
