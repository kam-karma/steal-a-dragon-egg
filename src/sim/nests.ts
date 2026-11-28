import { CFG } from './config'
import { babyIncome, babyStage, nestCapacity } from './economy'
import { growthSpeed, luckFactor, vaultBonus } from './progression'
import { nextSeed, seedToUnit } from './rng'
import type { Actor, Baby, GameEvent, Hatching, Nest, Rarity } from './types'

export function emptyNest(owner: number): Nest {
  return { owner, hatching: [], babies: [], capacityLevel: 0, nursery: 0, vault: 0, perkSlots: 0, lastStolenAt: -Infinity }
}

export interface NewEgg {
  readonly rarity: Rarity
  readonly rainbow: boolean
  readonly insurance: boolean
}

export function addEgg(nest: Nest, egg: NewEgg): Nest {
  const left = egg.insurance ? CFG.insuranceHatchTime : CFG.hatchTime
  return { ...nest, hatching: [...nest.hatching, { ...egg, left }] }
}

/** Room for one more delivered egg? Insurance eggs never block a nest. */
export function canAccept(nest: Nest): boolean {
  const used = nest.babies.length + nest.hatching.filter((h) => !h.insurance).length
  return used < nestCapacity(nest)
}

export interface NestStep {
  readonly nest: Nest
  readonly coins: number
  readonly events: readonly GameEvent[]
  readonly nextId: number
  readonly seed: number
}

/** Rainbow eggs: 60% epic, 30% legendary, 10% divine. */
function rainbowRarity(roll: number): Rarity {
  if (roll < 0.6) return 2
  if (roll < 0.9) return 3
  return 4
}

function shinyOdds(h: Hatching, owner: Actor): number {
  if (h.rainbow) return CFG.rainbowShinyOdds
  return (owner.items.luckLeft > 0 ? CFG.luckyShinyOdds : CFG.shinyOdds) * luckFactor(owner.perks.luck)
}

/** Hatches eggs (shiny roll, rainbow roll), ages babies and pays their coins to the owner. */
export function stepNest(nest: Nest, index: number, owner: Actor, dt: number, seed: number, nextId: number): NestStep {
  const events: GameEvent[] = []
  let s = seed
  let id = nextId
  const ticking = nest.hatching.map((h) => ({ ...h, left: h.left - dt }))
  const born: Baby[] = ticking
    .filter((h) => h.left <= 0)
    .map((h) => {
      s = nextSeed(s)
      const rarity = h.rainbow ? rainbowRarity(seedToUnit(s)) : h.rarity
      s = nextSeed(s)
      const shiny = seedToUnit(s) < shinyOdds(h, owner)
      const b: Baby = { id: id++, rarity, shiny, age: 0, nextCoin: CFG.coinEvery }
      events.push({ type: 'hatch', nest: index, rarity, shiny })
      if (shiny) events.push({ type: 'shiny', nest: index, baby: b.id })
      return b
    })

  let coins = 0
  const grow = growthSpeed(nest.nursery)
  const vault = vaultBonus(nest.vault)
  const babies = [...nest.babies, ...born].map((b, bi) => {
    const age = b.age + dt * grow
    const stage = babyStage(age)
    if (stage !== babyStage(b.age)) events.push({ type: 'grow', nest: index, baby: b.id, stage })
    const next = b.nextCoin - dt
    if (next > 0) return { ...b, age, nextCoin: next }
    const amount = babyIncome({ ...b, age }, owner) * vault * CFG.coinEvery
    coins += amount
    events.push({ type: 'coin', nest: index, amount, baby: bi })
    return { ...b, age, nextCoin: next + CFG.coinEvery }
  })

  return {
    nest: { ...nest, hatching: ticking.filter((h) => h.left > 0), babies },
    coins,
    events,
    nextId: id,
    seed: s,
  }
}

export function incomePerSecond(nest: Nest, owner: Actor): number {
  return nest.babies.reduce((sum, b) => sum + babyIncome(b, owner), 0) * vaultBonus(nest.vault)
}
