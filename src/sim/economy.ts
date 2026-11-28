import { CFG, INCOME } from './config'
import { capacityOf } from './progression'
import type { Actor, Baby, Nest, Rarity } from './types'

export type Stage = 0 | 1 | 2

const STAGE_MULTIPLIER: Record<Stage, number> = { 0: 1, 1: 2, 2: 4 }
const TITLES = ['Acemi Fare', 'Gölge Pati', 'Sessiz Rüzgâr', 'Altın Parmak', 'Ejderha Fısıldayan'] as const

/** Baby (0) → teen (1) → adult (2), by seconds of active play. */
export function babyStage(age: number): Stage {
  if (age >= CFG.adultAge) return 2
  if (age >= CFG.teenAge) return 1
  return 0
}

export function streakMultiplier(streak: number): number {
  return Math.min(2, 1 + 0.1 * streak)
}

/**
 * Coins per second of one baby for its owner. Every boost multiplies, but the
 * product is capped at ×12 so incomes never explode; rebirths stay outside the cap.
 */
export function babyIncome(b: Baby, owner: Actor): number {
  const boosts =
    STAGE_MULTIPLIER[babyStage(b.age)] *
    (b.shiny ? CFG.shinyMultiplier : 1) *
    streakMultiplier(owner.streak) *
    (owner.items.gold2xLeft > 0 ? 2 : 1)
  return INCOME[b.rarity] * Math.min(CFG.multiplierCap, boosts) * CFG.rebirthBonus ** owner.rebirths
}

/** Spots in a nest: its size level plus the crown-perk spots. */
export function nestCapacity(nest: Pick<Nest, 'capacityLevel' | 'perkSlots'>): number {
  return capacityOf(nest.capacityLevel, 0) + nest.perkSlots
}

/** Three babies of one rarity → one baby of the next. The youngest are used up first. */
export function mergeBabies(nest: Nest, rarity: Rarity, nextId: number): { nest: Nest; made: Baby } | null {
  if (rarity >= 4) return null
  const same = nest.babies.filter((b) => b.rarity === rarity).sort((p, q) => p.age - q.age)
  if (same.length < CFG.mergeCount) return null
  const used = new Set(same.slice(0, CFG.mergeCount).map((b) => b.id))
  const made: Baby = { id: nextId, rarity: (rarity + 1) as Rarity, shiny: false, age: 0, nextCoin: CFG.coinEvery }
  return { nest: { ...nest, babies: [...nest.babies.filter((b) => !used.has(b.id)), made] }, made }
}

/** True when some rarity has three babies that could be merged. */
export function hasTriple(nest: Nest): boolean {
  return ([0, 1, 2, 3] as const).some((r) => nest.babies.filter((b) => b.rarity === r).length >= CFG.mergeCount)
}

/** Level n needs 25·n·(n+1) total XP. */
export function levelFromXp(xp: number): number {
  let n = 0
  while (25 * (n + 1) * (n + 2) <= xp) n++
  return n
}

export function titleFor(level: number): string {
  return TITLES[Math.min(TITLES.length - 1, Math.floor(level / 5))]
}
