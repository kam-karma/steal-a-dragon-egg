import { CFG } from './config'
import { nextSeed, seedToUnit } from './rng'
import { dist, onGold, polar } from './world'
import type { Actor, GameState, Items, Layout, Pickup, Vec } from './types'

/** Every timed item ticks down to zero. */
export function stepItems(items: Items, dt: number): Items {
  const down = (v: number): number => Math.max(0, v - dt)
  return {
    pans: items.pans,
    panCooldown: down(items.panCooldown),
    bootsLeft: down(items.bootsLeft),
    totemLeft: down(items.totemLeft),
    luckLeft: down(items.luckLeft),
    gold2xLeft: down(items.gold2xLeft),
    cloakLeft: down(items.cloakLeft),
  }
}

export interface PanPickup {
  readonly actor: Actor
  readonly pickups: readonly Pickup[]
  readonly picked: boolean
}

/** Walk onto a pan to take it; you can hold only one. */
export function tryPickupPan(a: Actor, pickups: readonly Pickup[]): PanPickup {
  if (a.items.pans > 0) return { actor: a, pickups, picked: false }
  const pan = pickups.find((p) => p.kind === 'pan' && dist(p.pos, a.pos) < CFG.pickupRange)
  if (pan === undefined) return { actor: a, pickups, picked: false }
  return {
    actor: { ...a, items: { ...a.items, pans: 1 } },
    pickups: pickups.filter((p) => p.id !== pan.id),
    picked: true,
  }
}

function stoneSpot(layout: Layout, seed: number): { pos: Vec; seed: number } {
  let s = seed
  for (let attempt = 0; attempt < 40; attempt++) {
    s = nextSeed(s)
    const r = 9 + seedToUnit(s) * 11
    s = nextSeed(s)
    const pos = polar(r, seedToUnit(s) * Math.PI * 2)
    const onRock = layout.pillars.some((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < c.r + 0.6)
    if (!onGold(layout, pos) && !onRock) return { pos, seed: s }
  }
  return { pos: polar(18, 0.5), seed: s }
}

/**
 * Puts a pan on a stone tile when the timer runs out. While one is lying
 * around the timer stays full, so the next one comes 45 s after it is taken.
 */
export function spawnPan(state: GameState, layout: Layout): GameState {
  const h = state.happenings
  if (state.pickups.some((p) => p.kind === 'pan')) return { ...state, happenings: { ...h, panIn: CFG.panEvery } }
  if (h.panIn > 0) return state
  const spot = stoneSpot(layout, state.seed)
  const pan: Pickup = { id: state.nextId, kind: 'pan', pos: spot.pos, value: 0, ttl: Infinity }
  return {
    ...state,
    seed: spot.seed,
    nextId: state.nextId + 1,
    pickups: [...state.pickups, pan],
    happenings: { ...h, panIn: CFG.panEvery },
  }
}

/** Bang the pan: +40 noise, credited to whoever banged it. Only while the dragon sleeps or stirs. */
export function usePan(state: GameState, actorId: number): { state: GameState; used: boolean } {
  const a = state.actors.find((o) => o.id === actorId)
  const dozing = state.dragon.mode === 'sleep' || state.dragon.mode === 'stir'
  if (a === undefined || a.items.pans < 1 || a.items.panCooldown > 0 || !dozing) return { state, used: false }
  const noise = Math.min(100, state.noise + CFG.panNoise)
  const noiseShare = state.actors.map((o, i) => (state.noiseShare[i] ?? 0) + (o.id === actorId ? CFG.panNoise : 0))
  const actors = state.actors.map((o) =>
    o.id === actorId ? { ...o, items: { ...o.items, pans: o.items.pans - 1, panCooldown: CFG.panCooldown } } : o,
  )
  return { state: { ...state, noise, noiseShare, actors }, used: true }
}
