import { useMemo } from 'react';
import { CubicBezierCurve3, Path, Shape, Vector3, type Material } from 'three';
import type { KitchenMaterials } from './materials';

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

/** A slim profiled edge separates the inset and frame without drawing fake shadow lines. */
export function StudioFront({ W, H, thickness, material }: { W: number; H: number; thickness: number; material: Material }) {
  const bevel = Math.min(0.0045, thickness / 5, W / 28, H / 28);
  const rail = Math.min(0.032, W / 5, H / 5);
  const rim = useMemo(() => {
    const shape = rounded(new Shape(), W - 2 * bevel, H - 2 * bevel, bevel);
    shape.holes.push(rounded(new Path(), W - 2 * rail, H - 2 * rail, bevel));
    return shape;
  }, [W, H, bevel, rail]);
  const panel = thickness - 2 * bevel;
  return <group position={[W / 2, H / 2, 0]}>
    <mesh position={[0, 0, panel / 2]} material={material}><boxGeometry args={[W, H, panel]} /></mesh>
    <mesh position={[0, 0, panel]} material={material}>
      <extrudeGeometry args={[rim, { depth: bevel, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 2 }]} />
    </mesh>
  </group>;
}

/** One pierced slab and an inset bowl; no opaque worktop or cabinet lid behind the drain. */
export function StudioSink({ W, D, top, thickness, materials }: { W: number; D: number; top: number; thickness: number; materials: KitchenMaterials }) {
  const w = Math.min(0.57, W * 0.72), d = Math.min(0.39, D * 0.61), drop = 0.145;
  const { slab, lip, bottom, positions, indices } = useMemo(() => {
    const slab = new Shape();
    slab.moveTo(-W / 2, -D / 2); slab.lineTo(W / 2, -D / 2); slab.lineTo(W / 2, D / 2); slab.lineTo(-W / 2, D / 2); slab.closePath();
    slab.holes.push(rounded(new Path(), w, d, 0.028));
    const lip = rounded(new Shape(), w + 0.025, d + 0.025, 0.037);
    lip.holes.push(rounded(new Path(), w, d, 0.028));
    const upper = rounded(new Shape(), w, d, 0.028).getPoints(5);
    const bottom = rounded(new Shape(), w - 0.052, d - 0.052, 0.035);
    const positions = new Float32Array([...upper.flatMap((p) => [p.x, 0.004, -p.y]),
      ...bottom.getPoints(5).flatMap((p) => [p.x, -drop, -p.y])]);
    const indices = [];
    for (let i = 0, n = upper.length; i < n - 1; i++) indices.push(i, i + 1, n + i + 1, i, n + i + 1, n + i);
    return { slab, lip, bottom, positions, indices: new Uint16Array(indices) };
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
        <bufferAttribute attach="index" args={[indices, 1]} />
      </bufferGeometry>
    </mesh>
    <mesh rotation={[flat, 0, 0]} position={[0, -drop, 0]} material={materials.basin}><shapeGeometry args={[bottom, 5]} /></mesh>
    <mesh rotation={[flat, 0, 0]} position={[0, -drop + 0.001, -d * 0.18]} material={materials.steel}><ringGeometry args={[0.013, 0.024, 24]} /></mesh>
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
  return <group name="countertop-coffee-maker">
    <mesh position={[0, 0.14, -0.045]} material={materials.steel}><boxGeometry args={[0.18, 0.28, 0.12]} /></mesh>
    <mesh position={[0, 0.24, 0.032]} material={materials.dark}><boxGeometry args={[0.18, 0.085, 0.15]} /></mesh>
    <mesh position={[0, 0.015, 0]} material={materials.dark}><boxGeometry args={[0.18, 0.03, 0.22]} /></mesh>
    <mesh position={[0, 0.065, 0.056]} material={materials.ceramic}><cylinderGeometry args={[0.031, 0.024, 0.068, 16]} /></mesh>
  </group>;
}
