import { Bounds, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, type ReactNode } from 'react';
import { itemFromPreset, type LibraryPreset } from '../../domain/catalog';
import { useDesignStore } from '../../store/designStore';
import { useBuildContext } from '../../store/derived';
import { createMaterials, disposeMaterials } from '../three/materials';
import { Unit3D } from '../three/Unit3D';

const noop = () => {};
let supported: boolean | undefined;
function canShowModel() {
  if (supported === undefined) {
    const gl = document.createElement('canvas').getContext('webgl2');
    supported = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return supported;
}

/** A temporary catalogue item, never inserted into the editor scene or its history. */
export default function ElementModel({ preset, fallback }: { preset: LibraryPreset; fallback: ReactNode }) {
  const room = useDesignStore((s) => s.design.room);
  const style = useDesignStore((s) => s.design.style);
  const ctx = useBuildContext();
  const item = useMemo(() => itemFromPreset(preset, [], undefined, room), [preset, room]);
  const materials = useMemo(() => createMaterials(style, true, room), [style, room]);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  if (!canShowModel()) return fallback;
  return <Canvas flat orthographic frameloop="demand" dpr={[1, 2]} camera={{ position: [5, 5, 9] }}>
    <color attach="background" args={['#f5f2eb']} />
    <ambientLight intensity={Math.PI} />
    <OrbitControls makeDefault enablePan={false} enableDamping={false} />
    <Bounds fit clip observe margin={1.13} maxDuration={0.001}>
      <Unit3D item={item} ctx={ctx} materials={materials} detailed selected={false} onSelect={noop} />
    </Bounds>
  </Canvas>;
}
