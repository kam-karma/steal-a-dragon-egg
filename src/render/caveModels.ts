import * as THREE from 'three'
import { CFG } from '../sim/config'
import { rngFrom } from '../sim/rng'
import { NEST_COUNT, nestAngle } from '../sim/world'
import type { Layout } from '../sim/types'
import type { Cave } from './cave'
import { applyFx, matteCopy } from './materialFx'

export interface CaveModels {
  readonly rock: THREE.Object3D
  readonly gold: THREE.Object3D
  readonly brazier: THREE.Object3D
  readonly crystal: THREE.Object3D
}

/** The first mesh of a static model with its full transform baked in, re-centred on the ground. */
interface Piece {
  readonly geometry: THREE.BufferGeometry
  readonly material: THREE.MeshStandardMaterial
  /** Footprint width and height at scale 1. */
  readonly width: number
  readonly height: number
}

function piece(src: THREE.Object3D): Piece {
  src.updateMatrixWorld(true)
  let mesh: THREE.Mesh | null = null
  src.traverse((o) => {
    if (mesh === null && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
  })
  if (mesh === null) throw new Error('model has no mesh')
  const m = mesh as THREE.Mesh
  const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox as THREE.Box3
  const c = box.getCenter(new THREE.Vector3())
  geometry.translate(-c.x, -box.min.y, -c.z)
  geometry.computeBoundingBox()
  const size = (geometry.boundingBox as THREE.Box3).getSize(new THREE.Vector3())
  return { geometry, material: matteCopy(m.material as THREE.Material), width: Math.max(size.x, size.z), height: size.y }
}

function placed(p: Piece, mat: THREE.Material, x: number, z: number, width: number, yaw: number, squash = 1): THREE.Mesh {
  const m = new THREE.Mesh(p.geometry, mat)
  const k = width / p.width
  m.scale.set(k, k * squash, k)
  m.position.set(x, 0, z)
  m.rotation.y = yaw
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function instanced(p: Piece, mat: THREE.Material, list: readonly THREE.Matrix4[]): THREE.InstancedMesh {
  const inst = new THREE.InstancedMesh(p.geometry, mat, list.length)
  list.forEach((m, i) => inst.setMatrixAt(i, m))
  inst.castShadow = true
  inst.receiveShadow = true
  return inst
}

/**
 * Swaps the stand-in cave pieces for the Tripo models: crystal rock spires (the obstacles),
 * real treasure piles, the dragon's hoard bed, carved braziers and glowing crystal clusters.
 */
export function dressCave(scene: THREE.Scene, layout: Layout, cave: Cave, models: CaveModels): void {
  const rand = rngFrom(909)
  const rock = piece(models.rock)
  const gold = piece(models.gold)
  const brazier = piece(models.brazier)
  const crystal = piece(models.crystal)
  const parts = cave.parts

  // Obstacles: each rock spire gets its own material so it can fade when it hides the player.
  parts.pillarGroups.forEach((g) => scene.remove(g))
  cave.pillars = layout.pillars.map((c) => {
    const mat = rock.material.clone()
    mat.transparent = true
    scene.add(placed(rock, mat, c.x, c.z, c.r * 2.5, rand() * Math.PI * 2, 1.15))
    return { circle: c, materials: [mat] }
  })

  // Treasure piles where the noisy gold is, and the dragon's big bed in the middle.
  scene.remove(parts.heaps)
  scene.remove(parts.bed)
  const goldMat = gold.material
  goldMat.metalness = 0.35
  goldMat.roughness = 0.4
  goldMat.emissive = new THREE.Color(0x6a3a00)
  goldMat.emissiveIntensity = 0.25
  const piles = new THREE.Group()
  for (const c of layout.gold) piles.add(placed(gold, goldMat, c.x, c.z, c.r * 2.3, rand() * Math.PI * 2, 0.8))
  const bedMat = goldMat.clone()
  bedMat.emissiveIntensity = 0.08
  piles.add(placed(gold, bedMat, 0, -0.4, (CFG.dragonRadius + 1.6) * 2, 0.4, 0.45))
  scene.add(piles)

  // Edge spires replace the cone stalagmites; one draw call.
  scene.remove(parts.stalagmites)
  const spireMats: THREE.Matrix4[] = []
  const q = new THREE.Quaternion()
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2 + rand() * 0.2
    const r = CFG.arenaRadius + 2.6 + rand() * 3
    const w = 1.6 + rand() * 1.8
    const s = w / rock.width
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2)
    spireMats.push(new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(a) * r, -0.1, Math.cos(a) * r), q, new THREE.Vector3(s, s * (1 + rand() * 0.6), s)))
  }
  scene.add(instanced(rock, rock.material, spireMats))

  // Crystal clusters in the walls, glowing from inside.
  scene.remove(parts.crystals)
  const crystalMat = crystal.material
  crystalMat.emissive = new THREE.Color(0x6a3cff)
  crystalMat.emissiveMap = crystalMat.map
  crystalMat.emissiveIntensity = 0.9
  applyFx(crystalMat, { rim: 0x7ae8ff, rimStrength: 1.4 })
  const crystalMats: THREE.Matrix4[] = []
  for (let i = 0; i < NEST_COUNT; i++) {
    const gap = nestAngle(i) + Math.PI / NEST_COUNT
    for (let j = 0; j < 2; j++) {
      const a = gap + (j === 0 ? -0.12 : 0.18) + (rand() - 0.5) * 0.1
      const r = CFG.arenaRadius + 2.8 + rand() * 2.2
      const s = (1.6 + rand() * 1.4) / crystal.width
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2)
      crystalMats.push(new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(a) * r, -0.05, Math.cos(a) * r), q, new THREE.Vector3(s, s, s)))
    }
  }
  scene.add(instanced(crystal, crystalMat, crystalMats))

  // Braziers: the carved model under the existing flames and light.
  for (const g of parts.braziers) {
    g.children.filter((c) => c.userData.proc === true).forEach((c) => (c.visible = false))
    const m = placed(brazier, brazier.material, 0, 0, 1.7, rand() * Math.PI * 2)
    g.add(m)
    const top = (1.7 / brazier.width) * brazier.height
    g.children.forEach((c) => {
      if ((c as THREE.Sprite).isSprite) c.position.y += top - 1.95
      if ((c as THREE.PointLight).isPointLight) c.position.y = top + 0.6
    })
  }
}
