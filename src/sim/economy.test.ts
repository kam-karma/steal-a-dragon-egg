import { describe, expect, it } from 'vitest'
import { babyIncome, babyStage, levelFromXp, mergeBabies, nestCapacity, streakMultiplier, titleFor, upgradeCost } from './economy'
import { createGame } from './game'
import { emptyNest } from './nests'
import { makeLayout } from './world'
import type { Actor, Baby, Rarity } from './types'

const owner: Actor = createGame(makeLayout(7), 1).actors[0]
const baby = (rarity: Rarity, age = 0, shiny = false, id = 1): Baby => ({ id, rarity, shiny, age, nextCoin: 2 })

describe('growth', () => {
  it('baby → teen at 300 s → adult at 900 s', () => {
    expect(babyStage(0)).toBe(0)
    expect(babyStage(299)).toBe(0)
    expect(babyStage(300)).toBe(1)
    expect(babyStage(900)).toBe(2)
  })
})

describe('income', () => {
  it('epic adult shiny with streak 10 earns 8 × min(12, 4·3·2) = 96 per second', () => {
    expect(babyIncome(baby(2, 900, true), { ...owner, streak: 10 })).toBeCloseTo(96, 6)
  })
  it('rebirths multiply outside the cap (1.3^2)', () => {
    expect(babyIncome(baby(2, 900, true), { ...owner, streak: 10, rebirths: 2 })).toBeCloseTo(96 * 1.69, 6)
  })
  it('2× gold doubles and still respects the ×12 cap', () => {
    const rich = { ...owner, streak: 10, items: { ...owner.items, gold2xLeft: 60 } }
    expect(babyIncome(baby(0, 900, true), rich)).toBeCloseTo(12, 6)
    expect(babyIncome(baby(0, 0, false), rich)).toBeCloseTo(4, 6)
  })
  it('streak multiplier grows 0.1 per delivery up to ×2', () => {
    expect(streakMultiplier(0)).toBe(1)
    expect(streakMultiplier(4)).toBeCloseTo(1.4, 6)
    expect(streakMultiplier(50)).toBe(2)
  })
})

describe('nest capacity', () => {
  it('is 6 / 10 / 16 and upgrades cost 10000 / 80000 (balanced)', () => {
    expect([nestCapacity(0), nestCapacity(1), nestCapacity(2)]).toEqual([6, 10, 16])
    expect([upgradeCost(0), upgradeCost(1)]).toEqual([10_000, 80_000])
  })
})

describe('merging', () => {
  it('needs three babies of the same rarity', () => {
    const nest = { ...emptyNest(0), babies: [baby(1, 0, false, 1), baby(1, 0, false, 2), baby(2, 0, false, 3)] }
    expect(mergeBabies(nest, 1, 50)).toBeNull()
  })
  it('three legendaries become one divine, using the youngest first', () => {
    const nest = { ...emptyNest(0), babies: [baby(3, 800, false, 1), baby(3, 10, false, 2), baby(3, 20, false, 3), baby(3, 30, false, 4), baby(0, 0, false, 5)] }
    const r = mergeBabies(nest, 3, 50)
    expect(r).not.toBeNull()
    expect(r?.made).toMatchObject({ id: 50, rarity: 4, age: 0 })
    expect(r?.nest.babies.map((b) => b.id).sort()).toEqual([1, 5, 50])
  })
  it('divine babies cannot be merged further', () => {
    const nest = { ...emptyNest(0), babies: [baby(4, 0, false, 1), baby(4, 0, false, 2), baby(4, 0, false, 3)] }
    expect(mergeBabies(nest, 4, 9)).toBeNull()
  })
})

describe('levels', () => {
  it('level n needs 25·n·(n+1) total xp', () => {
    expect(levelFromXp(0)).toBe(0)
    expect(levelFromXp(50)).toBe(1)
    expect(levelFromXp(149)).toBe(1)
    expect(levelFromXp(150)).toBe(2)
  })
  it('has a title every 5 levels', () => {
    expect(titleFor(0)).toBe('Acemi Fare')
    expect(titleFor(5)).toBe('Gölge Pati')
    expect(titleFor(15)).toBe('Altın Parmak')
    expect(titleFor(99)).toBe('Ejderha Fısıldayan')
  })
})
