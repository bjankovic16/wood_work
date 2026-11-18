import type { MeshStandardMaterial } from 'three';

/** A material swatch response, not a scene light: it cannot illuminate a neighbour or cast a shadow. */
export function studioFinish(material: MeshStandardMaterial): void {
  material.userData.studioFinish = true;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 glance = reflect(-normalize(vViewPosition), normal);
      float face = clamp(0.62 + 0.45 * normal.y - 0.46 * normal.x + 0.29 * normal.z, 0.28, 1.22);
      float satin = pow(0.5 + 0.5 * cos(5.8 * glance.x + 2.4 * glance.y), 3.0);
      outgoingLight = outgoingLight * face + diffuseColor.rgb * metalnessFactor * (0.15 + 0.90 * satin);
      outgoingLight += vec3(0.075) * satin * pow(1.0 - roughnessFactor, 2.0);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'kitchen-studio-satin';
}
