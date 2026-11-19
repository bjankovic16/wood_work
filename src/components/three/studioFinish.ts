import type { MeshStandardMaterial } from 'three';
import type { Room } from '../../domain/types';

type StudioSize = [number, number, number];
export const studioSize = (room: Room): StudioSize => [room.width / 1000, room.height / 1000, room.depth / 1000];

/** A neutral studio swatch, fixed in room space. No light, shadow pass or scene reflection. */
export function studioFinish(material: MeshStandardMaterial, size?: StudioSize): void {
  material.userData.studioFinish = true;
  if (size) material.userData.studioSize = size;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.studioSize = { value: material.userData.studioSize ?? [4, 2.6, 3] };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 studioPoint;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        studioPoint = (modelMatrix * vec4(transformed, 1.0)).xyz;
        ${material.userData.stoneSlab ? `#ifdef USE_MAP
          vec3 n = abs(inverseTransformDirection(normalize(transformedNormal), viewMatrix));
          vMapUv = (n.y > 0.7 ? studioPoint.xz : (n.x > n.z ? studioPoint.zy : studioPoint.xy)) / 1.35;
        #endif` : ''}
      `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 studioPoint;\nuniform vec3 studioSize;')
      .replace('#include <opaque_fragment>', `
      vec3 n = inverseTransformDirection(normal, viewMatrix);
      vec3 r = inverseTransformDirection(reflect(-normalize(vViewPosition), normal), viewMatrix);
      vec3 p = clamp(studioPoint / studioSize - 0.5, -0.55, 0.55);
      float height = smoothstep(-0.58, 0.48, p.y);
      float diffuseResponse = (0.76 + 0.40 * n.y - 0.29 * n.x + 0.24 * n.z) * mix(0.70, 1.21, height);
      // Sample the neutral swatch at a finite distance: a long slab should not be one flat highlight.
      vec3 ray = r / studioSize;
      vec3 hit = (vec3(0.95) - sign(ray) * p) / max(abs(ray), vec3(0.0001));
      r = normalize(p + min(min(hit.x, hit.y), hit.z) * ray);
      // Wide and narrow neutral bands read as a soft sheen on lacquer, crisp lines on steel.
      float blur = roughnessFactor * roughnessFactor;
      float broad = smoothstep(0.48 - blur * 0.4, 0.96, dot(r, vec3(-0.71, 0.36, -0.60)));
      float strip = 1.0 - smoothstep(0.025 + blur * 0.07, 0.14 + 0.24 * blur, abs(dot(r, vec3(0.87, 0.10, -0.48)) + 0.17));
      float swatch = 0.045 + 0.1 * smoothstep(-0.35, 0.7, r.y) + 1.55 * broad + 0.95 * strip;
      float grazing = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 4.0);
      vec3 sheen = mix(vec3(0.036 + 0.44 * grazing), diffuseColor.rgb, metalnessFactor);
      #ifdef USE_AOMAP
        swatch *= ambientOcclusion;
      #endif
      outgoingLight = outgoingLight * diffuseResponse + sheen * swatch * (1.0 - roughnessFactor) * (1.0 - blur);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => material.userData.stoneSlab ? 'studio-slab' : 'studio-surface';
}
