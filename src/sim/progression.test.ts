import { describe, expect, it } from 'vitest'
import {
  capacityOf,
  growthSpeed,
  MAX_LEVEL,
  nextUpgradeCost,
  perkCost,
  rebirthCost,
  STORE_ITEMS,
  storePrice,
  vaultBonus,
} from './progression'

describe('nest upgrades', () => {
  it('lets the nest grow through six sizes, much bigger than before', () => {
    expect(MAX_LEVEL.size).toBe(5)
    expect(capacityOf(0, 0)).toBe(6)
    expect(capacityOf(5, 0)).toBe(40)
    expect(capacityOf(5, 2)).toBe(44)
  })
  it('each next level costs more, and a maxed track has no price', () => {
    for (const track of ['size', 'nursery', 'vault'] as const) {
      for (let l = 1; l < MAX_LEVEL[track]; l++) expect(nextUpgradeCost(track, l)).toBeGreaterThan(nextUpgradeCost(track, l - 1) as number)
      expect(nextUpgradeCost(track, MAX_LEVEL[track])).toBeNull()
    }
  })
  it('the nursery makes babies grow faster and the vault adds gold', () => {
    expect(growthSpeed(0)).toBe(1)
    expect(growthSpeed(3)).toBeGreaterThan(growthSpeed(1))
    expect(vaultBonus(0)).toBe(1)
    expect(vaultBonus(5)).toBeCloseTo(2, 6)
  })
})

describe('crowns', () => {
  it('a rebirth costs more each time', () => {
    expect(rebirthCost(0)).toBe(1_000_000)
    expect(rebirthCost(2)).toBeGreaterThan(rebirthCost(1))
  })
  it('crown perks cost one more crown per level and stop at their maximum', () => {
    expect(perkCost('quiet', 0)).toBe(1)
    expect(perkCost('quiet', 2)).toBe(3)
    expect(perkCost('drop', 3)).toBeNull()
  })
})

describe('store', () => {
  it('sells every rewarded-ad item and egg drops for gold', () => {
    expect(STORE_ITEMS).toEqual(expect.arrayContaining(['luck', 'gold2x', 'boots', 'totem', 'lullaby', 'drop']))
  })
  it('gets more expensive with every purchase', () => {
    const p0 = storePrice('boots', 0)
    expect(storePrice('boots', 1)).toBeGreaterThan(p0)
    expect(storePrice('boots', 3)).toBeGreaterThan(storePrice('boots', 2))
  })
})
