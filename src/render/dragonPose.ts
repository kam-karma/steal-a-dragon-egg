import * as THREE from 'three'

/**
 * Procedural poses for the red dragon model (its own clips are single-frame
 * flight poses). Every frame: reset bones to the model's rest pose, then add
 * world-space offsets. The model's head points -z; the game turns it around.
 */
export interface DragonPose {
  /** 0 = awake/standing tall, 1 = curled up asleep. */
  readonly sleep: number
  /** 0 = wings folded on the back, 1 = spread wide (roar). */
  readonly wings: number
  readonly jaw: number
  /** 0 = eyes shut, 1 = wide open. */
  readonly eyes: number
  /** -1..1 sideways tail swish. */
  readonly tail: number
  /** -1..1 breathing. */
  readonly breath: number
  /** Extra head pitch (sneeze, roar), radians, + = up. */
  readonly headPitch: number
}

interface Rest {
  readonly q: THREE.Quaternion
  readonly p: THREE.Vector3
  readonly s: THREE.Vector3
}

export interface DragonRigBones {
  readonly all: ReadonlyMap<string, THREE.Bone>
  readonly rest: ReadonlyMap<THREE.Bone, Rest>
}

const strip = (n: string): string => n.replace(/_\d+$/, '')

export function findBones(root: THREE.Object3D): DragonRigBones {
  const all = new Map<string, THREE.Bone>()
  const rest = new Map<THREE.Bone, Rest>()
  root.traverse((o) => {
    const b = o as THREE.Bone
    if (!b.isBone) return
    all.set(strip(b.name), b)
    rest.set(b, { q: b.quaternion.clone(), p: b.position.clone(), s: b.scale.clone() })
  })
  return { all, rest }
}

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const tmpQ = new THREE.Quaternion()
const tmpQ2 = new THREE.Quaternion()
const tmpD = new THREE.Quaternion()
const tmpV = new THREE.Vector3()

/** Rotate a bone about a world axis (applied on top of whatever it has now). */
function turn(b: THREE.Bone | undefined, axis: THREE.Vector3, angle: number): void {
  if (b === undefined || angle === 0) return
  b.updateWorldMatrix(true, false)
  b.getWorldQuaternion(tmpQ)
  tmpD.setFromAxisAngle(axis, angle)
  b.parent?.getWorldQuaternion(tmpQ2)
  b.quaternion.copy(tmpQ2.invert().multiply(tmpD.multiply(tmpQ)))
}

/** Move a bone to a world position (blended with t). */
function place(b: THREE.Bone | undefined, x: number, y: number, z: number, t: number): void {
  if (b === undefined || b.parent === null) return
  b.parent.updateWorldMatrix(true, false)
  tmpV.set(x, y, z)
  b.parent.worldToLocal(tmpV)
  b.position.lerp(tmpV, t)
}

function chain(bones: ReadonlyMap<string, THREE.Bone>, prefix: string, count: number): THREE.Bone[] {
  return Array.from({ length: count }, (_, i) => bones.get(`${prefix}${i + 1}`)).filter((b): b is THREE.Bone => b !== undefined)
}

export function applyPose(rig: DragonRigBones, p: DragonPose): void {
  for (const [b, r] of rig.rest) {
    b.quaternion.copy(r.q)
    b.position.copy(r.p)
    b.scale.copy(r.s)
  }
  const g = rig.all
  const fold = 1 - p.wings
  // Wings: swing the finger fans back along the body and tuck them in.
  for (const [side, s] of [['L', -1], ['R', 1]] as const) {
    const hand = g.get(`wingHand${side}`)
    turn(hand, Y, -s * 1.45 * fold)
    turn(hand, Z, s * 0.25 * fold + s * 0.55 * p.wings)
    place(hand, s * 0.2, 0.38 + p.wings * 0.25, -0.12, fold)
    turn(g.get(`upperWing${side}`), Z, s * 0.9 * fold)
  }
  // Awake: the front of the body rears up.
  turn(g.get('chest'), X, 0.35 * (1 - p.sleep))
  // Neck and head: sleeping = laid down and turned a little to the side.
  const neck = chain(g, 'neck', 5)
  neck.forEach((b) => {
    turn(b, X, -0.09 * p.sleep + 0.06 * (1 - p.sleep))
    turn(b, Y, 0.1 * p.sleep)
  })
  turn(g.get('head'), X, -0.25 * p.sleep + p.headPitch)
  turn(g.get('jaw'), X, -p.jaw * 0.7)
  // Eyelids close by sliding down over the eye.
  for (const side of ['L', 'R']) {
    turn(g.get(`eyelidUpper${side}`), X, (1 - p.eyes) * -0.9)
    turn(g.get(`eyelidLower${side}`), X, (1 - p.eyes) * 0.5)
  }
  // Tail curls around the body when asleep and swishes when awake.
  chain(g, 'tail', 14).forEach((b, i) => {
    turn(b, Y, (0.27 * p.sleep + p.tail * 0.06) * (i < 2 ? 0.3 : 1))
  })
  // Breathing: the chest rises and falls.
  const chest = g.get('chest')
  if (chest !== undefined) chest.scale.multiplyScalar(1 + p.breath * 0.04)
}

export const SLEEP_POSE: DragonPose = { sleep: 1, wings: 0, jaw: 0.05, eyes: 0, tail: 0, breath: 0, headPitch: 0 }
export const AWAKE_POSE: DragonPose = { sleep: 0, wings: 0.8, jaw: 0, eyes: 1, tail: 0, breath: 0, headPitch: 0.3 }
