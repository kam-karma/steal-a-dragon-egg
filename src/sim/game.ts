import { applyAction } from './actions'
import { type Frame, PLAYER_ID, stepActor, type StepContext } from './actorStep'
import { newBrain } from './bots'
import { assignPersonality, CLUMSY } from './botPersonality'
import { CFG } from './config'
import { acceptsNoise, SLEEPING, stepDragon } from './dragon'
import { levelFromXp } from './economy'
import { stepHappenings } from './happenings'
import { handsFree } from './movement'
import { emptyNest, stepNest } from './nests'
import { accumulate, culprit } from './noise'
import { resolveTags } from './raid'
import { nextSeed, seedToUnit } from './rng'
import { NEST_COUNT } from './world'
import type { Actor, Egg, GameEvent, GameState, Items, Layout, PlayerInput } from './types'

export { PLAYER_ID }

const BOT_NAMES = ['KaplanKız', 'MiniMert', 'Zeyno', 'TurboAli', 'Pıtırcık', 'Bulut', 'ŞimşekEce']
const COLORS = [0x3d8bff, 0xff5a5f, 0xffc23d, 0x3ddc84, 0xc86bff, 0xff8a3d, 0x2fd6d6, 0xff6fb5]

export const NO_ITEMS: Items = { pans: 0, panCooldown: 0, bootsLeft: 0, totemLeft: 0, luckLeft: 0, gold2xLeft: 0 }

function makeActor(id: number, layout: Layout): Actor {
  const home = layout.nests[id]
  const personality = id === PLAYER_ID ? null : assignPersonality(id - 1)
  return {
    id,
    isBot: id !== PLAYER_ID,
    name: id === PLAYER_ID ? 'SEN' : BOT_NAMES[(id - 1) % BOT_NAMES.length],
    color: COLORS[id % COLORS.length],
    pos: { x: home.x * 0.9, z: home.z * 0.9 },
    facing: Math.atan2(-home.x, -home.z),
    speed: 0,
    carrying: null,
    stolen: null,
    stunned: 0,
    coins: 0,
    nest: id,
    onGold: false,
    bot: personality === null ? null : newBrain(CLUMSY[personality]),
    items: NO_ITEMS,
    xp: 0,
    streak: 0,
    streakShield: false,
    rebirths: 0,
    personality,
    lastDrop: null,
  }
}

export function createGame(layout: Layout, seed: number): GameState {
  const actors = Array.from({ length: NEST_COUNT }, (_, i) => makeActor(i, layout))
  const eggs: Egg[] = layout.spots.map((s, i) => ({ id: i, spot: i, rarity: s.rarity, rainbow: false }))
  return {
    time: 0,
    noise: 0,
    dragon: SLEEPING,
    actors,
    eggs,
    regrow: layout.spots.map(() => 0),
    // Bots start with the biggest nest so their eggs rarely bounce back to the hoard.
    nests: actors.map((a) => (a.isBot ? { ...emptyNest(a.id), capacityLevel: 2 as const } : emptyNest(a.id))),
    noiseShare: actors.map(() => 0),
    pickups: [],
    happenings: { rainbowIn: CFG.firstRainbowAt, rainbowWarned: false, rainbowPos: null, sneezeIn: CFG.firstSneezeAt, sneezeWarned: false, panIn: CFG.firstPanAt },
    nemesisCounts: actors.map(() => 0),
    nextId: eggs.length,
    seed,
  }
}

/** The dragon looks at the nearest egg carrier near the hoard, else the nearest thief. */
export function dragonTarget(state: GameState): number | null {
  const near = state.actors.filter((a) => Math.hypot(a.pos.x, a.pos.z) < CFG.hoardRadius + 4 && a.stunned <= 0)
  if (near.length === 0) return null
  const carriers = near.filter((a) => !handsFree(a))
  const pool = carriers.length > 0 ? carriers : near
  const best = pool.reduce((p, q) => (Math.hypot(q.pos.x, q.pos.z) < Math.hypot(p.pos.x, p.pos.z) ? q : p))
  return Math.atan2(best.pos.x, best.pos.z)
}

/** The dragon woke up: everyone's silence streak breaks, unless they bought a shield. */
function breakStreak(a: Actor): Actor {
  if (a.streakShield) return { ...a, streakShield: false }
  return { ...a, streak: 0 }
}

export interface StepResult {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

function stepActors(ctx: StepContext): { frame: Frame; actors: readonly Actor[]; seed: number } {
  const { state } = ctx
  let frame: Frame = {
    eggs: state.eggs,
    regrow: state.regrow,
    nests: state.nests,
    nextId: state.nextId,
    pickups: state.pickups,
    nemesisCounts: state.nemesisCounts,
    rainbowPos: state.happenings.rainbowPos,
    events: [],
    added: state.actors.map(() => 0),
  }
  let seed = state.seed
  const actors = state.actors.map((a) => {
    seed = nextSeed(seed)
    const r = stepActor(ctx, frame, a, seedToUnit(seed))
    frame = r.frame
    return r.actor
  })
  const tags = resolveTags(actors, frame.nests, frame.nextId)
  frame = { ...frame, nests: tags.nests, nextId: frame.nextId + tags.events.length, events: [...frame.events, ...tags.events] }
  return { frame, actors: tags.actors, seed }
}

/** Eggs grow back on empty hoard spots. */
function regrowEggs(frame: Frame, actors: readonly Actor[], layout: Layout, dt: number): Frame {
  let nextId = frame.nextId
  let eggs = frame.eggs
  const occupied = new Set([...eggs.map((e) => e.spot), ...actors.flatMap((a) => (a.carrying ? [a.carrying.spot] : []))])
  const regrow = frame.regrow.map((r, spot) => {
    if (r <= 0) return 0
    const left = r - dt
    if (left > 0 || occupied.has(spot)) return Math.max(left, 0.01)
    eggs = [...eggs, { id: nextId++, spot, rarity: layout.spots[spot].rarity, rainbow: false }]
    return 0
  })
  return { ...frame, eggs, regrow, nextId }
}

function stepNests(frame: Frame, actors: readonly Actor[], dt: number, seed0: number): { frame: Frame; actors: readonly Actor[]; seed: number } {
  let seed = seed0
  let nextId = frame.nextId
  const events: GameEvent[] = []
  const coinsByOwner = new Map<number, number>()
  const nests = frame.nests.map((n, i) => {
    const owner = actors.find((a) => a.id === n.owner) ?? actors[0]
    const step = stepNest(n, i, owner, dt, seed, nextId)
    seed = step.seed
    nextId = step.nextId
    events.push(...step.events)
    coinsByOwner.set(n.owner, (coinsByOwner.get(n.owner) ?? 0) + step.coins)
    return step.nest
  })
  const paid = actors.map((a) => ({ ...a, coins: a.coins + (coinsByOwner.get(a.id) ?? 0) }))
  return { frame: { ...frame, nests, nextId, events: [...frame.events, ...events] }, actors: paid, seed }
}

function levelUps(before: GameState, after: GameState): GameEvent[] {
  return after.actors.flatMap((a, i) => {
    const level = levelFromXp(a.xp)
    return level > levelFromXp(before.actors[i].xp) ? [{ type: 'levelUp' as const, actor: a.id, level }] : []
  })
}

export function stepGame(state0: GameState, layout: Layout, input: PlayerInput, dt: number): StepResult {
  const acted = input.action !== undefined ? applyAction(state0, layout, PLAYER_ID, input.action) : { state: state0, events: [] }
  const state = acted.state
  const moved = stepActors({ state, layout, input, dt })
  const grown = regrowEggs(moved.frame, moved.actors, layout, dt)

  const heard = acceptsNoise(state.dragon) ? accumulate(state, grown.added, dt) : { noise: state.noise, noiseShare: state.noiseShare }
  const ds = stepDragon(state.dragon, heard.noise, dt, dragonTarget({ ...state, actors: moved.actors }), culprit(heard.noiseShare))
  const woke = ds.events.some((e) => e.type === 'wake')
  const afterWake = woke ? moved.actors.map(breakStreak) : moved.actors
  const noiseShare = ds.dragon.mode === 'sleep' && ds.noise === 0 ? heard.noiseShare.map(() => 0) : heard.noiseShare

  const nested = stepNests({ ...grown, events: [...grown.events, ...ds.events] }, afterWake, dt, moved.seed)
  const f = nested.frame
  const next: GameState = {
    ...state,
    time: state.time + dt,
    noise: ds.noise,
    noiseShare,
    dragon: ds.dragon,
    actors: nested.actors,
    eggs: f.eggs,
    regrow: f.regrow,
    nests: f.nests,
    nextId: f.nextId,
    seed: nested.seed,
    pickups: f.pickups,
    nemesisCounts: f.nemesisCounts,
    happenings: { ...state.happenings, rainbowPos: f.rainbowPos },
  }
  const hap = stepHappenings(next, layout, dt)
  return { state: hap.state, events: [...acted.events, ...f.events, ...hap.events, ...levelUps(state0, hap.state)] }
}
