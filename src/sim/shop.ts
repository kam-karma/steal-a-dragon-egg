import { grant } from './actions'
import { perkCost, type Perk, storePrice, type StoreItem } from './progression'
import type { Actor, GameEvent, GameState } from './types'

interface Result {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

function patchActor(state: GameState, id: number, patch: (a: Actor) => Actor): GameState {
  return { ...state, actors: state.actors.map((a) => (a.id === id ? patch(a) : a)) }
}

/**
 * Gold purchase of a store item (every rewarded-ad item, and egg drops). The price rises
 * with each purchase until the next crown. An item that would do nothing right now costs nothing.
 */
export function buyItem(state: GameState, a: Actor, item: StoreItem): Result | null {
  const count = a.bought[item] ?? 0
  const price = storePrice(item, count)
  if (a.coins < price) return null
  const given = item === 'drop' ? patchActor(state, a.id, (o) => ({ ...o, drops: o.drops + 1 })) : grant(state, a, item)
  if (given === null) return null
  const paid = patchActor(given, a.id, (o) => ({ ...o, coins: o.coins - price, bought: { ...o.bought, [item]: count + 1 } }))
  return { state: paid, events: [{ type: 'bought', actor: a.id, item }] }
}

/** Crown shop: permanent perks. "Bigger Nest" adds its two spots to the nest right away. */
export function buyPerk(state: GameState, a: Actor, perk: Perk): Result | null {
  const level = a.perks[perk]
  const cost = perkCost(perk, level)
  if (cost === null || a.crowns < cost) return null
  const bought = patchActor(state, a.id, (o) => ({ ...o, crowns: o.crowns - cost, perks: { ...o.perks, [perk]: level + 1 } }))
  const withNest =
    perk === 'nest' ? { ...bought, nests: bought.nests.map((n, i) => (i === a.nest ? { ...n, perkSlots: n.perkSlots + 2 } : n)) } : bought
  return { state: withNest, events: [{ type: 'perk', actor: a.id, perk, level: level + 1 }] }
}

/** Put the egg you carry back where it was; one of your drops is used up. */
export function dropEgg(state: GameState, a: Actor): Result | null {
  if (a.carrying === null || a.drops < 1) return null
  const egg = a.carrying
  const dropped = patchActor({ ...state, eggs: [...state.eggs, egg] }, a.id, (o) => ({
    ...o,
    carrying: null,
    drops: o.drops - 1,
    ignoreEgg: egg.id,
  }))
  return { state: dropped, events: [{ type: 'eggDropped', actor: a.id }] }
}
