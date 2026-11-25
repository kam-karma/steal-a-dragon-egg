import * as THREE from 'three'

/**
 * Two small shader tweaks for the Tripo models, injected into MeshStandardMaterial:
 *  - tint: recolours the light, unsaturated parts of the texture (Pati's grey hoodie, the
 *    banner's white cloth, a baby dragon's pale body) and keeps everything else as painted.
 *  - rim: a fresnel glow added to emissive, so magical things glow in their own colour.
 */
export interface MaterialFx {
  readonly tint?: THREE.ColorRepresentation
  /** 0..1 how much of the masked area takes the tint. */
  readonly tintAmount?: number
  readonly rim?: THREE.ColorRepresentation
  readonly rimStrength?: number
}

export interface FxHandle {
  readonly tint: THREE.Color
  readonly tintAmount: { value: number }
  readonly rim: THREE.Color
  readonly rimStrength: { value: number }
}

const TINT_CODE = `
{
  vec3 c = diffuseColor.rgb;
  float hi = max(c.r, max(c.g, c.b));
  float lo = min(c.r, min(c.g, c.b));
  float sat = (hi - lo) / max(hi, 1e-3);
  float mask = smoothstep(0.16, 0.34, hi) * (1.0 - smoothstep(0.32, 0.52, sat));
  diffuseColor.rgb = mix(c, uFxTint * (0.35 + hi * 1.35), mask * uFxTintAmount);
}
`

const RIM_CODE = `
{
  float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += uFxRim * pow(rimF, 2.2) * uFxRimStrength;
}
`

/** Adds tint and/or rim glow to a (cloned) standard material. Returns live uniforms to animate. */
export function applyFx(mat: THREE.MeshStandardMaterial, fx: MaterialFx): FxHandle {
  const handle: FxHandle = {
    tint: new THREE.Color(fx.tint ?? 0xffffff),
    tintAmount: { value: fx.tint === undefined ? 0 : (fx.tintAmount ?? 1) },
    rim: new THREE.Color(fx.rim ?? 0x000000),
    rimStrength: { value: fx.rim === undefined ? 0 : (fx.rimStrength ?? 1) },
  }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFxTint = { value: handle.tint }
    shader.uniforms.uFxTintAmount = handle.tintAmount
    shader.uniforms.uFxRim = { value: handle.rim }
    shader.uniforms.uFxRimStrength = handle.rimStrength
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFxTint;\nuniform float uFxTintAmount;\nuniform vec3 uFxRim;\nuniform float uFxRimStrength;')
      .replace('#include <map_fragment>', `#include <map_fragment>\n${TINT_CODE}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${RIM_CODE}`)
  }
  mat.customProgramCacheKey = () => 'materialFx'
  return handle
}

/** Tripo exports metal/rough maps; with no environment map metallic parts render black. */
export function matteCopy(src: THREE.Material): THREE.MeshStandardMaterial {
  const mat = (src as THREE.MeshStandardMaterial).clone()
  mat.metalness = 0
  mat.metalnessMap = null
  mat.roughness = Math.max(0.45, mat.roughness)
  return mat
}

/** Every mesh in a model: shadows on, skinned meshes never culled (bounds lag behind poses). */
export function prepareMeshes(root: THREE.Object3D, receive = false): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = receive
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false
  })
}

/** Scale and move a model so it is `height` tall, centred, standing on y = 0. */
export function fitHeight(root: THREE.Object3D, height: number): void {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  root.scale.multiplyScalar(height / Math.max(size.y, 1e-6))
  root.updateMatrixWorld(true)
  const box2 = new THREE.Box3().setFromObject(root)
  const c = box2.getCenter(new THREE.Vector3())
  root.position.x -= c.x
  root.position.z -= c.z
  root.position.y -= box2.min.y
}
