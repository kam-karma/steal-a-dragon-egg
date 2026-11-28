import { CFG } from './config'
import { babyStage, mergeBabies } from './economy'
import { dropsPerCrown, guardReach, headStart, type NestTrack, nextUpgradeCost, rebirthCost } from './progression'
import { buyItem, buyPerk, dropEgg } from './shop'
import { usePan } from './items'
import { handsFree } from './movement'
import { giveBaby } from './raid'
import { dist } from './world'
import type { Action, Actor, GameEvent, GameState, Layout, Nest, Reward } from './types'

export interface ActionResult {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

type Patch = (a: Actor) => Actor

function withActor(state: GameState, id: number, patch: Patch): GameState {
  return { ...state, actors: state.actors.map((a) => (a.id === id ? patch(a) : a)) }
}

function withNest(state: GameState, index: number, patch: (n: Nest) => Nest): GameState {
  return { ...state, nests: state.nests.map((n, i) => (i === index ? patch(n) : n)) }
}

function spend(state: GameState, a: Actor, cost: number, patch: Patch): GameState | null {
  if (a.coins < cost) return null
  return withActor(state, a.id, (o) => patch({ ...o, coins: o.coins - cost }))
}

/**
 * A crown: gold, babies and nest upgrades start over, but you keep your crowns, perks
 * and level, get +30% gold forever, a fresh egg drop and 60 s of invisibility.
 */
function rebirth(state: GameState, a: Actor): ActionResult | null {
  if (a.coins < rebirthCost(a.rebirths)) return null
  // Whatever was in hand goes back where it came from.
  const eggs = a.carrying !== null ? [...state.eggs, a.carrying] : state.eggs
  const nests = a.stolen !== null ? giveBaby(state.nests, a.stolen.from, a.stolen, state.nextId) : state.nests
  const nextId = a.stolen !== null ? state.nextId + 1 : state.nextId
  const rebirths = a.rebirths + 1
  const reset: GameState = {
    ...state,
    eggs,
    nextId,
    nests: nests.map((n, i) => (i === a.nest ? { ...n, babies: [], hatching: [], capacityLevel: 0, nursery: 0, vault: 0 } : n)),
  }
  return {
    state: withActor(reset, a.id, (o) => ({
      ...o,
      coins: headStart(o.perks.head),
      carrying: null,
      stolen: null,
      streak: 0,
      rebirths,
      crowns: o.crowns + 1,
      drops: Math.max(o.drops, dropsPerCrown(o.perks.drop)),
      bought: {},
      items: { ...o.items, cloakLeft: CFG.cloakTime },
    })),
    events: [{ type: 'rebirth', actor: a.id, rebirths }],
  }
}

export function trackLevel(nest: Nest, track: NestTrack): number {
  return track === 'size' ? nest.capacityLevel : nest[track]
}

function nestAction(state: GameState, a: Actor, action: Action): ActionResult | null {
  const nest = state.nests[a.nest]
  switch (action.type) {
    case 'merge': {
      const m = mergeBabies(nest, action.rarity, state.nextId)
      if (m === null) return null
      return { state: { ...withNest(state, a.nest, () => m.nest), nextId: state.nextId + 1 }, events: [{ type: 'merge', nest: a.nest, rarity: m.made.rarity }] }
    }
    case 'upgrade': {
      const level = trackLevel(nest, action.track)
      const cost = nextUpgradeCost(action.track, level)
      if (cost === null) return null
      const paid = spend(state, a, cost, (o) => o)
      if (paid === null) return null
      const key = action.track === 'size' ? 'capacityLevel' : action.track
      return { state: withNest(paid, a.nest, (n) => ({ ...n, [key]: level + 1 })), events: [{ type: 'upgraded', actor: a.id, track: action.track, level: level + 1 }] }
    }
    case 'rebirth':
      return rebirth(state, a)
    default:
      return null
  }
}

function recover(state: GameState, a: Actor): GameState | null {
  const drop = a.lastDrop
  if (drop === null || !handsFree(a)) return null
  if (drop.babyNest === null) {
    const egg =
      drop.eggId !== undefined
        ? state.eggs.find((e) => e.id === drop.eggId)
        : state.eggs.find((e) => e.rarity === drop.rarity && e.rainbow === drop.rainbow && e.chest !== true && e.golden !== true)
    if (egg === undefined) return null
    return withActor({ ...state, eggs: state.eggs.filter((e) => e.id !== egg.id) }, a.id, (o) => ({ ...o, carrying: egg, lastDrop: null }))
  }
  const from = drop.babyNest
  const b = state.nests[from].babies.find((x) => x.rarity === drop.rarity)
  if (b === undefined) return null
  const taken = withNest(state, from, (n) => ({ ...n, babies: n.babies.filter((x) => x.id !== b.id) }))
  return withActor(taken, a.id, (o) => ({ ...o, stolen: { rarity: b.rarity, shiny: b.shiny, age: b.age, from }, lastDrop: null }))
}

function grow(state: GameState, a: Actor): GameState | null {
  const toNext = (age: number): number => (babyStage(age) === 0 ? CFG.teenAge - age : CFG.adultAge - age)
  const candidates = state.nests[a.nest].babies.filter((b) => babyStage(b.age) < 2)
  if (candidates.length === 0) return null
  const pick = candidates.reduce((p, q) => (toNext(q.age) > toNext(p.age) ? q : p))
  const age = babyStage(pick.age) === 0 ? CFG.teenAge : CFG.adultAge
  return withNest(state, a.nest, (n) => ({ ...n, babies: n.babies.map((b) => (b.id === pick.id ? { ...b, age } : b)) }))
}

function instantHatch(state: GameState, a: Actor): GameState | null {
  const hatching = state.nests[a.nest].hatching
  if (hatching.length === 0) return null
  let best = 0
  hatching.forEach((h, i) => {
    if (h.rarity > hatching[best].rarity) best = i
  })
  return withNest(state, a.nest, (n) => ({ ...n, hatching: n.hatching.map((h, i) => (i === best ? { ...h, left: 0 } : h)) }))
}

export function grant(state: GameState, a: Actor, reward: Reward): GameState | null {
  const items = (patch: Partial<Actor['items']>): GameState => withActor(state, a.id, (o) => ({ ...o, items: { ...o.items, ...patch } }))
  switch (reward) {
    case 'luck':
      return items({ luckLeft: a.items.luckLeft + CFG.luckTime })
    case 'gold2x':
      if (a.items.gold2xLeft >= CFG.gold2xMax - 1) return null
      return items({ gold2xLeft: Math.min(CFG.gold2xMax, a.items.gold2xLeft + CFG.gold2xTime) })
    case 'boots':
      return items({ bootsLeft: a.items.bootsLeft + CFG.bootsTime })
    case 'totem':
      return items({ totemLeft: a.items.totemLeft + CFG.totemTime })
    case 'lullaby':
      if (state.dragon.mode !== 'sleep' && state.dragon.mode !== 'stir') return null
      return { ...state, dragon: { ...state.dragon, lullaby: CFG.lullabyTime } }
    case 'streakShield':
      if (a.streakShield) return null
      return withActor(state, a.id, (o) => ({ ...o, streakShield: true }))
    case 'recover':
      return recover(state, a)
    case 'grow':
      return grow(state, a)
    case 'instantHatch':
      return instantHatch(state, a)
  }
}

/**
 * One player action. Nest actions (merge, upgrade, buy, rebirth) only work
 * standing at your own nest. Anything that cannot happen leaves the state untouched.
 */
export function applyAction(state: GameState, layout: Layout, actorId: number, action: Action): ActionResult {
  const a = state.actors.find((o) => o.id === actorId)
  const same: ActionResult = { state, events: [] }
  if (a === undefined) return same
  if (action.type === 'usePan') {
    const r = usePan(state, actorId)
    return r.used ? { state: r.state, events: [{ type: 'pan', actor: actorId }] } : same
  }
  if (action.type === 'spend') {
    if (!Number.isFinite(action.amount) || action.amount < 0) return same
    const paid = spend(state, a, action.amount, (o) => o)
    return paid === null ? same : { state: paid, events: [] }
  }
  if (action.type === 'bonus') {
    const crowns = action.crowns ?? 0
    const drops = action.drops ?? 0
    const ok = [action.coins, action.xp, crowns, drops].every((v) => Number.isFinite(v) && v >= 0) && crowns <= 1 && drops <= 3
    if (!ok) return same
    const s = withActor(state, actorId, (o) => ({ ...o, coins: o.coins + action.coins, xp: o.xp + action.xp, crowns: o.crowns + crowns, drops: o.drops + drops }))
    return { state: s, events: [] }
  }
  if (action.type === 'grant') {
    const s = grant(state, a, action.reward)
    return s === null ? same : { state: s, events: [{ type: 'reward', actor: actorId, reward: action.reward }] }
  }
  if (action.type === 'buyItem') return buyItem(state, a, action.item) ?? same
  if (action.type === 'buyPerk') return buyPerk(state, a, action.perk) ?? same
  if (action.type === 'dropEgg') return dropEgg(state, a) ?? same
  if (dist(a.pos, layout.nests[a.nest]) >= guardReach(state.nests[a.nest].capacityLevel)) return same
  return nestAction(state, a, action) ?? same
}
