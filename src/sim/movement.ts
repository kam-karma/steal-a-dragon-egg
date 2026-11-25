import { CFG } from './config'
import type { Actor, Layout, Vec } from './types'

export function handsFree(a: Actor): boolean {
  return a.carrying === null && a.stolen === null
}

/** Pushes a point out of rocks, the dragon's body and the cave wall. */
export function resolveCollisions(layout: Layout, p: Vec): Vec {
  let x = p.x
  let z = p.z
  const r = CFG.actorRadius
  for (const c of layout.pillars) {
    const dx = x - c.x
    const dz = z - c.z
    const d = Math.hypot(dx, dz)
    const min = c.r + r
    if (d < min && d > 1e-6) {
      x = c.x + (dx / d) * min
      z = c.z + (dz / d) * min
    }
  }
  const dc = Math.hypot(x, z)
  const minBody = CFG.dragonRadius + r
  if (dc < minBody && dc > 1e-6) {
    x = (x / dc) * minBody
    z = (z / dc) * minBody
  }
  const maxR = CFG.arenaRadius - r
  const d2 = Math.hypot(x, z)
  if (d2 > maxR) {
    x = (x / d2) * maxR
    z = (z / d2) * maxR
  }
  return { x, z }
}

/** Moves an actor along a desired direction (length 0..1). Returns the new actor and metres walked. */
export function moveActor(layout: Layout, a: Actor, dirX: number, dirZ: number, dt: number): { actor: Actor; walked: number } {
  if (a.stunned > 0) {
    return { actor: { ...a, stunned: Math.max(0, a.stunned - dt), speed: 0 }, walked: 0 }
  }
  const len = Math.hypot(dirX, dirZ)
  if (len < 0.05) return { actor: { ...a, speed: 0 }, walked: 0 }
  const k = Math.min(1, len)
  const top = handsFree(a) ? CFG.walkSpeed : CFG.carrySpeed
  const step = top * k * dt
  const ux = dirX / len
  const uz = dirZ / len
  const go = (dx: number, dz: number): { pos: Vec; gain: number } => {
    const p = resolveCollisions(layout, { x: a.pos.x + dx * step, z: a.pos.z + dz * step })
    // Progress along the direction the player actually wants to go.
    return { pos: p, gain: (p.x - a.pos.x) * ux + (p.z - a.pos.z) * uz }
  }
  let best = go(ux, uz)
  // Blocked by a rock or the dragon: slide round it. The side comes from the way the obstacle
  // pushes us back, so it stays the same frame after frame (no shaking back and forth).
  if (best.gain < step * 0.4) {
    const pushX = best.pos.x - (a.pos.x + ux * step)
    const pushZ = best.pos.z - (a.pos.z + uz * step)
    const atWall = Math.hypot(best.pos.x, best.pos.z) > CFG.arenaRadius - CFG.actorRadius - 1e-3
    if (!atWall && Math.hypot(pushX, pushZ) > 1e-6) {
      // Sideways part of the push; head-on hits always break to the same side.
      const along = pushX * ux + pushZ * uz
      let sx = pushX - along * ux
      let sz = pushZ - along * uz
      const sl = Math.hypot(sx, sz)
      if (sl < 1e-4) {
        sx = -uz
        sz = ux
      } else {
        sx /= sl
        sz /= sl
      }
      const dx = sx * 0.95 + ux * 0.3
      const dz = sz * 0.95 + uz * 0.3
      const dl = Math.hypot(dx, dz)
      const slide = go(dx / dl, dz / dl)
      if (Math.hypot(slide.pos.x - a.pos.x, slide.pos.z - a.pos.z) > Math.hypot(best.pos.x - a.pos.x, best.pos.z - a.pos.z)) best = slide
    }
  }
  const pos = best.pos
  const walked = Math.hypot(pos.x - a.pos.x, pos.z - a.pos.z)
  const facing = Math.atan2(dirX, dirZ)
  return { actor: { ...a, pos, facing, speed: walked / Math.max(dt, 1e-6) }, walked }
}
