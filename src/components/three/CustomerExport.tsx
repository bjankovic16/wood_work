import { createPortal, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { AmbientLight, Color, PerspectiveCamera, Scene } from 'three';
import { kitchenCameraPose } from '../../domain/camera';
import type { Design } from '../../domain/types';
import { buildContext } from '../../engine/config';
import { blobDataUrl, customerHtml } from '../../export/customerHtml';
import type { Messages } from '../../i18n';
import { safeFileName, saveFile } from '../../lib/platform';
import { Room3D } from './Room3D';
import { Unit3D } from './Unit3D';
import { createMaterials, disposeMaterials } from './materials';

const noop = () => {};

/** Mount the same closed, unselected furniture in a private scene, not a second WebGL context. */
export default function CustomerExport({ design, t, finish }: { design: Design; t: Messages; finish: (message: string) => void }) {
  const [model] = useState(() => new Scene());
  const ctx = useMemo(() => buildContext(design), [design]);
  const materials = useMemo(() => createMaterials(design.style), [design.style]);
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
      const pose = kitchenCameraPose(design.room, design.items, 1);
      const { width, height } = gl.domElement;
      const preview = new PerspectiveCamera(45, width / Math.max(1, height), .03, 200);
      preview.position.fromArray(pose.position);
      preview.lookAt(...pose.target);
      const light = new AmbientLight(0xffffff, Math.PI);
      model.add(light);
      model.background = new Color('#ebe8e3');
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
      const html = customerHtml(design.name, data.slice(data.indexOf(',') + 1), poster, pose, viewer, t);
      const filename = `${safeFileName(design.name)}.html`;
      const outcome = await saveFile(filename, html, 'text/html');
      if (active) finish(outcome === 'saved' ? t.files.saved(filename) : t.files[outcome]);
    };
    // Let Fiber commit all portal children before taking the snapshot.
    const frame = requestAnimationFrame(() => { void run().catch((error: unknown) => {
      if (!active) return;
      console.error('Could not export the customer view', error);
      finish(t.customerView.failed);
    }); });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [model, gl, editor, camera, design, t, finish]);
  return createPortal(<>
    <Room3D room={design.room} openings={design.openings} items={design.items} materials={materials} exportModel />
    {design.items.map((item) => <Unit3D key={item.id} item={item} ctx={ctx} materials={materials} selected={false} onSelect={noop} />)}
  </>, model);
}
