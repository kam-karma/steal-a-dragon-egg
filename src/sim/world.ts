import { CFG } from './config'
import { rngFrom } from './rng'
import type { Circle, EggSpot, Layout, Rarity, Vec } from './types'

export const NEST_COUNT = CFG.bots + 1

export function nestAngle(i: number): number {
  return (i / NEST_COUNT) * Math.PI * 2
}

export function polar(r: number, a: number): Vec {
  return { x: Math.sin(a) * r, z: Math.cos(a) * r }
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Smallest signed difference between two angles. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

function overlaps(c: Circle, list: readonly Circle[], pad: number): boolean {
  return list.some((o) => Math.hypot(c.x - o.x, c.z - o.z) < c.r + o.r + pad)
}

/** True if the point is inside the quiet corridor that leads from a nest to the hoard. */
function inCorridor(p: Vec, width: number): boolean {
  for (let i = 0; i < NEST_COUNT; i++) {
    const a = nestAngle(i)
    const along = p.x * Math.sin(a) + p.z * Math.cos(a)
    const across = Math.abs(p.x * Math.cos(a) - p.z * Math.sin(a))
    if (along > 0 && across < width) return true
  }
  return false
}

function makePillars(rand: () => number): Circle[] {
  const out: Circle[] = []
  for (let i = 0; i < NEST_COUNT; i++) {
    const mid = nestAngle(i) + Math.PI / NEST_COUNT
    const inner = polar(8.3 + rand() * 0.8, mid + (rand() - 0.5) * 0.25)
    out.push({ ...inner, r: 1.15 + rand() * 0.3 })
    const outer = polar(15 + rand() * 2.5, nestAngle(i) + 0.32 + (rand() - 0.5) * 0.2)
    out.push({ ...outer, r: 1.3 + rand() * 0.45 })
  }
  return out
}

function makeGold(rand: () => number, pillars: readonly Circle[]): Circle[] {
  const out: Circle[] = []
  const tryAdd = (rMin: number, rMax: number, sMin: number, sMax: number, corridor: number): void => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const p = polar(rMin + rand() * (rMax - rMin), rand() * Math.PI * 2)
      const c = { ...p, r: sMin + rand() * (sMax - sMin) }
      if (Math.hypot(c.x, c.z) - c.r < CFG.dragonRadius - 0.6) continue
      if (corridor > 0 && inCorridor(p, corridor + c.r)) continue
      if (overlaps(c, pillars, 0.2) || overlaps(c, out, -0.5)) continue
      out.push(c)
      return
    }
  }
  for (let k = 0; k < 26; k++) tryAdd(4.6, 8.4, 1.2, 2.1, 0)
  for (let k = 0; k < 24; k++) tryAdd(8.2, 13, 1.0, 1.9, 0.9)
  return out
}

const RINGS: readonly { rarity: Rarity; r: number; count: number }[] = [
  { rarity: 3, r: 5.6, count: 2 },
  { rarity: 2, r: 7.2, count: 3 },
  { rarity: 1, r: 9.4, count: 4 },
  { rarity: 0, r: 11.8, count: 6 },
]

function makeSpots(rand: () => number, pillars: readonly Circle[]): EggSpot[] {
  const out: EggSpot[] = []
  for (const ring of RINGS) {
    const offset = rand() * Math.PI * 2
    for (let k = 0; k < ring.count; k++) {
      let pos = polar(ring.r, offset + (k / ring.count) * Math.PI * 2)
      for (let nudge = 0; nudge < 8 && overlaps({ ...pos, r: 0.6 }, pillars, 0.2); nudge++) {
        pos = polar(ring.r, offset + (k / ring.count) * Math.PI * 2 + 0.2 * (nudge + 1))
      }
      out.push({ pos, rarity: ring.rarity })
    }
  }
  return out
}

export function makeLayout(seed: number): Layout {
  const rand = rngFrom(seed)
  const pillars = makePillars(rand)
  const gold = makeGold(rand, pillars)
  const nests = Array.from({ length: NEST_COUNT }, (_, i) => polar(CFG.nestDistance, nestAngle(i)))
  const spots = makeSpots(rand, pillars)
  return { gold, pillars, nests, spots }
}

export function onGold(layout: Layout, p: Vec): boolean {
  return layout.gold.some((g) => Math.hypot(p.x - g.x, p.z - g.z) < g.r)
}

/**
 * True if the straight line from `from` to `to` passes through a pillar.
 * Used for "hide behind a rock" against dragon fire.
 */
export function blocked(layout: Layout, from: Vec, to: Vec): boolean {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return false
  return layout.pillars.some((c) => {
    const t = Math.max(0, Math.min(1, ((c.x - from.x) * dx + (c.z - from.z) * dz) / len2))
    const px = from.x + dx * t - c.x
    const pz = from.z + dz * t - c.z
    return px * px + pz * pz < (c.r * 0.9) ** 2 && t < 0.98
  })
}
