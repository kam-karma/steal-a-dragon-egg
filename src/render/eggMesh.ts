import * as THREE from 'three'
import type { Rarity } from '../sim/types'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { starTexture } from './textures'
import { applyFx, type FxHandle, matteCopy } from './materialFx'

export const RARITY_COLOR: Record<Rarity, number> = { 0: 0x9be07a, 1: 0x46a8ff, 2: 0xb655ff, 3: 0xffcf3a, 4: 0xf6f2ff }
const GLOW: Record<Rarity, number> = { 0: 0.15, 1: 0.45, 2: 0.9, 3: 1.8, 4: 2.6 }

const eggGeo = new THREE.SphereGeometry(0.38, 18, 14)
eggGeo.scale(1, 1.3, 1)
const spotGeo = new THREE.SphereGeometry(0.09, 8, 6)

const materials = new Map<Rarity, { shell: THREE.MeshStandardMaterial; spot: THREE.MeshStandardMaterial }>()

function mats(r: Rarity): { shell: THREE.MeshStandardMaterial; spot: THREE.MeshStandardMaterial } {
  const cached = materials.get(r)
  if (cached !== undefined) return cached
  const c = RARITY_COLOR[r]
  const shell = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: GLOW[r], roughness: 0.35, metalness: r === 3 ? 0.5 : 0.05 })
  const spot = new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.55), roughness: 0.5 })
  const made = { shell, spot }
  materials.set(r, made)
  return made
}

/** One shared rainbow material; its hue cycles every frame (see tickRainbow). */
const RAINBOW = new THREE.MeshStandardMaterial({ color: 0xff5a5f, emissive: 0xff5a5f, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.3 })
const RAINBOW_SPOT = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 })
const BEAM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })

export function tickRainbow(time: number): void {
  RAINBOW.color.setHSL((time * 0.25) % 1, 0.9, 0.6)
  RAINBOW.emissive.copy(RAINBOW.color)
  for (const fx of rainbowFx) {
    fx.tint.copy(RAINBOW.color)
    fx.rim.copy(RAINBOW.color)
    fx.rimStrength.value = 2.6
  }
  BEAM.color.copy(RAINBOW.color)
  BEAM.opacity = 0.18 + Math.sin(time * 6) * 0.06
}

/** A light pillar over the rainbow egg so every kid in the room sees where it is. */
export function makeBeam(): THREE.Mesh {
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 14, 16, 1, true), BEAM)
  beam.position.y = 7
  return beam
}

let eggTemplate: THREE.Mesh | null = null
/** Quantized (meshopt) geometry keeps its real size in the node transform: carry it along. */
const eggTemplateMatrix = new THREE.Matrix4()
const eggModelMats = new Map<string, THREE.MeshStandardMaterial>()
const rainbowFx: FxHandle[] = []

/** The Tripo dragon egg (pale scaled shell): sized to 0.95 m and centred on its middle. */
export function setEggTemplate(scene: THREE.Object3D): void {
  scene.updateMatrixWorld(true)
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && eggTemplate === null) {
      eggTemplate = o as THREE.Mesh
      eggTemplateMatrix.copy(o.matrixWorld)
    }
  })
  if (eggTemplate === null) return
  const geo = (eggTemplate as THREE.Mesh).geometry
  geo.computeBoundingBox()
  const box = (geo.boundingBox as THREE.Box3).clone().applyMatrix4(eggTemplateMatrix)
  const size = box.getSize(new THREE.Vector3())
  const c = box.getCenter(new THREE.Vector3())
  const k = 0.95 / Math.max(size.y, 1e-6)
  eggTemplateMatrix.premultiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)).premultiply(new THREE.Matrix4().makeScale(k, k, k))
}

/** The shell takes its rarity colour and glows from the edges in that colour; rarer = brighter. */
function eggModelMaterial(r: Rarity, rainbow: boolean): THREE.MeshStandardMaterial {
  const key = rainbow ? 'rainbow' : String(r)
  const hit = eggModelMats.get(key)
  if (hit !== undefined) return hit
  const mat = matteCopy((eggTemplate as THREE.Mesh).material as THREE.Material)
  mat.roughness = 0.32
  mat.emissive = new THREE.Color(RARITY_COLOR[r])
  mat.emissiveIntensity = 0.06 + GLOW[r] * 0.08
  const fx = applyFx(mat, { tint: RARITY_COLOR[r], tintAmount: r === 4 ? 0.25 : 0.9, rim: RARITY_COLOR[r], rimStrength: 0.6 + GLOW[r] * 0.9 })
  // One shared material per rarity (and one for all rainbow eggs): no GPU leak.
  if (rainbow) rainbowFx.push(fx)
  eggModelMats.set(key, mat)
  return mat
}

/** A spotted, glowing dragon egg. Rarer = brighter. Rainbow eggs shimmer through every colour. */
const GOLDEN = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa000, emissiveIntensity: 0.75, roughness: 0.25, metalness: 0 })

const WOOD = new THREE.MeshStandardMaterial({ color: 0x8a4b22, roughness: 0.7, metalness: 0 })
const WOOD_DARK = new THREE.MeshStandardMaterial({ color: 0x5c2f14, roughness: 0.75, metalness: 0 })
const CHEST_GOLD = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa000, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0 })
const CHEST_GLOW = new THREE.MeshBasicMaterial({ color: 0xfff2a0 })

const CHEST_GEO = {
  box: new THREE.BoxGeometry(1.1, 0.62, 0.74),
  lid: new THREE.CylinderGeometry(0.37, 0.37, 1.1, 16, 1, false, 0, Math.PI),
  seam: new THREE.BoxGeometry(1.06, 0.05, 0.7),
  band: new THREE.BoxGeometry(0.09, 0.66, 0.78),
  arc: new THREE.TorusGeometry(0.38, 0.045, 6, 16, Math.PI),
  lock: new THREE.BoxGeometry(0.2, 0.24, 0.08),
}

/** A treasure chest: wooden box and rounded lid with gold bands, a lock, and gold glowing at the seam. Shares its geometry. */
export function makeChest(): THREE.Group {
  const g = new THREE.Group()
  const box = new THREE.Mesh(CHEST_GEO.box, WOOD)
  box.position.y = 0.31
  const lid = new THREE.Mesh(CHEST_GEO.lid, WOOD_DARK)
  lid.rotation.z = Math.PI / 2
  lid.rotation.y = Math.PI / 2
  lid.position.y = 0.62
  const seam = new THREE.Mesh(CHEST_GEO.seam, CHEST_GLOW)
  seam.position.y = 0.63
  g.add(box, lid, seam)
  for (const x of [-0.42, 0, 0.42]) {
    const band = new THREE.Mesh(CHEST_GEO.band, CHEST_GOLD)
    band.position.set(x, 0.33, 0)
    const arc = new THREE.Mesh(CHEST_GEO.arc, CHEST_GOLD)
    arc.rotation.y = Math.PI / 2
    arc.position.set(x, 0.62, 0)
    g.add(band, arc)
  }
  const lock = new THREE.Mesh(CHEST_GEO.lock, CHEST_GOLD)
  lock.position.set(0, 0.5, 0.4)
  g.add(lock)
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true
  })
  g.position.y = -0.4
  const wrap = new THREE.Group()
  wrap.add(g)
  return wrap
}

/** A golden egg: the egg in shining gold with a sparkle, a little bigger. */
export function makeGoldenEgg(r: Rarity): THREE.Group {
  const g = makeEgg(r)
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.material = GOLDEN
  })
  g.scale.setScalar(1.2)
  return g
}

export function makeEgg(r: Rarity, rainbow = false): THREE.Group {
  const g = new THREE.Group()
  if (eggTemplate !== null) {
    const m = new THREE.Mesh(eggTemplate.geometry, eggModelMaterial(r, rainbow))
    m.castShadow = true
    m.applyMatrix4(eggTemplateMatrix)
    g.add(m)
    return g
  }
  const { shell, spot } = rainbow ? { shell: RAINBOW, spot: RAINBOW_SPOT } : mats(r)
  const e = new THREE.Mesh(eggGeo, shell)
  e.castShadow = true
  g.add(e)
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4
    const y = ((k % 3) - 1) * 0.22
    const s = new THREE.Mesh(spotGeo, spot)
    const rr = 0.37 * Math.sqrt(1 - (y / 0.5) ** 2)
    s.position.set(Math.sin(a) * rr, y, Math.cos(a) * rr)
    s.scale.set(1, 1, 0.4)
    s.lookAt(0, y, 0)
    g.add(s)
  }
  return g
}

const babyBody = new Map<Rarity, THREE.MeshStandardMaterial>()

const sparkleTex = starTexture()

/** Three stars circling a shiny baby (rotated by the view each frame). */
function sparkles(): THREE.Group {
  const s = new THREE.Group()
  s.name = 'sparkle'
  for (let k = 0; k < 3; k++) {
    const star = new THREE.Sprite(BABY.starMat)
    const a = (k / 3) * Math.PI * 2
    star.position.set(Math.cos(a) * 0.75, 0.6 + k * 0.25, Math.sin(a) * 0.75)
    star.scale.setScalar(0.35)
    s.add(star)
  }
  return s
}

/** Shared baby parts: every baby reuses these, so rebuilding a nest never leaks GPU memory. */
const BABY = {
  body: new THREE.SphereGeometry(0.42, 12, 10),
  head: new THREE.SphereGeometry(0.33, 12, 10),
  eye: new THREE.SphereGeometry(0.07, 8, 6),
  wing: new THREE.ConeGeometry(0.22, 0.5, 3),
  horn: new THREE.ConeGeometry(0.06, 0.2, 5),
  tail: new THREE.ConeGeometry(0.15, 0.6, 6),
  eyeMat: new THREE.MeshStandardMaterial({ color: 0x111111 }),
  hornMat: new THREE.MeshStandardMaterial({ color: 0xfff1d0 }),
  starMat: new THREE.SpriteMaterial({ map: sparkleTex, color: 0xfff3a0, blending: THREE.AdditiveBlending, depthWrite: false }),
}

let babyTemplate: THREE.Object3D | null = null
let babyClips: readonly THREE.AnimationClip[] = []
const babyModelMats = new Map<string, THREE.MeshStandardMaterial>()

/** The Tripo baby dragon (pale, Mixamo rig with idle / walk / jump): 1.1 m tall, feet on y = 0. */
export function setBabyTemplate(scene: THREE.Object3D, clips: readonly THREE.AnimationClip[] = []): void {
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  scene.scale.multiplyScalar(1.45 / Math.max(size.y, 1e-6))
  scene.updateMatrixWorld(true)
  const box2 = new THREE.Box3().setFromObject(scene)
  scene.position.y -= box2.min.y
  babyTemplate = scene
  babyClips = clips
}

/** A baby in its rarity colour, glowing from the edges in that colour. Own skeleton and mixer. */
function modelBaby(r: Rarity, shiny: boolean): THREE.Group {
  const g = new THREE.Group()
  const m = cloneSkinned(babyTemplate as THREE.Object3D)
  m.name = 'babyModel'
  m.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.frustumCulled = false
    const src = mesh.material as THREE.MeshStandardMaterial
    const key = `${src.uuid}:${r}`
    let mat = babyModelMats.get(key)
    if (mat === undefined) {
      mat = matteCopy(src)
      mat.emissive = new THREE.Color(RARITY_COLOR[r])
      mat.emissiveIntensity = 0.02 + GLOW[r] * 0.04
      applyFx(mat, { tint: new THREE.Color(RARITY_COLOR[r]).multiplyScalar(0.8), tintAmount: r === 4 ? 0.25 : 1, rim: RARITY_COLOR[r], rimStrength: 0.5 + GLOW[r] * 0.7 })
      babyModelMats.set(key, mat)
    }
    mesh.material = mat
  })
  const mixer = new THREE.AnimationMixer(m)
  const actions = new Map<string, THREE.AnimationAction>()
  for (const clip of babyClips) actions.set(clip.name, mixer.clipAction(clip))
  const idle = actions.get('idle')
  if (idle !== undefined) {
    idle.play()
    idle.time = Math.random() * idle.getClip().duration
  }
  m.userData.mixer = mixer
  m.userData.actions = actions
  g.add(m)
  if (shiny) g.add(sparkles())
  return g
}

/** A tiny dragon that hops in the nest. Same colours as its egg; shiny ones sparkle. */
export function makeBaby(r: Rarity, shiny = false): THREE.Group {
  if (babyTemplate !== null) return modelBaby(r, shiny)
  let mat = babyBody.get(r)
  if (mat === undefined) {
    mat = new THREE.MeshStandardMaterial({ color: RARITY_COLOR[r], roughness: 0.5, flatShading: true, emissive: RARITY_COLOR[r], emissiveIntensity: GLOW[r] * 0.35 })
    babyBody.set(r, mat)
  }
  const g = new THREE.Group()
  const body = new THREE.Mesh(BABY.body, mat)
  body.scale.set(1, 0.9, 1.1)
  body.position.y = 0.4
  body.castShadow = true
  g.add(body)
  const head = new THREE.Mesh(BABY.head, mat)
  head.position.set(0, 0.85, 0.3)
  g.add(head)
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(BABY.eye, BABY.eyeMat)
    eye.position.set(s * 0.14, 0.93, 0.58)
    g.add(eye)
    const wing = new THREE.Mesh(BABY.wing, mat)
    wing.position.set(s * 0.4, 0.6, -0.1)
    wing.rotation.set(0, 0, s * -1.1)
    g.add(wing)
    const horn = new THREE.Mesh(BABY.horn, BABY.hornMat)
    horn.position.set(s * 0.13, 1.17, 0.22)
    g.add(horn)
  }
  const tail = new THREE.Mesh(BABY.tail, mat)
  tail.rotation.x = -Math.PI / 2 - 0.4
  tail.position.set(0, 0.3, -0.55)
  g.add(tail)
  if (shiny) g.add(sparkles())
  return g
}
