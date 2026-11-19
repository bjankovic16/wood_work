import { createPortal, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { AmbientLight, Color, PerspectiveCamera, Scene } from 'three';
import { CAMERA_FOV, kitchenCameraPose, STUDIO_BACKDROP, STUDIO_FOV } from '../../domain/camera';
import type { Design } from '../../domain/types';
import { buildContext } from '../../engine/config';
import { blobDataUrl, customerHtml } from '../../export/customerHtml';
import type { Messages } from '../../i18n';
import { safeFileName } from '../../lib/platform';
import { Room3D } from './Room3D';
import { Unit3D } from './Unit3D';
import { createMaterials, disposeMaterials } from './materials';

const noop = () => {};

/** Mount the same closed, unselected furniture in a private scene, not a second WebGL context. */
export default function CustomerExport({ design, studio, t, ready, failed }: {
  design: Design; studio: boolean; t: Messages; ready: (filename: string, blob: Blob) => void; failed: () => void;
}) {
  const [model] = useState(() => new Scene());
  const ctx = useMemo(() => buildContext(design), [design]);
  const materials = useMemo(() => createMaterials(design.style, studio), [design.style, studio]);
  const gl = useThree((s) => s.gl);
  const editor = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  useEffect(() => {
    let active = true;
    const run = async () => {
      const [{ GLTFExporter }, { default: viewer }] = await Promise.all([
        import('three/addons/exporters/GLTFExporter.js'), import('virtual:kitchen-offline-viewer'),
      ]);
      if (!active) return;
      const { width, height } = gl.domElement;
      const aspect = width / Math.max(1, height);
      const pose = kitchenCameraPose(design.room, design.items, aspect, studio ? 'studio' : 'perspective');
      const preview = new PerspectiveCamera(studio ? STUDIO_FOV : CAMERA_FOV, aspect, .03, 200);
      preview.position.fromArray(pose.position);
      preview.lookAt(...pose.target);
      const light = new AmbientLight(0xffffff, Math.PI);
      model.add(light);
      model.background = new Color(studio ? STUDIO_BACKDROP : '#ebe8e3');
      let poster: string;
      try {
        model.traverse((node) => {
          if (!Array.isArray(node.userData.cutaway)) return;
          const [x, z, nx, nz] = node.userData.cutaway;
          node.visible = (preview.position.x - x) * nx + (preview.position.z - z) * nz >= 0;
        });
        gl.render(model, preview);
        poster = gl.domElement.toDataURL('image/jpeg', 0.8);
      } finally {
        model.remove(light);
        model.traverse((node) => { if (node.userData.cutaway) node.visible = true; });
        gl.render(editor, camera);
      }
      const glb = await new GLTFExporter().parseAsync(model, { binary: true, maxTextureSize: 1024 });
      if (!(glb instanceof ArrayBuffer)) throw new Error('Expected binary glTF.');
      const data = await blobDataUrl(new Blob([glb], { type: 'model/gltf-binary' }));
      if (!active) return;
      const html = customerHtml(design.name, data.slice(data.indexOf(',') + 1), poster, { ...pose, studio, aspect }, viewer, t);
      const filename = `${safeFileName(design.name)}.html`;
      ready(filename, html);
    };
    // Let Fiber commit all portal children before taking the snapshot.
    const frame = requestAnimationFrame(() => { void run().catch((error: unknown) => {
      if (!active) return;
      console.error('Could not export the customer view', error);
      failed();
    }); });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [model, gl, editor, camera, design, studio, t, ready, failed]);
  return createPortal(<>
    <Room3D room={design.room} openings={design.openings} items={design.items} materials={materials} studio={studio} exportModel />
    {design.items.map((item) => <Unit3D key={item.id} item={item} ctx={ctx} materials={materials} studio={studio} selected={false} onSelect={noop} />)}
  </>, model);
}
