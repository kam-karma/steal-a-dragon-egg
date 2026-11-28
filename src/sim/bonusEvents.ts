import { CFG } from './config'
import { levelFromXp } from './economy'
import { PLAYER_ID } from './ids'
import { nextSeed, seedToUnit } from './rng'
import { unlocked } from './unlocks'
import { onGold, polar } from './world'
import type { Egg, GameEvent, GameState, Layout, Rarity, Vec } from './types'

const playerLevel = (s: GameState): number => levelFromXp(s.actors[PLAYER_ID].xp)

/** A free spot on the stone ring outside the hoard: not on gold, a rock or a nest. */
function stoneRingSpot(layout: Layout, seed: number): { pos: Vec; seed: number } {
  let s = seed
  for (let k = 0; k < 40; k++) {
    s = nextSeed(s)
    const r = CFG.hoardRadius + 2 + seedToUnit(s) * 6
    s = nextSeed(s)
    const pos = polar(r, seedToUnit(s) * Math.PI * 2)
    const rock = layout.pillars.some((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < c.r + 0.8)
    const nest = layout.nests.some((n) => Math.hypot(n.x - pos.x, n.z - pos.z) < CFG.nestRadius + 2)
    if (!onGold(layout, pos) && !rock && !nest) return { pos, seed: s }
  }
  return { pos: polar(CFG.hoardRadius + 4, 1), seed: s }
}

/** Level 4: every so often a rain of quiet eggs on the stone ring, gone again after a while. */
export function stepRain(state: GameState, layout: Layout, dt: number, events: GameEvent[]): GameState {
  if (!unlocked(playerLevel(state), 'rain')) return state
  const h = state.happenings
  const rainIn = h.rainIn - dt
  if (h.rainIn > CFG.rainWarn && rainIn <= CFG.rainWarn) events.push({ type: 'rainWarn' })
  if (rainIn > 0) return { ...state, happenings: { ...h, rainIn } }
  let seed = state.seed
  let id = state.nextId
  const eggs: Egg[] = Array.from({ length: CFG.rainCount }, (_, k) => {
    const spot = stoneRingSpot(layout, seed)
    seed = nextSeed(spot.seed)
    const rarity: Rarity = k === 0 ? 2 : seedToUnit(seed) < 0.35 ? 1 : 0
    return { id: id++, spot: -2, rarity, rainbow: false, rain: true, pos: spot.pos, expires: state.time + CFG.rainTtl }
  })
  events.push({ type: 'rain' })
  return { ...state, seed, nextId: id, eggs: [...state.eggs, ...eggs], happenings: { ...h, rainIn: CFG.rainEvery } }
}

/** Level 8: a treasure chest on the hoard's edge; it waits a while, then is gone. */
export function stepChest(state: GameState, layout: Layout, dt: number, events: GameEvent[]): GameState {
  if (!unlocked(playerLevel(state), 'chest')) return state
  const h = state.happenings
  const out = state.eggs.some((e) => e.chest === true) || state.actors.some((a) => a.carrying?.chest === true)
  if (out) return { ...state, happenings: { ...h, chestIn: CFG.chestEvery } }
  const chestIn = h.chestIn - dt
  if (chestIn > 0) return { ...state, happenings: { ...h, chestIn } }
  // On the hoard's edge, but never inside a rock (it could not be reached there).
  let seed = state.seed
  let pos = polar(CFG.hoardRadius - 2.5, 0)
  for (let k = 0; k < 24; k++) {
    seed = nextSeed(seed)
    pos = polar(CFG.hoardRadius - 2.5, seedToUnit(seed) * Math.PI * 2)
    if (!layout.pillars.some((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < c.r + 1.2)) break
  }
  const chest: Egg = { id: state.nextId, spot: -2, rarity: 3, rainbow: false, chest: true, pos, expires: state.time + CFG.chestTtl }
  events.push({ type: 'chestSpawn', pos })
  return { ...state, seed, nextId: state.nextId + 1, eggs: [...state.eggs, chest], happenings: { ...h, chestIn: CFG.chestEvery } }
}

/** Rain eggs and chests lying around vanish when their time is up. */
export function expireEggs(state: GameState): GameState {
  const left = state.eggs.filter((e) => e.expires === undefined || e.expires > state.time)
  return left.length === state.eggs.length ? state : { ...state, eggs: left }
}

/** Level 11: the rainbow egg comes back twice as fast. */
export function rainbowInterval(state: GameState): number {
  return unlocked(playerLevel(state), 'shower') ? CFG.rainbowEvery / 2 : CFG.rainbowEvery
}
