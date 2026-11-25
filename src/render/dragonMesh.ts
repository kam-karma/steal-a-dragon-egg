import * as THREE from 'three'
import { CFG } from '../sim/config'
import { angleDiff } from '../sim/world'
import type { DragonMode } from '../sim/types'

export interface DragonView {
  readonly mode: DragonMode
  readonly t: number
  readonly yaw: number
  readonly fire: boolean
  readonly noise: number
}

export interface DragonRig {
  readonly group: THREE.Group
  readonly update: (dt: number, time: number, v: DragonView) => void
  /** World position of the mouth and the direction it faces (for fire and Zzz). */
  readonly mouth: (pos: THREE.Vector3, dir: THREE.Vector3) => void
  readonly nostril: (pos: THREE.Vector3) => void
  /** Nose itches (2 s), then the big sneeze. */
  readonly itch: () => void
  readonly sneeze: () => void
  /** Dev only: live pose dials, where a rig has them. */
  readonly tune?: Record<string, number>
}

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true, ...extra })

// Emerald dragon: stands out against the gold and the warm light (red blended in).
const M = {
  body: std(0x1f9e7a),
  belly: std(0xf6d77a, { roughness: 0.7 }),
  horn: std(0xfff1d6, { roughness: 0.4 }),
  wing: std(0x7a3fbf, { side: THREE.DoubleSide, roughness: 0.75 }),
  dark: std(0x1c0b10),
  eye: std(0xffffff, { roughness: 0.2 }),
  iris: std(0xffb300, { emissive: 0xffa000, emissiveIntensity: 0.4 }),
}

function ball(r: number, mat: THREE.Material, sx = 1, sy = 1, sz = 1, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, Math.floor(seg * 0.7))), mat)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  return m
}

function cone(r: number, h: number, mat: THREE.Material, seg = 6): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat)
  m.castShadow = true
  return m
}

interface EyeParts {
  readonly lid: THREE.Mesh
  readonly baseY: number
}

function buildHead(): { head: THREE.Group; jaw: THREE.Group; eyes: EyeParts[] } {
  const head = new THREE.Group()
  head.add(ball(0.95, M.body, 1.05, 0.85, 1.1).translateY(0.15))
  head.add(ball(0.7, M.body, 0.95, 0.62, 1.25).translateY(-0.02).translateZ(0.95))
  for (const s of [-1, 1]) {
    head.add(ball(0.07, M.dark).translateX(s * 0.2).translateY(0.14).translateZ(1.78))
    const horn = cone(0.2, 1.25, M.horn)
    horn.position.set(s * 0.45, 0.85, -0.45)
    horn.rotation.set(-1.0, 0, s * -0.35)
    head.add(horn)
    const small = cone(0.12, 0.6, M.horn)
    small.position.set(s * 0.8, 0.45, -0.35)
    small.rotation.set(-1.2, 0, s * -0.9)
    head.add(small)
    const frill = cone(0.16, 0.7, M.wing)
    frill.position.set(s * 0.95, 0.05, -0.2)
    frill.rotation.set(-1.4, 0, s * -1.2)
    head.add(frill)
    head.add(ball(0.2, M.body, 1.4, 0.6, 1).translateX(s * 0.5).translateY(0.7).translateZ(0.5))
  }
  const eyes: EyeParts[] = []
  for (const s of [-1, 1]) {
    const eye = new THREE.Group()
    eye.position.set(s * 0.56, 0.42, 0.55)
    eye.add(ball(0.26, M.eye, 1, 1, 1, 12))
    const iris = ball(0.17, M.iris, 1, 1, 1, 12)
    iris.position.set(s * 0.1, 0, 0.13)
    eye.add(iris)
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), M.dark)
    pupil.position.set(s * 0.17, 0, 0.21)
    eye.add(pupil)
    const lid = ball(0.3, M.body, 1, 1, 1, 12)
    eye.scale.setScalar(1.25)
    eye.add(lid)
    head.add(eye)
    eyes.push({ lid, baseY: 0 })
  }
  const jaw = new THREE.Group()
  jaw.position.set(0, -0.28, 0.2)
  jaw.add(ball(0.6, M.belly, 0.85, 0.35, 1.25).translateY(-0.08).translateZ(0.8))
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const tooth = cone(0.06, 0.18, M.horn, 4)
      tooth.position.set(s * (0.3 - k * 0.07), 0.05, 1.1 + k * 0.25)
      jaw.add(tooth)
    }
  }
  head.add(jaw)
  return { head, jaw, eyes }
}

function wingShape(): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(3.4, 0.7)
  s.lineTo(3.9, -0.2)
  s.lineTo(2.9, -1.0)
  s.lineTo(2.0, -0.55)
  s.lineTo(1.2, -1.5)
  s.lineTo(0.5, -0.8)
  s.lineTo(0, -0.9)
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(Math.PI / 2)
  return g
}

function buildWing(side: number): THREE.Group {
  const pivot = new THREE.Group()
  pivot.position.set(side * 1.3, 2.7, 0.3)
  const inner = new THREE.Group()
  inner.scale.x = side
  const membrane = new THREE.Mesh(wingShape(), M.wing)
  membrane.castShadow = true
  inner.add(membrane)
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 3.5, 6), M.body)
  bone.rotation.z = -Math.PI / 2 + 0.2
  bone.position.set(1.7, 0, -0.35)
  bone.rotation.y = 0.2
  inner.add(bone)
  pivot.add(inner)
  return pivot
}

function bezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t
  return out.set(
    u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    u * u * a.z + 2 * u * t * b.z + t * t * c.z,
  )
}

export function createDragon(): DragonRig {
  const group = new THREE.Group()
  const torso = new THREE.Group()
  group.add(torso)
  const body = ball(1, M.body, 2.5, 1.65, 3.3, 22)
  body.position.set(0, 1.5, -0.6)
  torso.add(body)
  torso.add(ball(1, M.belly, 2.05, 1.2, 2.7, 18).translateY(1.05).translateZ(-0.1))
  torso.add(ball(1, M.body, 1.55, 1.45, 1.35, 16).translateY(1.95).translateZ(1.9))
  for (const s of [-1, 1]) {
    torso.add(ball(1, M.body, 0.55, 0.5, 0.85).translateX(s * 1.35).translateY(0.45).translateZ(1.9))
    torso.add(ball(1, M.body, 0.95, 0.95, 1.15).translateX(s * 1.85).translateY(0.85).translateZ(-1.7))
    for (let k = -1; k <= 1; k++) {
      const claw = cone(0.07, 0.3, M.horn, 4)
      claw.rotation.x = Math.PI / 2
      claw.position.set(s * 1.35 + k * 0.2, 0.12, 2.75)
      torso.add(claw)
    }
  }
  for (let k = 0; k < 7; k++) {
    const z = 1.4 - k * 0.75
    const y = 1.5 + 1.65 * Math.sqrt(Math.max(0, 1 - ((z + 0.6) / 3.3) ** 2))
    const spike = cone(0.26 - k * 0.015, 0.75, M.horn, 5)
    spike.position.set(0, y + 0.2, z)
    spike.rotation.x = -0.35
    torso.add(spike)
  }

  const wings = [buildWing(1), buildWing(-1)]
  wings.forEach((w) => torso.add(w))

  const tail = Array.from({ length: 13 }, (_, i) => {
    const seg = ball(1, M.body, 1, 1, 1, 12)
    torso.add(seg)
    if (i % 2 === 0 && i < 11) {
      const sp = cone(0.18 - i * 0.01, 0.45, M.horn, 4)
      seg.add(sp)
      sp.position.y = 0.9
    }
    return seg
  })
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), M.wing)
  tip.scale.set(1, 0.25, 1.5)
  tip.castShadow = true
  torso.add(tip)

  const neck = Array.from({ length: 6 }, () => {
    const seg = ball(1, M.body, 1, 1, 1, 14)
    torso.add(seg)
    return seg
  })
  const { head, jaw, eyes } = buildHead()
  // A big head and big eyes read as "dragon" from far away and look friendlier.
  head.scale.setScalar(1.35)
  torso.add(head)

  const mouthLight = new THREE.PointLight(0xff6a1a, 0, 18, 1.5)
  mouthLight.position.set(0, -0.1, 2.0)
  head.add(mouthLight)

  let awake = 0
  let open = 0
  let itchT = 0
  let sneezeT = 0
  let lash = 0
  const base = new THREE.Vector3(0, 2.35, 2.5)
  const headSleep = new THREE.Vector3(0.5, 1.25, 5.3)
  const headWake = new THREE.Vector3(0, 5.3, 4.5)
  const ctrlSleep = new THREE.Vector3(0.3, 2.2, 4.2)
  const ctrlWake = new THREE.Vector3(0, 4.0, 3.2)
  const hp = new THREE.Vector3()
  const cp = new THREE.Vector3()
  const tmp = new THREE.Vector3()

  function update(dt: number, time: number, v: DragonView): void {
    const target = v.mode === 'wake' || v.mode === 'hunt' ? 1 : v.mode === 'stir' ? 0.14 : 0
    const rate = target > awake ? 6 : 1.8
    awake += (target - awake) * (1 - Math.exp(-dt * rate))

    const sleepy = v.mode === 'sleep' ? Math.min(0.3, (v.noise / CFG.stirAt) * 0.3) : 0
    const eyeTarget =
      v.mode === 'wake' || v.mode === 'hunt' ? 1 : v.mode === 'stir' ? 0.45 + 0.12 * Math.sin(time * 4) : v.mode === 'settle' ? 0.2 : sleepy
    open += (eyeTarget - open) * (1 - Math.exp(-dt * 8))
    eyes.forEach((e) => {
      e.lid.scale.set(1.04, THREE.MathUtils.lerp(1, 0.22, open), 1.04)
      e.lid.position.y = e.baseY + THREE.MathUtils.lerp(0, 0.24, open)
    })
    M.iris.emissiveIntensity = 0.4 + awake * 3.2

    // Turn the whole dragon toward its target while awake.
    if (awake > 0.3) group.rotation.y += angleDiff(v.yaw, group.rotation.y) * (1 - Math.exp(-dt * 4))

    const breath = Math.sin(time * ((Math.PI * 2) / (3.4 - awake * 2)))
    body.scale.set(2.5 + breath * 0.07, 1.65 + breath * 0.09, 3.3)

    hp.lerpVectors(headSleep, headWake, awake)
    cp.lerpVectors(ctrlSleep, ctrlWake, awake)
    if (v.mode === 'wake') hp.y += Math.sin(Math.min(1, v.t / CFG.wakeTime) * Math.PI) * 0.6
    neck.forEach((seg, i) => {
      const t = (i + 0.5) / neck.length
      bezier(base, cp, hp, t * 0.92, tmp)
      seg.position.copy(tmp)
      const r = 0.95 - t * 0.35
      seg.scale.set(r, r, r * 1.15)
    })
    head.position.copy(hp)
    const pitch = v.fire ? 0.38 : THREE.MathUtils.lerp(0.12, -0.1, awake)
    head.rotation.set(pitch, (1 - awake) * 0.25, (1 - awake) * 0.18)

    // Itch: the head twitches. Sneeze: it rears back, then snaps forward.
    itchT = Math.max(0, itchT - dt)
    sneezeT = Math.max(0, sneezeT - dt)
    if (itchT > 0) head.rotation.z += Math.sin(time * 40) * 0.05
    if (sneezeT > 0) {
      const k = 1 - sneezeT / 0.8
      head.rotation.x += k < 0.55 ? (-0.6 * k) / 0.55 : -0.6 + (1.2 * (k - 0.55)) / 0.45
      head.position.y += k < 0.55 ? (0.8 * k) / 0.55 : 0.8 * (1 - (k - 0.55) / 0.45)
    }
    const roar = (v.mode === 'wake' && v.t > 0.35) || sneezeT > 0.2 ? 1 : 0
    const jawTarget = v.fire ? 1 : roar ? 0.9 : 0.05 + Math.max(0, breath) * 0.05
    jaw.rotation.x += (jawTarget * 0.65 - jaw.rotation.x) * (1 - Math.exp(-dt * 12))
    mouthLight.intensity = v.fire ? 35 + Math.random() * 25 : 0

    wings.forEach((w, i) => {
      const s = i === 0 ? 1 : -1
      const flap = awake > 0.5 ? Math.sin(time * 7) * 0.28 * awake : 0
      w.rotation.set(0, s * THREE.MathUtils.lerp(1.3, 0.2, awake), s * (THREE.MathUtils.lerp(0.35, 0.6, awake) + flap))
    })

    lash += dt * (1.2 + awake * 4)
    tail.forEach((seg, i) => {
      const t = i / (tail.length - 1)
      const phi = Math.PI - t * 2.3 + Math.sin(lash + t * 3) * (0.04 + awake * 0.22) * t
      const r = 3.6 + t * 0.7
      seg.position.set(Math.sin(phi) * r, 1.0 - t * 0.68, Math.cos(phi) * r - 0.4)
      const rad = 0.9 - t * 0.62
      seg.scale.set(rad, rad, rad)
    })
    const last = tail[tail.length - 1].position
    const prev = tail[tail.length - 2].position
    tip.position.copy(last).addScaledVector(tmp.subVectors(last, prev).normalize(), 0.5)
    tip.rotation.y = Math.atan2(last.x - prev.x, last.z - prev.z)
  }

  function mouth(pos: THREE.Vector3, dir: THREE.Vector3): void {
    head.updateWorldMatrix(true, false)
    pos.set(0, -0.15, 1.9).applyMatrix4(head.matrixWorld)
    dir.set(0, 0, 1).transformDirection(head.matrixWorld)
  }

  function nostril(pos: THREE.Vector3): void {
    head.updateWorldMatrix(true, false)
    pos.set(0, 0.3, 1.8).applyMatrix4(head.matrixWorld)
  }

  return { group, update, mouth, nostril, itch: () => (itchT = 2), sneeze: () => (sneezeT = 0.8) }
}
