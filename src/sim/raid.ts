import { CFG } from './config'
import { guardReach, nestReach } from './progression'
import { handsFree } from './movement'
import { addEgg } from './nests'
import { dist } from './world'
import type { Actor, Baby, GameEvent, Layout, Nest, Rarity } from './types'

/** A nest is safe while its owner stands near it, or while their totem burns. */
export function isGuarded(layout: Layout, actors: readonly Actor[], nestIndex: number, nests?: readonly Nest[]): boolean {
  const owner = actors.find((a) => a.nest === nestIndex)
  if (owner === undefined) return false
  if (owner.items.totemLeft > 0) return true
  return owner.stunned <= 0 && dist(owner.pos, layout.nests[nestIndex]) < guardReach(nestSize(nests, nestIndex))
}

function nestSize(nests: readonly Nest[] | undefined, i: number): number {
  return nests?.[i]?.capacityLevel ?? 0
}

/** Robbed within the last 60 s: leave it alone for now. */
export function recentlyRobbed(nest: Nest, time: number): boolean {
  return time - nest.lastStolenAt < CFG.stealGap
}

function bestBabyIndex(babies: readonly Baby[]): number {
  let best = 0
  babies.forEach((b, i) => {
    if (b.rarity > babies[best].rarity || (b.rarity === babies[best].rarity && b.shiny && !babies[best].shiny)) best = i
  })
  return best
}

export interface RaidStep {
  readonly actor: Actor
  readonly nests: readonly Nest[]
  readonly events: readonly GameEvent[]
}

/** Walk into an unguarded rival nest with empty hands: grab its best baby. */
export function trySteal(layout: Layout, actors: readonly Actor[], nests: readonly Nest[], a: Actor, time: number): RaidStep {
  const none = { actor: a, nests, events: [] }
  if (!handsFree(a) || a.stunned > 0) return none
  const target = layout.nests.findIndex((p, i) => i !== a.nest && dist(p, a.pos) < nestReach(nestSize(nests, i)))
  if (target < 0) return none
  const nest = nests[target]
  if (nest.babies.length === 0 || isGuarded(layout, actors, target, nests) || recentlyRobbed(nest, time)) return none
  const k = bestBabyIndex(nest.babies)
  const { rarity, shiny, age } = nest.babies[k]
  const next = nests.map((n, i) => (i === target ? { ...n, babies: n.babies.filter((_, j) => j !== k), lastStolenAt: time } : n))
  return {
    actor: { ...a, stolen: { rarity, shiny, age, from: target } },
    nests: next,
    events: [{ type: 'steal', actor: a.id, from: target, rarity }],
  }
}

export interface BabyTraits {
  readonly rarity: Rarity
  readonly shiny: boolean
  readonly age: number
}

export function giveBaby(nests: readonly Nest[], index: number, baby: BabyTraits, id: number): readonly Nest[] {
  return nests.map((n, i) =>
    i === index ? { ...n, babies: [...n.babies, { rarity: baby.rarity, shiny: baby.shiny, age: baby.age, id, nextCoin: CFG.coinEvery }] } : n,
  )
}

/** Bring a stolen baby to your own nest: it is yours now, and the victim gets an insurance egg. */
export function tryClaim(layout: Layout, nests: readonly Nest[], a: Actor, babyId: number): RaidStep {
  if (a.stolen === null || dist(a.pos, layout.nests[a.nest]) >= nestReach(nestSize(nests, a.nest))) return { actor: a, nests, events: [] }
  const s = a.stolen
  const mine = giveBaby(nests, a.nest, s, babyId)
  const insured = mine.map((n, i) => (i === s.from ? addEgg(n, { rarity: s.rarity, rainbow: false, insurance: true }) : n))
  return {
    actor: { ...a, stolen: null },
    nests: insured,
    events: [
      { type: 'claim', actor: a.id, from: s.from, rarity: s.rarity },
      { type: 'insurance', nest: s.from, rarity: s.rarity },
    ],
  }
}

export interface TagResult {
  readonly actors: readonly Actor[]
  readonly nests: readonly Nest[]
  readonly events: readonly GameEvent[]
}

/** Touch the thief who has your baby: it flies home and the thief is dazed. */
export function resolveTags(actors: readonly Actor[], nests: readonly Nest[], nextId: number): TagResult {
  let out = [...actors]
  let ns = nests
  let id = nextId
  const events: GameEvent[] = []
  for (const thief of actors) {
    const s = thief.stolen
    // An invisible thief cannot be caught.
    if (s === null || thief.items.cloakLeft > 0) continue
    const owner = out.find((o) => o.nest === s.from)
    if (owner === undefined || owner.stunned > 0 || dist(owner.pos, thief.pos) > CFG.tagRange) continue
    ns = giveBaby(ns, s.from, s, id++)
    out = out.map((o) => {
      if (o.id === thief.id) return { ...o, stolen: null, stunned: CFG.tagStun, lastDrop: { rarity: s.rarity, rainbow: false, babyNest: s.from } }
      if (o.id === owner.id) return { ...o, xp: o.xp + CFG.xpRecover }
      return o
    })
    events.push({ type: 'recover', owner: owner.id, thief: thief.id, rarity: s.rarity })
  }
  return { actors: out, nests: ns, events }
}

/** The bot that robbed the player most (at least once), or null. */
export function nemesisOf(counts: readonly number[]): number | null {
  let best: number | null = null
  counts.forEach((c, i) => {
    if (c > 0 && (best === null || c > counts[best])) best = i
  })
  return best
}
