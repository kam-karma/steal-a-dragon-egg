import * as THREE from 'three'
import type { Pickup } from '../sim/types'

const METAL = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, metalness: 0.85, roughness: 0.3 })
const HANDLE = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.8 })
const COIN = new THREE.MeshStandardMaterial({ color: 0xffcf3a, metalness: 0.9, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.6 })
const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.07, 16)

/** A frying pan: the troll's favourite instrument. */
export function makePan(): THREE.Group {
  const g = new THREE.Group()
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.16, 20), METAL)
  pan.castShadow = true
  g.add(pan)
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 8), HANDLE)
  handle.rotation.z = Math.PI / 2
  handle.position.set(0.9, 0.05, 0)
  g.add(handle)
  return g
}

export interface PickupsView {
  readonly sync: (pickups: readonly Pickup[], time: number) => void
}

/** Pans and sneeze coins lying on the floor; spin and bob so kids notice them. */
export function createPickupsView(scene: THREE.Scene): PickupsView {
  const meshes = new Map<number, THREE.Object3D>()
  return {
    sync: (pickups, time) => {
      const live = new Set(pickups.map((p) => p.id))
      for (const [id, m] of meshes) {
        if (!live.has(id)) {
          scene.remove(m)
          meshes.delete(id)
        }
      }
      for (const p of pickups) {
        let m = meshes.get(p.id)
        if (m === undefined) {
          m = p.kind === 'pan' ? makePan() : new THREE.Mesh(coinGeo, COIN)
          scene.add(m)
          meshes.set(p.id, m)
        }
        const bob = Math.sin(time * 3 + p.id) * 0.12
        m.position.set(p.pos.x, (p.kind === 'pan' ? 0.9 : 0.5) + bob, p.pos.z)
        if (p.kind === 'coin') {
          m.rotation.set(Math.PI / 2, 0, time * 4 + p.id)
          // Coins blink in their last 3 seconds.
          m.visible = p.ttl > 3 || Math.sin(time * 20) > 0
        } else {
          m.rotation.set(0.3, time * 1.5, 0)
        }
      }
    },
  }
}
