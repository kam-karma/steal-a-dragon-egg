import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CFG } from '../sim/config'
import { rngFrom } from '../sim/rng'
import { NEST_COUNT, nestAngle } from '../sim/world'
import { glowTexture } from './textures'

/**
 * Everything outside the play ring that makes the cave feel alive: crystal clusters,
 * stalagmites, braziers with flickering fire, light shafts and dust.
 * Purely visual; nothing here blocks movement (it all sits beyond arenaRadius).
 */

export const CRYSTAL_COLORS = [0x5ee7ff, 0xb46bff, 0xff7ad9] as const

/** One crystal: a six-sided prism with a pointed tip, base at y=0, height 1. */
function crystalGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.2, 0.26, 0.78, 6)
  body.translate(0, 0.39, 0)
  const tip = new THREE.ConeGeometry(0.2, 0.32, 6)
  tip.translate(0, 0.94, 0)
  const g = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()])
  if (g === null) throw new Error('crystal geometry merge failed')
  g.computeVertexNormals()
  return g
}

const CRYSTAL_GEO = crystalGeometry()

export function crystalMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.75,
    roughness: 0.12,
    metalness: 0.1,
    flatShading: true,
  })
}

/** Matrices for a fan of crystals growing from one spot. */
function clusterMatrices(rand: () => number, at: THREE.Vector3, size: number, count: number): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = []
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  for (let k = 0; k < count; k++) {
    const lean = k === 0 ? rand() * 0.15 : 0.35 + rand() * 0.55
    const turn = (k / count) * Math.PI * 2 + rand() * 0.6
    e.set(Math.cos(turn) * lean, rand() * Math.PI, Math.sin(turn) * lean)
    q.setFromEuler(e)
    const h = size * (k === 0 ? 1.6 + rand() * 0.6 : 0.6 + rand() * 0.8)
    const w = size * (k === 0 ? 1.4 : 0.8 + rand() * 0.4)
    const off = new THREE.Vector3(Math.cos(turn), 0, Math.sin(turn)).multiplyScalar(k === 0 ? 0 : size * 0.18)
    out.push(new THREE.Matrix4().compose(at.clone().add(off), q, new THREE.Vector3(w, h, w)))
  }
  return out
}

/** A crystal cluster as one mesh (used on pillars, where it must fade with its rock). */
export function crystalCluster(seed: number, size: number, material: THREE.Material): THREE.InstancedMesh {
  const rand = rngFrom(seed)
  const mats = clusterMatrices(rand, new THREE.Vector3(), size, 4 + Math.floor(rand() * 3))
  const mesh = new THREE.InstancedMesh(CRYSTAL_GEO, material, mats.length)
  mats.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.castShadow = true
  return mesh
}

function glowSprite(color: number, scale: number, opacity: number): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  s.scale.setScalar(scale)
  return s
}

/** Angles between nests, so decor never sits right behind a nest. */
function gapAngles(): number[] {
  return Array.from({ length: NEST_COUNT }, (_, i) => nestAngle(i) + Math.PI / NEST_COUNT)
}

function ringPoint(a: number, r: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r)
}

function wallCrystals(rand: () => number): THREE.Group {
  const g = new THREE.Group()
  const perColor: THREE.Matrix4[][] = CRYSTAL_COLORS.map(() => [])
  const R = CFG.arenaRadius
  let k = 0
  for (const a of gapAngles()) {
    for (let j = 0; j < 3; j++) {
      const ang = a + (rand() - 0.5) * 0.5
      const at = ringPoint(ang, R + 2.6 + rand() * 2.4, -0.1)
      const size = 0.7 + rand() * 0.8
      const c = k++ % CRYSTAL_COLORS.length
      perColor[c].push(...clusterMatrices(rand, at, size, 5 + Math.floor(rand() * 3)))
      if (j === 0) {
        const glow = glowSprite(CRYSTAL_COLORS[c], 4 + size * 2, 0.22)
        glow.position.copy(at).setY(1.2)
        g.add(glow)
      }
    }
  }
  CRYSTAL_COLORS.forEach((color, c) => {
    const list = perColor[c]
    const mesh = new THREE.InstancedMesh(CRYSTAL_GEO, crystalMaterial(color), list.length)
    list.forEach((m, i) => mesh.setMatrixAt(i, m))
    g.add(mesh)
  })
  return g
}

/** Stalagmites around the edge, merged into one mesh. */
function stalagmites(rand: () => number, rock: THREE.Material): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = []
  const R = CFG.arenaRadius
  for (let k = 0; k < 46; k++) {
    const h = 0.9 + rand() * 2.2
    const r = 0.3 + h * 0.18
    const geo = new THREE.ConeGeometry(r, h, 7, 3).toNonIndexed()
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const wob = Math.sin(y * 3 + k) * 0.08 * r
      pos.setXYZ(i, pos.getX(i) * (1 + wob), y, pos.getZ(i) * (1 - wob))
    }
    const p = ringPoint(rand() * Math.PI * 2, R + 2.2 + rand() * 3.6, h / 2 - 0.1)
    geo.rotateZ((rand() - 0.5) * 0.25)
    geo.translate(p.x, p.y, p.z)
    parts.push(geo)
  }
  const merged = mergeGeometries(parts)
  if (merged === null) throw new Error('stalagmite merge failed')
  merged.computeVertexNormals()
  const mesh = new THREE.Mesh(merged, rock)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

interface Brazier {
  readonly light: THREE.PointLight
  readonly flames: readonly THREE.Sprite[]
  readonly phase: number
}

/** Stone braziers with fire: warm pools of light at the edge of the hoard. */
function brazier(at: THREE.Vector3, rock: THREE.Material, phase: number, withLight: boolean): { group: THREE.Group; b: Brazier } {
  const g = new THREE.Group()
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a2a26, roughness: 0.6, metalness: 0.6 })
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 1.6, 8), rock)
  post.position.y = 0.8
  post.castShadow = true
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.45, 0.5, 10, 1, true), iron)
  bowl.position.y = 1.8
  const embers = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 12).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 0.7 }),
  )
  embers.position.y = 1.95
  for (const m of [post, bowl, embers]) m.userData.proc = true
  g.add(post, bowl, embers)
  const flames = [
    glowSprite(0xff7a1a, 1.8, 0.45),
    glowSprite(0xffc34a, 1.2, 0.55),
    glowSprite(0xfff1a0, 0.6, 0.7),
  ]
  flames.forEach((f, i) => {
    f.position.y = 2.3 + i * 0.25
    g.add(f)
  })
  const light = new THREE.PointLight(0xff9a3a, withLight ? 5 : 0, 9, 2)
  light.position.y = 2.8
  if (withLight) g.add(light)
  g.position.copy(at)
  return { group: g, b: { light, flames, phase } }
}

/** Soft god-rays from cracks in the ceiling. */
function lightShaft(at: THREE.Vector3, radius: number, color: number): THREE.Mesh {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 128
  const ctx = c.getContext('2d')
  if (ctx === null) throw new Error('2d canvas unavailable')
  const grad = ctx.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 4, 128)
  const tex = new THREE.CanvasTexture(c)
  const h = 26
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.45, radius, h, 24, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  mesh.position.set(at.x, h / 2 - 0.5, at.z)
  mesh.rotation.z = 0.18
  return mesh
}

function dust(rand: () => number): THREE.Points {
  const n = 220
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const p = ringPoint(rand() * Math.PI * 2, Math.sqrt(rand()) * (CFG.arenaRadius + 2), 0.5 + rand() * 7)
    pos.set([p.x, p.y, p.z], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ map: glowTexture(), color: 0xffd890, size: 0.32, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
}

export interface CaveFx {
  readonly update: (t: number) => void
}

/** The stand-in decor pieces, so the Tripo models can replace them once loaded. */
export interface DecorParts {
  readonly crystals: THREE.Object3D
  readonly stalagmites: THREE.Object3D
  readonly braziers: readonly THREE.Group[]
}

export function buildDecor(scene: THREE.Scene, rock: THREE.Material): { fx: CaveFx; parts: DecorParts } {
  const rand = rngFrom(77)
  const crystals = wallCrystals(rand)
  scene.add(crystals)
  const spikes = stalagmites(rand, rock)
  scene.add(spikes)
  const brazierGroups: THREE.Group[] = []
  // Braziers between every other nest; only four carry a real light (mobile budget).
  const braziers: Brazier[] = []
  gapAngles().forEach((a, i) => {
    const { group, b } = brazier(ringPoint(a + Math.PI / NEST_COUNT / 2, CFG.arenaRadius + 0.9), rock, i * 1.7, i % 2 === 0)
    scene.add(group)
    brazierGroups.push(group)
    braziers.push(b)
  })
  const shafts = [
    lightShaft(new THREE.Vector3(1.5, 0, -1), 7, 0xffe2a8),
    lightShaft(new THREE.Vector3(-16, 0, 9), 4, 0x9fe8ff),
    lightShaft(new THREE.Vector3(14, 0, 14), 3.5, 0xd8b0ff),
  ]
  shafts.forEach((s) => scene.add(s))
  const motes = dust(rand)
  scene.add(motes)
  const base = Float32Array.from(motes.geometry.getAttribute('position').array)

  const fx: CaveFx = {
    update: (t) => {
      for (const b of braziers) {
        const f = 0.82 + Math.sin(t * 11 + b.phase) * 0.08 + Math.sin(t * 23.7 + b.phase * 2) * 0.06
        if (b.light.intensity > 0) b.light.intensity = 5 * f
        b.flames.forEach((s, i) => {
          const k = (i === 0 ? 1.8 : i === 1 ? 1.2 : 0.6) * (f + 0.1)
          s.scale.set(k * 0.85, k * (1.05 + Math.sin(t * 9 + i + b.phase) * 0.12), 1)
        })
      }
      shafts.forEach((s, i) => {
        ;(s.material as THREE.MeshBasicMaterial).opacity = 0.13 + Math.sin(t * 0.6 + i * 2) * 0.04
      })
      const attr = motes.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < attr.count; i++) {
        attr.setXYZ(
          i,
          base[i * 3] + Math.sin(t * 0.3 + i) * 0.6,
          base[i * 3 + 1] + Math.sin(t * 0.45 + i * 1.3) * 0.5,
          base[i * 3 + 2] + Math.cos(t * 0.27 + i * 0.7) * 0.6,
        )
      }
      attr.needsUpdate = true
    },
  }
  return { fx, parts: { crystals, stalagmites: spikes, braziers: brazierGroups } }
}
