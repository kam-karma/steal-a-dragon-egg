import * as THREE from 'three'
import { glowTexture, letterTexture, starTexture } from './textures'

type Kind = 'fire' | 'smoke' | 'glint' | 'z' | 'confetti'

interface P {
  sprite: THREE.Sprite
  kind: Kind
  vel: THREE.Vector3
  life: number
  max: number
  size: number
  color: THREE.Color
}

export interface Particles {
  /** A puff of flame travelling `reach` metres along `dir`, as wide as the burn cone. */
  readonly fire: (from: THREE.Vector3, dir: THREE.Vector3, reach?: number) => void
  readonly zzz: (from: THREE.Vector3) => void
  readonly glint: (at: THREE.Vector3) => void
  readonly burst: (at: THREE.Vector3, color: number, count: number) => void
  readonly smoke: (at: THREE.Vector3) => void
  readonly update: (dt: number) => void
}

const FIRE_HOT = new THREE.Color(0xfff1a0)
const FIRE_MID = new THREE.Color(0xff7a1a)
const FIRE_END = new THREE.Color(0x6b1a10)

/** One pooled sprite system for fire, snore Zs, gold glints and hatch confetti. */
export function createParticles(scene: THREE.Scene, size = 420): Particles {
  const tex = { glow: glowTexture(), star: starTexture(), z: letterTexture('Z', '#cfe8ff') }
  const pool: P[] = Array.from({ length: size }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, transparent: true, depthWrite: false }))
    sprite.visible = false
    scene.add(sprite)
    return { sprite, kind: 'fire', vel: new THREE.Vector3(), life: 0, max: 1, size: 1, color: new THREE.Color() }
  })
  let cursor = 0

  function take(kind: Kind, at: THREE.Vector3, life: number, sizeV: number): P {
    const p = pool[cursor]
    cursor = (cursor + 1) % pool.length
    p.kind = kind
    p.life = life
    p.max = life
    p.size = sizeV
    p.sprite.visible = true
    p.sprite.position.copy(at)
    const m = p.sprite.material
    m.map = kind === 'z' ? tex.z : kind === 'glint' || kind === 'confetti' ? tex.star : tex.glow
    m.blending = kind === 'fire' || kind === 'glint' ? THREE.AdditiveBlending : THREE.NormalBlending
    m.needsUpdate = true
    return p
  }

  const side = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)

  function fire(from: THREE.Vector3, dir: THREE.Vector3, reach = 14): void {
    side.crossVectors(dir, up).normalize()
    for (let k = 0; k < 7; k++) {
      const life = 0.8 + Math.random() * 0.12
      const p = take('fire', from, life, 0.75)
      // Flames slow down (vel *= 1 - 1.4 dt), so launch fast enough to travel `reach` in `life`.
      const speed = ((reach * 1.4) / (1 - Math.exp(-1.4 * life))) * (0.85 + Math.random() * 0.15)
      // tan(fireHalfAngle 0.33) ~ 0.34: the flame fans out exactly as wide as it burns.
      const spread = (Math.random() - 0.5) * 0.68
      const lift = (Math.random() - 0.5) * 0.12
      p.vel.copy(dir).multiplyScalar(speed).addScaledVector(side, spread * speed).addScaledVector(up, lift * speed)
    }
  }

  function zzz(from: THREE.Vector3): void {
    const p = take('z', from, 2.6, 0.6)
    p.vel.set(0.4 + Math.random() * 0.3, 1.1, 0.2)
    p.color.set(0xcfe8ff)
  }

  function glint(at: THREE.Vector3): void {
    const p = take('glint', at, 0.45, 0.5)
    p.vel.set((Math.random() - 0.5) * 2, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2)
    p.color.set(0xffd54a)
  }

  function burst(at: THREE.Vector3, color: number, count: number): void {
    for (let k = 0; k < count; k++) {
      const p = take('confetti', at, 0.9 + Math.random() * 0.5, 0.35)
      const a = Math.random() * Math.PI * 2
      p.vel.set(Math.cos(a) * (2 + Math.random() * 3), 4 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 3))
      p.color.set(color).offsetHSL((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.2)
    }
  }

  function smoke(at: THREE.Vector3): void {
    const p = take('smoke', at, 1.4, 0.8)
    p.vel.set((Math.random() - 0.5) * 0.6, 1.4, (Math.random() - 0.5) * 0.6)
    p.color.set(0x5a5266)
  }

  function update(dt: number): void {
    for (const p of pool) {
      if (!p.sprite.visible) continue
      p.life -= dt
      if (p.life <= 0) {
        p.sprite.visible = false
        continue
      }
      const age = 1 - p.life / p.max
      const m = p.sprite.material
      p.sprite.position.addScaledVector(p.vel, dt)
      if (p.kind === 'fire') {
        p.vel.multiplyScalar(1 - dt * 1.4)
        if (p.sprite.position.y < 0.3) p.vel.y = Math.abs(p.vel.y) * 0.3
        p.color.copy(age < 0.35 ? FIRE_HOT : FIRE_MID).lerp(age < 0.35 ? FIRE_MID : FIRE_END, age < 0.35 ? age / 0.35 : (age - 0.35) / 0.65)
        m.color.copy(p.color).multiplyScalar(2.2)
        m.opacity = 1 - age * 0.9
        p.sprite.scale.setScalar(p.size * (1 + age * 3.2))
      } else if (p.kind === 'confetti') {
        p.vel.y -= 12 * dt
        m.color.copy(p.color).multiplyScalar(1.6)
        m.opacity = 1 - age
        p.sprite.scale.setScalar(p.size)
        m.rotation += dt * 6
      } else if (p.kind === 'glint') {
        p.vel.y -= 6 * dt
        m.color.copy(p.color).multiplyScalar(2.5)
        m.opacity = 1 - age
        p.sprite.scale.setScalar(p.size * (1 - age * 0.5))
      } else {
        m.color.copy(p.color)
        m.opacity = Math.sin(age * Math.PI) * (p.kind === 'z' ? 0.95 : 0.5)
        p.sprite.scale.setScalar(p.size * (0.6 + age * 0.9))
      }
    }
  }

  return { fire, zzz, glint, burst, smoke, update }
}
