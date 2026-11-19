import { AmbientLight, Color, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Object3D } from 'three';
import { CAMERA_FOV, STUDIO_FOV, STUDIO_BACKDROP } from '../domain/camera';
import { studioFinish } from '../components/three/studioFinish';
import type { CustomerCamera } from './customerHtml';

async function show() {
  const container = document.querySelector('main')!;
  const poster = document.getElementById('poster')!;
  const reset = document.querySelector<HTMLButtonElement>('#reset')!;
  const pose: CustomerCamera = JSON.parse(document.getElementById('pose')!.textContent!);
  const bytes = Uint8Array.from(atob(document.getElementById('model')!.textContent!), (c) => c.charCodeAt(0));
  const renderer = new WebGLRenderer({ antialias: true });
  const model = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const scene = new Scene();
  scene.background = new Color(pose.studio ? STUDIO_BACKDROP : '#ebe8e3');
  scene.add(model.scene, new AmbientLight(0xffffff, Math.PI));
  const camera = new PerspectiveCamera(pose.studio ? STUDIO_FOV : CAMERA_FOV, 1, 0.03, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 0.25;
  controls.maxDistance = pose.studio ? 180 : 65;
  const exterior: Object3D[] = [];
  model.scene.traverse((node) => {
    if (Array.isArray(node.userData.cutaway)) exterior.push(node);
    if (node instanceof Mesh) for (const mat of [node.material].flat()) {
      if (mat instanceof MeshStandardMaterial && mat.userData.studioFinish) studioFinish(mat);
    }
  });
  const render = () => {
    for (const node of exterior) {
      const [x, z, nx, nz] = node.userData.cutaway;
      node.visible = (camera.position.x - x) * nx + (camera.position.z - z) * nz >= 0;
    }
    renderer.render(scene, camera);
  };
  const resize = () => {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    render();
  };
  const home = () => {
    controls.target.fromArray(pose.target);
    camera.position.fromArray(pose.position).sub(controls.target).multiplyScalar(Math.max(1, pose.aspect / camera.aspect)).add(controls.target);
    controls.update();
    render();
  };
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  container.append(renderer.domElement);
  resize();
  home();
  poster.hidden = true;
  reset.disabled = false;
  controls.addEventListener('change', render);
  window.addEventListener('resize', resize);
  reset.addEventListener('click', home);
}

void show().catch((error: unknown) => {
  console.error('Interactive kitchen preview unavailable', error);
  document.querySelector('canvas')?.remove();
  document.getElementById('poster')!.hidden = false;
  document.getElementById('hint')!.hidden = true;
  document.getElementById('failure')!.hidden = false;
});
