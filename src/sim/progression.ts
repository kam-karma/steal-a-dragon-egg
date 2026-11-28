import { CFG } from './config'
import type { Reward } from './types'

/**
 * Long-term progress, all numbers in one place:
 *  - the nest has three upgrade tracks (size, nursery, vault) bought with gold;
 *  - a rebirth gives a crown, crowns buy permanent perks that survive every rebirth;
 *  - the store sells every rewarded-ad item for gold too, a little dearer each time.
 */
export type NestTrack = 'size' | 'nursery' | 'vault'
export type Perk = 'nest' | 'quiet' | 'luck' | 'head' | 'drop'
export type StoreItem = Reward | 'drop'

export const MAX_LEVEL: Record<NestTrack, number> = { size: 5, nursery: 3, vault: 5 }

const CAPACITY = [6, 10, 16, 24, 32, 40] as const
const COSTS: Record<NestTrack, readonly number[]> = {
  size: [5_000, 25_000, 90_000, 250_000, 600_000],
  nursery: [8_000, 40_000, 150_000],
  vault: [12_000, 50_000, 150_000, 400_000, 900_000],
}
const GROWTH = [1, 1.5, 2, 3] as const

/** Babies the nest holds: its size level plus 2 per "Bigger Nest" crown perk. */
export function capacityOf(sizeLevel: number, nestPerk: number): number {
  return CAPACITY[Math.max(0, Math.min(CAPACITY.length - 1, sizeLevel))] + 2 * nestPerk
}

/** A bigger nest is bigger in the world too: 12% wider per size level. */
export function nestScale(sizeLevel: number): number {
  return 1 + 0.12 * sizeLevel
}

/** How close you must be to deliver into / steal from / claim at a nest of this size. */
export function nestReach(sizeLevel: number): number {
  return CFG.nestRadius * nestScale(sizeLevel)
}

/** How close the owner must stand to guard (and use) a nest of this size. */
export function guardReach(sizeLevel: number): number {
  return CFG.guardRadius + CFG.nestRadius * (nestScale(sizeLevel) - 1)
}

/** Gold for the next level of a track, or null when it is maxed. */
export function nextUpgradeCost(track: NestTrack, level: number): number | null {
  return COSTS[track][level] ?? null
}

/** How fast babies grow up (nursery level). */
export function growthSpeed(nursery: number): number {
  return GROWTH[Math.max(0, Math.min(GROWTH.length - 1, nursery))]
}

/** Income multiplier from the vault: +20% per level. */
export function vaultBonus(vault: number): number {
  return 1 + 0.2 * Math.max(0, vault)
}

/** Gold needed for the next rebirth: 1M, then +50% of that per crown already earned. */
export function rebirthCost(rebirths: number): number {
  return Math.round(1_000_000 * (1 + 0.5 * rebirths))
}

export const PERK_MAX: Record<Perk, number> = { nest: 5, quiet: 5, luck: 4, head: 5, drop: 3 }

/** Crowns for the next level of a perk: 1, 2, 3 …; null when maxed. */
export function perkCost(perk: Perk, level: number): number | null {
  return level >= PERK_MAX[perk] ? null : level + 1
}

/** Your own noise with the "Soft Steps" perk: −10% per level. */
export function quietFactor(level: number): number {
  return 1 - 0.1 * level
}

/** Shiny odds multiplier from the "Lucky Paws" perk: +50% per level. */
export function luckFactor(level: number): number {
  return 1 + 0.5 * level
}

/** Gold you start with after a rebirth, from the "Head Start" perk. */
export function headStart(level: number): number {
  return 5_000 * level
}

/** Egg drops you get back with every crown (and at the very start). */
export function dropsPerCrown(dropPerk: number): number {
  return 1 + dropPerk
}

const BASE_PRICE: Record<StoreItem, number> = {
  luck: 1_500,
  recover: 400,
  gold2x: 2_500,
  lullaby: 800,
  instantHatch: 300,
  grow: 1_200,
  totem: 1_500,
  boots: 500,
  streakShield: 1_000,
  drop: 800,
}

export const STORE_ITEMS = Object.keys(BASE_PRICE) as StoreItem[]

/** Every purchase makes the next one 60% dearer (counts reset with each crown). */
export function storePrice(item: StoreItem, bought: number): number {
  return Math.round((BASE_PRICE[item] * 1.6 ** bought) / 10) * 10
}
