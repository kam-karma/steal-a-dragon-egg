import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { angleDiff } from '../sim/world'
import type { DragonRig, DragonView } from './dragonMesh'
import { RESTING, stepAct, type DragonAct } from './dragonAct'
import { applyDragonSkin, type DragonSkin, type EyeSpots } from './dragonSkin'
import { matteCopy, prepareMeshes } from './materialFx'

/** Nose to tail, in metres: the dragon is as big as its hoard. */
const LENGTH = 11

interface Rest {
  readonly q: THREE.Quaternion
  readonly p: THREE.Vector3
  readonly s: THREE.Vector3
}

/**
 * Pose angles in radians, about the dragon's own axes. f0..f3 / h0..h4 bend each front and
 * hind leg bone (top to paw) when lying down; drop is how far the body sinks then.
 */
const POSE = {
  f0: 0.9,
  f1: -1.6,
  f2: 0.7,
  f3: 0,
  h0: -0.9,
  h1: 1.7,
  h2: -0.9,
  h3: 0,
  h4: 0,
  drop: 1.1,
  neckLie: 0.35,
  neckTurn: 0.22,
  neckUp: 0.25,
  neckRear: 0.45,
  neckLunge: 0.4,
  headLie: 0.15,
  headRear: 0.2,
  headLunge: 0.15,
  jaw: 0.5,
  wingBack: 0.35,
  wingStand: 0.5,
  wingRear: 0.6,
  wingFold: 0.1,
}

/** Where the eyes are painted, in the dragon mesh's own position space (found by raycasting). */
const EYES: EyeSpots = {
  left: new THREE.Vector3(0.7776, 0.3932, 0.1833),
  right: new THREE.Vector3(0.6778, 0.3659, 0.598),
  size: new THREE.Vector2(0.12, 0.07),
}

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const qa = new THREE.Quaternion()
const qb = new THREE.Quaternion()
const qd = new THREE.Quaternion()
const axisW = new THREE.Vector3()

/**
 * The Tripo red dragon. Tripo's quadruped rig has no animation library, so poses are
 * procedural: every frame the bones go back to rest, then turn about axes in the dragon's
 * own frame (x = its left, y = up, z = forward).
 */
export function createDragonTripo(gltf: GLTF): DragonRig {
  const group = new THREE.Group()
  const holder = new THREE.Group()
  group.add(holder)
  const model = gltf.scene
  const skins: DragonSkin[] = []
  prepareMeshes(model, true)
  model.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mat = matteCopy(m.material as THREE.Material)
    mat.roughness = 0.42
    m.geometry.computeBoundingBox()
    const bs = (m.geometry.boundingBox as THREE.Box3).getSize(new THREE.Vector3())
    skins.push(applyDragonSkin(mat, Math.max(bs.x, bs.y, bs.z), EYES))
    m.material = mat
  })
  holder.add(model)
  // Dev tools reach the eye spots here to line the painted lids up with the eyes.
  group.userData.eyes = EYES

  const bones = new Map<string, THREE.Bone>()
  const rest = new Map<THREE.Bone, Rest>()
  model.traverse((o) => {
    const b = o as THREE.Bone
    if (!b.isBone) return
    // GLTFLoader drops ':' from node names, so 'tripo::Head_0' arrives as 'tripoHead_0'.
    bones.set(b.name.replace(/^tripo[:_]*/, ''), b)
    rest.set(b, { q: b.quaternion.clone(), p: b.position.clone(), s: b.scale.clone() })
  })
  const bone = (n: string): THREE.Bone | undefined => bones.get(n)
  const head0 = bone('Head_0')
  const head1 = bone('Head_1')
  const head2 = bone('Head_2')
  const spine0 = bone('Spine_0')
  const tail = ['Spine_2', 'Spine_3', 'Spine_4', 'Spine_5'].map(bone).filter((b): b is THREE.Bone => b !== undefined)
  const wings = ['bone_18', 'bone_20'].map(bone).filter((b): b is THREE.Bone => b !== undefined)
  const legs = { front: legChains(bones, '0_'), hind: legChains(bones, '1_') }

  // Face +z: the model came out of a three-quarter concept, so measure where its head points.
  model.updateMatrixWorld(true)
  const headP = new THREE.Vector3()
  const tailP = new THREE.Vector3()
  head2?.getWorldPosition(headP)
  tail[tail.length - 1]?.getWorldPosition(tailP)
  const fwd = headP.clone().sub(tailP).setY(0).normalize()
  model.rotation.y = -Math.atan2(fwd.x, fwd.z)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  model.scale.multiplyScalar(LENGTH / Math.max(size.z, size.x, 1e-6))
  model.updateMatrixWorld(true)
  const box2 = new THREE.Box3().setFromObject(model)
  const c = box2.getCenter(new THREE.Vector3())
  model.position.sub(new THREE.Vector3(c.x, box2.min.y, c.z))
  holder.position.set(0, 0.55, -0.6)
  // The snout tip, kept in the head bone's own space so fire always leaves the nose.
  group.updateMatrixWorld(true)
  const snoutLocal = new THREE.Vector3(0, 0, 0)
  if (head2 !== undefined) {
    const v = new THREE.Vector3()
    let best = -Infinity
    model.traverse((o) => {
      const sm = o as THREE.SkinnedMesh
      if (!sm.isSkinnedMesh) return
      const pos = sm.geometry.getAttribute('position')
      for (let i = 0; i < pos.count; i += 3) {
        sm.getVertexPosition(i, v)
        sm.localToWorld(v)
        if (v.z > best) {
          best = v.z
          snoutLocal.copy(v)
        }
      }
    })
    head2.worldToLocal(snoutLocal)
  }
  // Which side each wing sits on, in the dragon's frame.
  const wingSide = wings.map((w) => {
    const p = w.getWorldPosition(new THREE.Vector3())
    group.worldToLocal(p)
    return Math.sign(p.x) || 1
  })

  /** Rotate a bone about an axis given in the dragon's frame. */
  function turn(b: THREE.Bone | undefined, axis: THREE.Vector3, angle: number): void {
    if (b === undefined || angle === 0) return
    group.getWorldQuaternion(qa)
    axisW.copy(axis).applyQuaternion(qa).normalize()
    b.updateWorldMatrix(true, false)
    b.getWorldQuaternion(qb)
    qd.setFromAxisAngle(axisW, angle)
    b.parent?.getWorldQuaternion(qa)
    b.quaternion.copy(qa.invert().multiply(qd.multiply(qb)))
  }

  const mouthLight = new THREE.PointLight(0xff6a1a, 0, 18, 1.5)
  group.add(mouthLight)
  // A cool rim light from behind separates the red dragon from the orange gold.
  const rim = new THREE.SpotLight(0x8fb4ff, 60, 30, 0.7, 0.6, 1.2)
  rim.position.set(0, 9, -10)
  rim.target.position.set(0, 1.5, 0)
  group.add(rim, rim.target)

  /** Pose dials; dev tools can change them live through `tune` while tuning poses. */
  const tune: Record<string, number> = { ...POSE }
  let act: DragonAct = RESTING
  let itchT = 0
  let sneezeT = 0
  const tmp2 = new THREE.Vector3()

  function update(dt: number, time: number, v: DragonView): void {
    act = stepAct(act, v, dt, time)
    const P = tune
    const stand = act.stand
    const lie = 1 - stand
    const awake = Math.max(stand, act.alert)
    itchT = Math.max(0, itchT - dt)
    sneezeT = Math.max(0, sneezeT - dt)
    const k = sneezeT > 0 ? 1 - sneezeT / 0.8 : 0
    const sneeze = sneezeT > 0 ? (k < 0.55 ? (-0.5 * k) / 0.55 : -0.5 + (1.0 * (k - 0.55)) / 0.45) : 0
    const period = 3.6 - awake * 2
    const breath = Math.sin(time * ((Math.PI * 2) / period))
    const snore = Math.max(0, breath) * lie
    for (const [b, r] of rest) {
      b.quaternion.copy(r.q)
      b.position.copy(r.p)
      b.scale.copy(r.s)
    }
    // Legs: folded under the body when lying, straight when standing.
    legs.front.forEach((chain) => chain.forEach((b, i) => turn(b, X, (P[`f${i}`] ?? 0) * lie)))
    legs.hind.forEach((chain) => chain.forEach((b, i) => turn(b, X, (P[`h${i}`] ?? 0) * lie)))
    // Neck and head. Lying: chin on the gold, turned aside, lifting with each snore.
    // Alert: head up, looking round. Roar: reared back. Fire: thrust forward and down.
    const look = Math.sin(time * 0.9) * 0.35 * act.alert * (1 - act.lunge)
    const itch = itchT > 0 ? Math.sin(time * 40) * 0.05 : 0
    turn(head0, X, P.neckLie * lie - P.neckUp * act.alert - P.neckRear * act.rear + P.neckLunge * act.lunge - snore * 0.08 + sneeze + itch)
    turn(head0, Y, P.neckTurn * lie * (1 - act.alert) + look)
    turn(head1, X, P.headLie * lie - P.headRear * act.rear - P.headLunge * act.lunge + breath * 0.02)
    turn(head2, X, P.jaw * act.jaw + snore * 0.04 + (act.lunge > 0.5 ? Math.sin(time * 30) * 0.04 : 0))
    // Tail: curled round the body lying down; lashing when awake.
    tail.forEach((b, i) => turn(b, Y, (0.32 * lie + Math.sin(time * (1 + awake * 4) - i * 0.7) * (0.06 + awake * 0.2)) * (i === 0 ? 0.5 : 1)))
    // Wings: swept back clear of the horns (their tips almost touch at rest), folded flat
    // lying down, half open standing, flung wide for the roar.
    const twitch = lie * Math.max(0, Math.sin(time * 0.7) - 0.85) * 1.2
    const spread = P.wingStand * stand + P.wingRear * act.rear + Math.sin(time * 5) * 0.1 * stand + twitch - P.wingFold * lie
    wings.forEach((w, i) => {
      turn(w, X, -(P.wingBack + 0.15 * stand))
      turn(w, Z, wingSide[i] * spread)
    })
    // Body: breathes; sinks into the gold lying down; rises standing; leans into the fire.
    if (spine0 !== undefined) spine0.scale.multiplyScalar(1 + breath * (0.035 + awake * 0.02))
    holder.position.y = 0.55 - P.drop * lie + breath * 0.04 * lie
    holder.rotation.x = -0.1 * act.rear + 0.06 * act.lunge
    if (stand > 0.3) group.rotation.y += angleDiff(v.yaw, group.rotation.y) * (1 - Math.exp(-dt * 4))
    for (const sk of skins) {
      sk.time.value = time
      sk.anger.value = stand
      sk.lidL.value = act.lidL
      sk.lidR.value = act.lidR
    }
    mouthLight.intensity = v.fire ? 35 + Math.random() * 25 : 0
    if (head2 !== undefined) {
      const p = new THREE.Vector3()
      const d = new THREE.Vector3()
      mouth(p, d)
      group.worldToLocal(mouthLight.position.copy(p))
    }
  }

  function mouth(pos: THREE.Vector3, dir: THREE.Vector3): void {
    if (head2 === undefined) {
      pos.set(0, 3, 4)
      dir.set(0, 0, 1)
      return
    }
    group.updateWorldMatrix(true, true)
    head2.getWorldPosition(tmp2)
    pos.copy(snoutLocal)
    head2.localToWorld(pos)
    dir.subVectors(pos, tmp2).normalize()
    pos.addScaledVector(dir, 0.25)
    pos.y -= 0.2
  }

  function nostril(pos: THREE.Vector3): void {
    const dir = new THREE.Vector3()
    mouth(pos, dir)
    pos.y += 0.3
  }

  return { group, update, mouth, nostril, itch: () => (itchT = 2), sneeze: () => (sneezeT = 0.8), tune }
}

/** Each leg's bones from hip to paw, e.g. '1_Left_Limb_0' .. '1_Left_Limb_4'. */
function legChains(bones: Map<string, THREE.Bone>, prefix: string): THREE.Bone[][] {
  return ['Left', 'Right'].map((side) =>
    [...bones.entries()]
      .filter(([n]) => n.startsWith(`${prefix}${side}_Limb_`))
      .sort(([a], [b]) => Number(a.split('_').pop()) - Number(b.split('_').pop()))
      .map(([, b]) => b),
  )
}
