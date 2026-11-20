import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { kitchenCameraPose, STUDIO_BACKDROP, STUDIO_FOV } from '../../domain/camera';
import type { Design } from '../../domain/types';
import { FinishedKitchen } from '../three/FinishedKitchen';
import { canShowModel } from '../three/ModelPreviewFallback';

function IdeaCamera({ design }: { design: Design }) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useLayoutEffect(() => {
    const pose = kitchenCameraPose(design.room, design.items, size.width / Math.max(1, size.height), 'studio');
    camera.position.fromArray(pose.position);
    controls.current?.target.fromArray(pose.target);
    controls.current?.update();
    invalidate();
  }, [design, camera, invalidate, size.width, size.height]);
  return <OrbitControls ref={controls} makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2 - 0.04} />;
}

export default function IdeaModel({ design, fallback }: { design: Design; fallback: ReactNode }) {
  if (!canShowModel()) return fallback;
  return <div className="h-64 overflow-hidden rounded-xl" data-testid="idea-model">
    <Canvas flat frameloop="demand" dpr={[1, 2]} camera={{ fov: STUDIO_FOV, near: 0.05, far: 200 }}>
      <color attach="background" args={[STUDIO_BACKDROP]} />
      <ambientLight intensity={Math.PI} />
      <IdeaCamera design={design} />
      <FinishedKitchen design={design} />
    </Canvas>
  </div>;
}
