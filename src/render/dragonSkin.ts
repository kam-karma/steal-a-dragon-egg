import * as THREE from 'three'

/**
 * The dragon's skin: its red scales turn royal purple (the colour of the eye meter), gold
 * horns and belly plates stay gold, and tiny star-like glints twinkle across the scales.
 * A violet rim glow lifts it off the gold hoard. The model has no eyelid bones, so the
 * lids are painted here: a purple lid slides down over each eye, with a dark lash line.
 */
export interface DragonSkin {
  readonly time: { value: number }
  /** 0..1 extra glow when the dragon is awake and angry. */
  readonly anger: { value: number }
  /** Eyelids, 0 open .. 1 shut. */
  readonly lidL: { value: number }
  readonly lidR: { value: number }
}

/** Eye centres and size in the mesh's own (quantised) position space, found by raycasting. */
export interface EyeSpots {
  readonly left: THREE.Vector3
  readonly right: THREE.Vector3
  /** Half width and half height of an eye. */
  readonly size: THREE.Vector2
}

const SKIN_CODE = `
{
  vec3 c = diffuseColor.rgb;
  float hi = max(c.r, max(c.g, c.b));
  float lo = min(c.r, min(c.g, c.b));
  float sat = (hi - lo) / max(hi, 1e-4);
  // Red scales: red channel dominant, green low. Gold (red and green high) is left alone.
  float red = smoothstep(0.35, 0.6, sat) * (1.0 - smoothstep(0.3, 0.5, c.g / max(c.r, 1e-4)));
  float shade = smoothstep(0.02, 0.45, c.r);
  vec3 purple = mix(vec3(0.045, 0.012, 0.11), vec3(0.27, 0.09, 0.55), shade) + vec3(0.12, 0.06, 0.22) * smoothstep(0.6, 0.95, c.r);
  diffuseColor.rgb = mix(c, purple, red);
  vDragonScale = red;
  // Eyelids.
  vec3 lidCol = vec3(0.24, 0.085, 0.47);
  vec3 lash = vec3(0.07, 0.02, 0.13);
  for (int e = 0; e < 2; e++) {
    vec3 d = vDragonPos - (e == 0 ? uEyeL : uEyeR);
    float lid = e == 0 ? uLidL : uLidR;
    vec3 q = vec3(d.x / uEyeSize.x, d.y / uEyeSize.y, d.z / uEyeSize.x);
    float r = length(q);
    float inside = 1.0 - smoothstep(0.92, 1.05, r);
    // The lid's edge sweeps from above the eye (open) to below it (shut), curving down in the middle.
    float edge = 1.05 - lid * 2.0 - 0.18 * (1.0 - min(1.0, length(q.xz)));
    float cover = smoothstep(edge - 0.04, edge + 0.04, q.y) * inside;
    float line = (1.0 - smoothstep(0.0, 0.1, abs(q.y - edge))) * inside * step(0.04, lid);
    diffuseColor.rgb = mix(diffuseColor.rgb, lidCol * (0.85 + 0.3 * clamp(q.y, 0.0, 1.0)), cover);
    diffuseColor.rgb = mix(diffuseColor.rgb, lash, line);
    vDragonEye += inside * (1.0 - cover) * (1.0 - line);
  }
}
`

const GLOW_CODE = `
{
  float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += vec3(0.45, 0.2, 1.0) * pow(rimF, 2.6) * (0.4 + uDragonAnger * 1.2);
  // Twinkling glints: one small round star in a few of the cells across the scales.
  vec3 p = vDragonPos * uDragonCell;
  vec3 cell = floor(p);
  float seed = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vec3 spot = vec3(fract(seed * 7.13), fract(seed * 3.71), fract(seed * 5.19)) * 0.5 + 0.25;
  float dist = length(fract(p) - spot);
  float star = 1.0 - smoothstep(0.04, 0.2, dist);
  float tw = sin(uDragonTime * (2.0 + seed * 3.0) + seed * 40.0);
  float glint = step(0.9, seed) * smoothstep(0.55, 1.0, tw) * star;
  totalEmissiveRadiance += vec3(1.0, 0.85, 1.0) * glint * vDragonScale * 4.0;
  // Angry eyes glow gold.
  totalEmissiveRadiance += vec3(1.0, 0.6, 0.1) * clamp(vDragonEye, 0.0, 1.0) * uDragonAnger * 0.9;
}
`

/** `size` = the mesh's largest local dimension; glint cells are ~1/55 of the body across. */
export function applyDragonSkin(mat: THREE.MeshStandardMaterial, size: number, eyes: EyeSpots): DragonSkin {
  const skin: DragonSkin = { time: { value: 0 }, anger: { value: 0 }, lidL: { value: 1 }, lidR: { value: 1 } }
  const cell = { value: 55 / Math.max(size, 1e-6) }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDragonCell = cell
    shader.uniforms.uDragonTime = skin.time
    shader.uniforms.uDragonAnger = skin.anger
    shader.uniforms.uLidL = skin.lidL
    shader.uniforms.uLidR = skin.lidR
    shader.uniforms.uEyeL = { value: eyes.left }
    shader.uniforms.uEyeR = { value: eyes.right }
    shader.uniforms.uEyeSize = { value: eyes.size }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDragonPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDragonPos = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uDragonTime;
uniform float uDragonAnger;
uniform float uDragonCell;
uniform float uLidL;
uniform float uLidR;
uniform vec3 uEyeL;
uniform vec3 uEyeR;
uniform vec2 uEyeSize;
varying vec3 vDragonPos;
float vDragonScale = 0.0;
float vDragonEye = 0.0;`,
      )
      .replace('#include <map_fragment>', `#include <map_fragment>\n${SKIN_CODE}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${GLOW_CODE}`)
  }
  mat.customProgramCacheKey = () => 'dragonSkin2'
  return skin
}
