import { CFG } from './config'
import { spawnPan } from './items'
import { resolveCollisions } from './movement'
import { nextSeed, seedToUnit } from './rng'
import { dist, polar } from './world'
import type { Actor, Egg, GameEvent, GameState, Layout, Pickup, Vec } from './types'

/** Where an egg lies: its hoard spot, or the rainbow egg's own spot. */
export function eggPos(e: Egg, state: GameState, layout: Layout): Vec {
  if (e.spot >= 0) return layout.spots[e.spot].pos
  return state.happenings.rainbowPos ?? { x: 0, z: CFG.dragonRadius + 1.4 }
}

function rainbowOut(state: GameState): boolean {
  return state.eggs.some((e) => e.rainbow) || state.actors.some((a) => a.carrying?.rainbow === true)
}

function stepRainbow(state: GameState, dt: number, events: GameEvent[]): GameState {
  const h = state.happenings
  const rainbowIn = h.rainbowIn - dt
  if (rainbowIn < CFG.rainbowWarn && !h.rainbowWarned && !rainbowOut(state)) {
    events.push({ type: 'rainbowWarn' })
    return { ...state, happenings: { ...h, rainbowIn, rainbowWarned: true } }
  }
  if (rainbowIn > 0) return { ...state, happenings: { ...h, rainbowIn } }
  if (rainbowOut(state)) return { ...state, happenings: { ...h, rainbowIn: CFG.rainbowEvery, rainbowWarned: false } }
  // Right between the dragon's claws, wherever it is facing.
  const pos = polar(CFG.dragonRadius + 1.4, state.dragon.yaw)
  const egg: Egg = { id: state.nextId, spot: -1, rarity: 2, rainbow: true }
  events.push({ type: 'rainbowSpawn', pos })
  return {
    ...state,
    eggs: [...state.eggs, egg],
    nextId: state.nextId + 1,
    happenings: { ...h, rainbowIn: CFG.rainbowEvery, rainbowWarned: false, rainbowPos: pos },
  }
}

function sneezeCoins(state: GameState): { coins: Pickup[]; seed: number } {
  let s = state.seed
  const coins = Array.from({ length: CFG.sneezeCoins }, (_, k) => {
    s = nextSeed(s)
    const r = CFG.dragonRadius + 0.8 + seedToUnit(s) * (7.5 - CFG.dragonRadius - 0.8)
    s = nextSeed(s)
    const a = ((k + seedToUnit(s)) / CFG.sneezeCoins) * Math.PI * 2
    return { id: state.nextId + k, kind: 'coin' as const, pos: polar(r, a), value: CFG.sneezeCoinValue, ttl: CFG.coinTtl }
  })
  return { coins, seed: s }
}

function blowAway(layout: Layout, a: Actor): Actor {
  const d = Math.hypot(a.pos.x, a.pos.z)
  if (d > CFG.sneezeRadius || d < 1e-6) return a
  const pos = resolveCollisions(layout, { x: a.pos.x + (a.pos.x / d) * CFG.sneezePush, z: a.pos.z + (a.pos.z / d) * CFG.sneezePush })
  return { ...a, pos }
}

function stepSneeze(state: GameState, layout: Layout, dt: number, events: GameEvent[]): GameState {
  const h = state.happenings
  const asleep = state.dragon.mode === 'sleep' || state.dragon.mode === 'stir'
  const sneezeIn = asleep ? h.sneezeIn - dt : Math.max(h.sneezeIn, CFG.sneezeWarn + 0.5)
  if (sneezeIn <= CFG.sneezeWarn && !h.sneezeWarned) {
    events.push({ type: 'sneezeWarn' })
    return { ...state, happenings: { ...h, sneezeIn, sneezeWarned: true } }
  }
  if (sneezeIn > 0) return { ...state, happenings: { ...h, sneezeIn } }
  const { coins, seed } = sneezeCoins(state)
  const next = nextSeed(seed)
  events.push({ type: 'sneeze' })
  return {
    ...state,
    seed: next,
    nextId: state.nextId + coins.length,
    pickups: [...state.pickups, ...coins],
    actors: state.actors.map((a) => blowAway(layout, a)),
    happenings: { ...h, sneezeWarned: false, sneezeIn: CFG.sneezeMin + seedToUnit(next) * (CFG.sneezeMax - CFG.sneezeMin) },
  }
}

function collectCoins(state: GameState, events: GameEvent[]): GameState {
  let pickups = state.pickups
  const actors = state.actors.map((a) => {
    if (a.stunned > 0) return a
    const mine = pickups.filter((p) => p.kind === 'coin' && dist(p.pos, a.pos) < CFG.pickupRange)
    if (mine.length === 0) return a
    const taken = new Set(mine.map((p) => p.id))
    pickups = pickups.filter((p) => !taken.has(p.id))
    const value = mine.reduce((s, p) => s + p.value, 0)
    events.push({ type: 'coinPickup', actor: a.id, value })
    return { ...a, coins: a.coins + value }
  })
  return { ...state, actors, pickups }
}

/** Timed surprises: the rainbow egg, the sneeze and its coins, pans on the floor. */
export function stepHappenings(state: GameState, layout: Layout, dt: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = []
  const ticked = { ...state, happenings: { ...state.happenings, panIn: state.happenings.panIn - dt } }
  const aged = { ...ticked, pickups: ticked.pickups.map((p) => ({ ...p, ttl: p.ttl - dt })).filter((p) => p.ttl > 0) }
  const withPan = spawnPan(aged, layout)
  if (withPan.pickups.length > aged.pickups.length) {
    const pan = withPan.pickups[withPan.pickups.length - 1]
    events.push({ type: 'panSpawn', pos: pan.pos })
  }
  const rainbow = stepRainbow(withPan, dt, events)
  const sneezed = stepSneeze(rainbow, layout, dt, events)
  return { state: collectCoins(sneezed, events), events }
}
