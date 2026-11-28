import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rngFrom } from '../sim/rng'
import { CFG } from '../sim/config'
import { eggPos } from '../sim/happenings'
import { isGuarded } from '../sim/raid'
import type { GameState, Layout } from '../sim/types'
import { babyStage } from '../sim/economy'
import { nestScale } from '../sim/progression'
import { animateBaby } from './babyRig'
import { makeBaby, makeBeam, makeChest, makeEgg, makeGoldenEgg } from './eggMesh'
import { applyFx, matteCopy, prepareMeshes } from './materialFx'
import { glowTexture } from './textures'

const TWIG = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.95, flatShading: true, vertexColors: true })
const STRAW = new THREE.MeshStandardMaterial({ color: 0xe2bd62, roughness: 1, flatShading: true })
const POLE = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.9 })
const BRASS = new THREE.MeshStandardMaterial({ color: 0xffc34a, roughness: 0.35, metalness: 0.8 })

/**
 * A woven nest: ~70 twigs laid around a ring at random tilts, merged into one shared
 * geometry with per-twig colour variation so it reads as hand-built, not a donut.
 */
function weaveGeometry(): THREE.BufferGeometry {
  const rand = rngFrom(404)
  const parts: THREE.BufferGeometry[] = []
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const shades = [0x7a4a28, 0x9a6a3a, 0x6a3e22, 0xb07a44]
  const c = new THREE.Color()
  for (let k = 0; k < 72; k++) {
    const layer = k % 3
    const a = (k / 72) * Math.PI * 2 + rand() * 0.2
    const r = 1.55 + layer * 0.16 + (rand() - 0.5) * 0.18
    const len = 1.2 + rand() * 0.7
    const twig = new THREE.CylinderGeometry(0.055, 0.075, len, 5).toNonIndexed()
    e.set(Math.PI / 2 + (rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.7)
    q.setFromEuler(e)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(), q, new THREE.Vector3(1, 1, 1))
    m.premultiply(new THREE.Matrix4().makeRotationY(a + Math.PI / 2))
    m.premultiply(new THREE.Matrix4().makeTranslation(Math.sin(a) * r, 0.16 + layer * 0.17 + rand() * 0.08, Math.cos(a) * r))
    twig.applyMatrix4(m)
    c.setHex(shades[Math.floor(rand() * shades.length)])
    const col = new Float32Array(twig.getAttribute('position').count * 3)
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i)
    twig.setAttribute('color', new THREE.BufferAttribute(col, 3))
    parts.push(twig)
  }
  const g = mergeGeometries(parts)
  if (g === null) throw new Error('nest merge failed')
  g.computeVertexNormals()
  return g
}

const WEAVE = weaveGeometry()

/** A swallow-tail pennant, slightly curved so it catches light. */
function pennantGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(1.25, 0)
  shape.lineTo(0.95, -0.42)
  shape.lineTo(1.25, -0.84)
  shape.lineTo(0, -0.84)
  shape.closePath()
  const g = new THREE.ShapeGeometry(shape, 4)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 2.4) * 0.12)
  g.computeVertexNormals()
  return g
}

const PENNANT = pennantGeometry()

function nestMesh(color: number, isPlayer: boolean): THREE.Group {
  const g = new THREE.Group()
  const weave = new THREE.Mesh(WEAVE, TWIG)
  weave.castShadow = true
  weave.receiveShadow = true
  g.add(weave)
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 0.22, 20), STRAW)
  straw.position.y = 0.11
  straw.receiveShadow = true
  g.add(straw)
  // The owner's colour as a glowing rune ring on the floor: who owns which nest at a glance.
  const rune = new THREE.Mesh(
    new THREE.RingGeometry(2.25, 2.5, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isPlayer ? 0.85 : 0.5, depthWrite: false }),
  )
  rune.position.y = 0.04
  g.add(rune)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), POLE)
  pole.position.set(-2.1, 1.7, -0.6)
  pole.castShadow = true
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), BRASS)
  knob.position.set(-2.1, 3.45, -0.6)
  g.add(pole, knob)
  const flag = new THREE.Mesh(PENNANT, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.3, roughness: 0.7 }))
  flag.position.set(-2.05, 3.25, -0.6)
  flag.name = 'flag'
  g.add(flag)
  // Lantern: brass cage with a warm flame inside.
  const lanternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 6), POLE)
  lanternPost.position.set(2.1, 0.75, -0.6)
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.42, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xffc34a, roughness: 0.4, metalness: 0.7, wireframe: true }))
  cage.position.set(2.1, 1.72, -0.6)
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 6), BRASS)
  cap.position.set(2.1, 2.03, -0.6)
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 8).scale(1, 1.5, 1),
    new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xff8a1a, emissiveIntensity: 2.4 }),
  )
  flame.position.set(2.1, 1.72, -0.6)
  flame.name = 'flame'
  g.add(lanternPost, cage, cap, flame)
  // Everything above is a stand-in until the Tripo models load (see dressNests).
  g.children.forEach((c) => (c.userData.proc = true))
  if (isPlayer) {
    const light = new THREE.PointLight(0xffb060, 3, 8, 1.8)
    light.position.set(0, 4, 0)
    g.add(light)
  }
  return g
}

/** Height of the straw bed inside the (flattened) Tripo nest. */
const NEST_FLOOR = 0.72

const MOTES = 46

/** A loose column of golden motes around the guarded nest. */
function guardMotes(): THREE.Points {
  const pos = new Float32Array(MOTES * 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ map: glowTexture(), color: 0xffd36a, size: 0.42, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  pts.visible = false
  return pts
}

function animateMotes(p: THREE.Points, time: number): void {
  const attr = p.geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < MOTES; i++) {
    const life = (time * 0.35 + i / MOTES) % 1
    const a = i * 2.39996 + time * 0.4
    const r = CFG.nestRadius + 0.6 + Math.sin(i * 1.7) * 0.5
    attr.setXYZ(i, Math.sin(a) * r, 0.2 + life * 3.2, Math.cos(a) * r)
  }
  attr.needsUpdate = true
}

export interface HoardView {
  readonly sync: (state: GameState, time: number) => void
  /** World position of a nest's baby (for coin pop text). */
  readonly babyPos: (nest: number, baby: number, out: THREE.Vector3) => THREE.Vector3
  /** Rebuild every baby (e.g. when the baby model finishes loading). */
  readonly rebuildBabies: () => void
  /** Swap the hand-built nests for the Tripo nest and banner models. */
  readonly dressNests: (nest: THREE.Object3D, banner: THREE.Object3D) => void
}

export function createHoardView(scene: THREE.Scene, layout: Layout, colors: readonly number[], playerNest: number): HoardView {
  const eggMeshes = new Map<number, THREE.Group>()
  const nests = layout.nests.map((p, i) => {
    const g = nestMesh(colors[i], i === playerNest)
    g.position.set(p.x, 0, p.z)
    g.rotation.y = Math.atan2(-p.x, -p.z)
    scene.add(g)
    return { group: g, babies: [] as THREE.Group[], hatching: [] as THREE.Group[], signature: '' }
  })

  // Golden motes rise around the player's nest while the player guards it (no domes or floor rings).
  const motes = guardMotes()
  motes.position.set(layout.nests[playerNest].x, 0, layout.nests[playerNest].z)
  scene.add(motes)

  // Babies sit in rings: 1 in the middle, then 6, 10, 14, 18 … around it (a big nest holds 40+).
  const RINGS = [1, 6, 10, 14, 18, 22]
  const RADII = [0, 0.95, 2.0, 2.8, 3.5, 4.1]
  function slot(k: number): THREE.Vector3 {
    let ring = 0
    let first = 0
    while (ring < RINGS.length - 1 && k >= first + RINGS[ring]) {
      first += RINGS[ring]
      ring++
    }
    const a = ((k - first) / RINGS[ring]) * Math.PI * 2 + ring * 0.4
    return new THREE.Vector3(Math.sin(a) * RADII[ring], ring <= 1 ? NEST_FLOOR : 0.15, Math.cos(a) * RADII[ring])
  }

  function sync(state: GameState, time: number): void {
    const guarded = isGuarded(layout, state.actors, playerNest, state.nests)
    motes.visible = guarded && state.nests[playerNest].babies.length > 0
    if (motes.visible) animateMotes(motes, time)
    const live = new Set(state.eggs.map((e) => e.id))
    for (const [id, mesh] of eggMeshes) {
      if (!live.has(id)) {
        scene.remove(mesh)
        eggMeshes.delete(id)
      }
    }
    for (const egg of state.eggs) {
      let mesh = eggMeshes.get(egg.id)
      if (mesh === undefined) {
        mesh = egg.chest === true ? makeChest() : egg.golden === true ? makeGoldenEgg(egg.rarity) : makeEgg(egg.rarity, egg.rainbow)
        if (egg.rainbow) mesh.add(makeBeam())
        const p = eggPos(egg, state, layout)
        mesh.position.set(p.x, 0.75, p.z)
        mesh.scale.setScalar(0.01)
        scene.add(mesh)
        eggMeshes.set(egg.id, mesh)
      }
      const grow = Math.min(1, mesh.scale.x + 0.06)
      if (egg.chest === true) {
        // A chest sits on the gold and glints; it does not float like an egg.
        mesh.scale.setScalar(grow * 1.3)
        mesh.position.y = 0.45
        mesh.rotation.y = egg.id
        continue
      }
      mesh.scale.setScalar(grow * (1 + egg.rarity * 0.08) * (egg.rainbow ? 1.5 : egg.golden === true ? 1.25 : 1))
      mesh.position.y = 0.75 + Math.sin(time * 2 + egg.id) * 0.08
      mesh.rotation.y = time * 0.6 + egg.id
    }

    state.nests.forEach((n, i) => {
      const view = nests[i]
      const signature = n.babies.map((b) => `${b.rarity}${b.shiny ? 's' : ''}`).join(',')
      if (signature !== view.signature) {
        view.babies.forEach((b) => view.group.remove(b))
        view.babies = n.babies.map((baby, k) => {
          const b = makeBaby(baby.rarity, baby.shiny)
          b.position.copy(slot(k))
          view.group.add(b)
          return b
        })
        view.signature = signature
      }
      while (view.hatching.length > n.hatching.length) {
        const h = view.hatching.pop()
        if (h !== undefined) view.group.remove(h)
      }
      while (view.hatching.length < n.hatching.length) {
        const h = n.hatching[view.hatching.length]
        const e = makeEgg(h.rarity, h.rainbow)
        if (h.insurance) e.scale.setScalar(0.7)
        e.position.set(0.6 * (view.hatching.length - 0.5), 0.6, 0.5)
        view.group.add(e)
        view.hatching.push(e)
      }
      view.hatching.forEach((e, k) => {
        const left = n.hatching[k]?.left ?? 1
        e.rotation.z = Math.sin(time * (10 + (3 - left) * 8)) * (0.1 + (2.5 - left) * 0.12)
      })
      view.babies.forEach((b, k) => {
        const stage = babyStage(n.babies[k]?.age ?? 0)
        const size = [0.7, 1, 1.4][stage]
        b.scale.setScalar(b.scale.x + (size - b.scale.x) * 0.1)
        const model = b.getObjectByName('babyModel')
        const hop = model === undefined ? Math.max(0, Math.sin(time * 4 + k * 1.7)) * 0.35 : 0
        // Adults hover above the nest on lazy wing beats.
        b.position.y = stage === 2 ? NEST_FLOOR + 1.4 + Math.sin(time * 2 + k) * 0.3 : slot(k).y + hop
        if (model !== undefined) animateBaby(model, time, { stage, phase: k + i * 3 })
        const sparkle = b.getObjectByName('sparkle')
        if (sparkle !== undefined) sparkle.rotation.y = time * 2
        b.rotation.y = Math.atan2(-b.position.x, -b.position.z) + Math.PI + Math.sin(time * 0.5 + k) * 0.5
      })
      // The nest itself grows with its size upgrades.
      const model = view.group.getObjectByName('nestModel')
      if (model !== undefined) {
        const base = model.userData.base as THREE.Vector3
        const s = nestScale(n.capacityLevel)
        model.scale.set(base.x * s, base.y * (1 + 0.06 * n.capacityLevel), base.z * s)
      }
      const flag = view.group.getObjectByName('flag')
      if (flag !== undefined) {
        flag.rotation.y = Math.sin(time * 1.4 + i) * 0.06
        if (model !== undefined) flag.position.x = -CFG.nestRadius * nestScale(n.capacityLevel) - 0.3
      }
      const flame = view.group.getObjectByName('flame')
      if (flame !== undefined) flame.scale.set(1, 1 + Math.sin(time * 17 + i) * 0.15, 1)
    })
  }

  function babyPos(nest: number, baby: number, out: THREE.Vector3): THREE.Vector3 {
    const b = nests[nest]?.babies[baby]
    if (b === undefined) return out.set(layout.nests[nest].x, 1, layout.nests[nest].z)
    return b.getWorldPosition(out)
  }

  function rebuildAll(): void {
    nests.forEach((n) => {
      n.signature = '#'
      n.hatching.forEach((h) => n.group.remove(h))
      n.hatching.length = 0
    })
    for (const mesh of eggMeshes.values()) scene.remove(mesh)
    eggMeshes.clear()
  }

  /** The nest model fills the nest circle; the owner's banner stands at its back edge. */
  function dressNests(nestModel: THREE.Object3D, bannerModel: THREE.Object3D): void {
    const nestTpl = fitWidth(nestModel, CFG.nestRadius * 2 + 0.8)
    nestTpl.scale.y = 0.65
    const bannerTpl = fitTall(bannerModel, 4.2)
    nests.forEach((view, i) => {
      view.group.children.filter((c) => c.userData.proc === true).forEach((c) => view.group.remove(c))
      const nest = nestTpl.clone(true)
      nest.userData.proc = false
      nest.name = 'nestModel'
      nest.userData.base = nest.scale.clone()
      view.group.add(nest)
      const banner = bannerTpl.clone(true)
      banner.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = matteCopy(m.material as THREE.Material)
        applyFx(mat, { tint: colors[i], tintAmount: 0.9, rim: colors[i], rimStrength: i === playerNest ? 0.35 : 0.15 })
        m.material = mat
      })
      banner.position.set(-CFG.nestRadius - 0.3, 0, -0.9)
      banner.name = 'flag'
      view.group.add(banner)
    })
  }

  return { sync, babyPos, rebuildBabies: rebuildAll, dressNests }
}

/** A copy of a static model scaled to a footprint width, standing on y = 0, materials matte. */
function fitWidth(src: THREE.Object3D, width: number): THREE.Object3D {
  const m = src.clone(true)
  prepareMeshes(m, true)
  m.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) mesh.material = matteCopy(mesh.material as THREE.Material)
  })
  m.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3())
  m.scale.multiplyScalar(width / Math.max(size.x, size.z, 1e-6))
  return ground(m)
}

function fitTall(src: THREE.Object3D, height: number): THREE.Object3D {
  const m = src.clone(true)
  prepareMeshes(m)
  m.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3())
  m.scale.multiplyScalar(height / Math.max(size.y, 1e-6))
  return ground(m)
}

function ground(m: THREE.Object3D): THREE.Object3D {
  const holder = new THREE.Group()
  holder.add(m)
  m.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(m)
  const c = box.getCenter(new THREE.Vector3())
  m.position.x -= c.x
  m.position.z -= c.z
  m.position.y -= box.min.y
  return holder
}
