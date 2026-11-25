import * as THREE from 'three'
import { CFG } from '../sim/config'
import { rngFrom } from '../sim/rng'
import type { Circle, Layout } from '../sim/types'
import { type CaveFx, buildDecor, type DecorParts, CRYSTAL_COLORS, crystalCluster, crystalMaterial } from './caveDecor'

export const GOLD = new THREE.MeshStandardMaterial({
  color: 0xffc23a,
  metalness: 0.85,
  roughness: 0.42,
  emissive: 0x6a3400,
  emissiveIntensity: 0.22,
  flatShading: true,
})

function jitter(geo: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const rand = rngFrom(seed)
  const pos = geo.getAttribute('position')
  const seen = new Map<string, [number, number, number]>()
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    let off = seen.get(key)
    if (off === undefined) {
      off = [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]
      seen.set(key, off)
    }
    pos.setXYZ(i, pos.getX(i) + off[0], pos.getY(i) + off[1], pos.getZ(i) + off[2])
  }
  geo.computeVertexNormals()
  return geo
}

function loadTex(url: string, repeatX: number, repeatY: number): THREE.Texture {
  const t = new THREE.TextureLoader().load(url)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.anisotropy = 8
  return t
}

/** Painted flagstones, warm near the hoard and darker toward the edge (vertex colours). */
function floor(): THREE.Mesh {
  const R = CFG.arenaRadius + 7
  const geo = new THREE.RingGeometry(0.01, R, 96, 10)
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const warm = new THREE.Color(0xfff0d8)
  const edge = new THREE.Color(0x6a5a80)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getY(i)) / R
    c.copy(warm).lerp(edge, THREE.MathUtils.smoothstep(d, 0.25, 1))
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.rotateX(-Math.PI / 2)
  const map = loadTex('./tex/floor.webp', R / 4.5, R / 4.5)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.88, bumpMap: map, bumpScale: 1.2 }))
  mesh.receiveShadow = true
  return mesh
}

function walls(rock: THREE.Texture): THREE.Mesh {
  const geo = jitter(new THREE.CylinderGeometry(CFG.arenaRadius + 4, CFG.arenaRadius + 9, 18, 72, 6, true), 2.2, 5)
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.clamp(1 - (pos.getY(i) + 9) / 18, 0.12, 1)
    colors.set([k, k * 0.95, k * 1.05], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const wall = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: rock, vertexColors: true, roughness: 1, flatShading: true, side: THREE.BackSide }))
  wall.position.y = 7
  return wall
}

export interface PillarView {
  readonly circle: Circle
  readonly materials: readonly THREE.Material[]
}

function boulder(radius: [number, number, number], seed: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(1, 1), 0.32, seed), mat)
  m.scale.set(...radius)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** A chunky stack of boulders with a crystal cluster growing out of it (the key-art look). */
function pillar(c: Circle, seed: number, rockMat: THREE.MeshStandardMaterial, crystalMat: THREE.MeshStandardMaterial): THREE.Group {
  const rand = rngFrom(seed)
  const g = new THREE.Group()
  const h = 3.2 + rand() * 1.8
  const base = boulder([c.r * 1.12, c.r * 0.7, c.r * 1.12], seed, rockMat)
  base.position.y = c.r * 0.3
  const mid = boulder([c.r * 0.86, h * 0.36, c.r * 0.86], seed + 1, rockMat)
  mid.position.set((rand() - 0.5) * 0.3, h * 0.42, (rand() - 0.5) * 0.3)
  mid.rotation.y = rand() * 3
  const top = boulder([c.r * 0.55, h * 0.26, c.r * 0.55], seed + 2, rockMat)
  top.position.set((rand() - 0.5) * 0.4, h * 0.78, (rand() - 0.5) * 0.4)
  const pebble = boulder([c.r * 0.38, c.r * 0.3, c.r * 0.38], seed + 3, rockMat)
  const pa = rand() * Math.PI * 2
  pebble.position.set(Math.sin(pa) * c.r * 1.05, c.r * 0.12, Math.cos(pa) * c.r * 1.05)
  g.add(base, mid, top, pebble)
  const cluster = crystalCluster(seed + 9, 0.55 + c.r * 0.25, crystalMat)
  const ca = rand() * Math.PI * 2
  cluster.position.set(Math.sin(ca) * c.r * 0.55, h * 0.55, Math.cos(ca) * c.r * 0.55)
  cluster.rotation.set(Math.cos(ca) * 0.5, 0, -Math.sin(ca) * 0.5)
  g.add(cluster)
  g.position.set(c.x, 0, c.z)
  return g
}

/** A mound of coins: solid gold dome plus instanced coins scattered on its surface. */
function heaps(list: readonly Circle[]): THREE.Group {
  const g = new THREE.Group()
  const rand = rngFrom(33)
  const coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.045, 10)
  const total = list.reduce((s, c) => s + Math.floor(c.r * c.r * 34), 0)
  const coins = new THREE.InstancedMesh(coinGeo, GOLD, total)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  let n = 0
  for (const c of list) {
    const height = 0.28 + c.r * 0.16
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), GOLD)
    dome.scale.set(c.r * 0.92, height, c.r * 0.92)
    dome.position.set(c.x, -0.02, c.z)
    dome.receiveShadow = true
    g.add(dome)
    const count = Math.floor(c.r * c.r * 34)
    for (let k = 0; k < count; k++) {
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand()) * c.r
      const y = height * Math.sqrt(Math.max(0, 1 - (d / (c.r * 0.92)) ** 2))
      e.set((rand() - 0.5) * 1.1, rand() * 3, (rand() - 0.5) * 1.1)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(c.x + Math.sin(a) * d, y + 0.02, c.z + Math.cos(a) * d), q, new THREE.Vector3(1, 1, 1))
      coins.setMatrixAt(n++, m)
    }
  }
  coins.count = n
  g.add(coins)
  // A few gems and goblets so it reads as "treasure", not "yellow blobs".
  const gemColors = [0xff3b6b, 0x3bc3ff, 0x5dff8a, 0xd36bff]
  for (let k = 0; k < 18; k++) {
    const c = list[Math.floor(rand() * list.length)]
    const col = gemColors[k % gemColors.length]
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.15, flatShading: true }),
    )
    const a = rand() * Math.PI * 2
    const d = rand() * c.r * 0.6
    gem.position.set(c.x + Math.sin(a) * d, 0.3 + c.r * 0.12, c.z + Math.cos(a) * d)
    gem.rotation.set(rand(), rand(), rand())
    g.add(gem)
  }
  return g
}

/** The dragon's own bed: a big heap under its body (visual only), covered in loose coins. */
function bed(): THREE.Group {
  const g = new THREE.Group()
  // Duller than the coin heaps so the dragon on top stays readable.
  const bedGold = GOLD.clone()
  bedGold.emissiveIntensity = 0.04
  bedGold.roughness = 0.55
  bedGold.color.setHex(0xd99a2a)
  const R = CFG.dragonRadius + 1.4
  const H = 0.9
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), bedGold)
  dome.scale.set(R, H, R)
  dome.receiveShadow = true
  g.add(dome)
  const rand = rngFrom(55)
  const count = 1400
  const coinGold = GOLD.clone()
  coinGold.emissiveIntensity = 0.06
  coinGold.roughness = 0.5
  coinGold.color.setHex(0xe8a832)
  const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), coinGold, count)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const p = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  for (let k = 0; k < count; k++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * R * 1.04
    const y = H * Math.sqrt(Math.max(0, 1 - (d / R) ** 2))
    e.set((rand() - 0.5) * 1.2, rand() * 3, (rand() - 0.5) * 1.2)
    q.setFromEuler(e)
    coins.setMatrixAt(k, m.compose(p.set(Math.sin(a) * d, y + 0.02, Math.cos(a) * d), q, one))
  }
  coins.receiveShadow = true
  g.add(coins)
  return g
}

export interface Cave {
  /** Replaced when the Tripo rocks arrive (see dressCave). */
  pillars: readonly PillarView[]
  readonly fx: CaveFx
  readonly parts: CaveParts
}

/** Stand-in pieces that dressCave swaps for Tripo models. */
export interface CaveParts extends DecorParts {
  readonly bed: THREE.Object3D
  readonly heaps: THREE.Object3D
  readonly pillarGroups: readonly THREE.Object3D[]
}

export function buildCave(scene: THREE.Scene, layout: Layout): Cave {
  const rockTex = loadTex('./tex/rock.webp', 14, 2)
  const decorRock = new THREE.MeshStandardMaterial({ map: loadTex('./tex/rock.webp', 1, 1), color: 0xf0e2ff, emissive: 0x2a1840, emissiveIntensity: 0.5, roughness: 0.9, flatShading: true })
  scene.add(floor())
  scene.add(walls(rockTex))
  const bedMesh = bed()
  scene.add(bedMesh)
  const heapGroup = heaps(layout.gold)
  scene.add(heapGroup)
  const decor = buildDecor(scene, decorRock)
  const pillarGroups: THREE.Object3D[] = []
  const pillars = layout.pillars.map((c, i) => {
    const rockMat = decorRock.clone()
    rockMat.transparent = true
    const crystalMat = crystalMaterial(CRYSTAL_COLORS[i % CRYSTAL_COLORS.length])
    crystalMat.transparent = true
    const g = pillar(c, 100 + i, rockMat, crystalMat)
    scene.add(g)
    pillarGroups.push(g)
    return { circle: c, materials: [rockMat, crystalMat] }
  })
  return { pillars, fx: decor.fx, parts: { ...decor.parts, bed: bedMesh, heaps: heapGroup, pillarGroups } }
}

/** Rocks between the camera and the player turn see-through, so a kid never loses their thief. */
export function fadePillars(pillars: readonly PillarView[], cam: THREE.Vector3, player: THREE.Vector3, dt: number): void {
  const dx = player.x - cam.x
  const dz = player.z - cam.z
  const len2 = dx * dx + dz * dz || 1
  for (const p of pillars) {
    const t = ((p.circle.x - cam.x) * dx + (p.circle.z - cam.z) * dz) / len2
    const px = cam.x + dx * t - p.circle.x
    const pz = cam.z + dz * t - p.circle.z
    const hides = t > 0 && t < 1.05 && Math.hypot(px, pz) < p.circle.r + 1.1
    const target = hides ? 0.28 : 1
    for (const m of p.materials) {
      m.opacity += (target - m.opacity) * (1 - Math.exp(-dt * 10))
      m.depthWrite = m.opacity > 0.95
    }
  }
}
