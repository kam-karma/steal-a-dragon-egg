import { describe, expect, it } from 'vitest'
import { CFG } from './config'
import { createGame } from './game'
import { addEgg, canAccept, emptyNest, stepNest } from './nests'
import { makeLayout } from './world'
import type { Actor, Baby, GameEvent, Nest } from './types'

const owner: Actor = createGame(makeLayout(7), 1).actors[0]
const lucky: Actor = { ...owner, items: { ...owner.items, luckLeft: 999 } }
const baby = (id: number, age = 0): Baby => ({ id, rarity: 0, shiny: false, age, nextCoin: 99 })

function run(nest: Nest, who: Actor, seconds: number, dt = 1) {
  let n = nest
  let seed = 7
  let nextId = 1000
  const events: GameEvent[] = []
  for (let t = 0; t < seconds; t += dt) {
    const r = stepNest(n, 0, who, dt, seed, nextId)
    n = r.nest
    seed = r.seed
    nextId = r.nextId
    events.push(...r.events)
  }
  return { nest: n, events }
}

describe('growth', () => {
  it('emits grow at 300 s (teen) and 900 s (adult)', () => {
    const r = run({ ...emptyNest(0), babies: [baby(1)] }, owner, 901)
    const stages = r.events.filter((e) => e.type === 'grow').map((e) => (e.type === 'grow' ? e.stage : -1))
    expect(stages).toEqual([1, 2])
    expect(r.nest.babies[0].age).toBeGreaterThanOrEqual(900)
  })
})

describe('hatching', () => {
  it('gives new babies unique ids from nextId', () => {
    let n = emptyNest(0)
    n = addEgg(n, { rarity: 1, rainbow: false, insurance: false })
    n = addEgg(n, { rarity: 1, rainbow: false, insurance: false })
    const r = stepNest(n, 0, owner, CFG.hatchTime + 0.1, 3, 500)
    expect(r.nest.babies.map((b) => b.id)).toEqual([500, 501])
    expect(r.nextId).toBe(502)
  })

  function shinyRate(who: Actor, n: number): number {
    let seed = 11
    let shiny = 0
    for (let k = 0; k < n; k++) {
      const nest = addEgg(emptyNest(0), { rarity: 0, rainbow: false, insurance: false })
      const r = stepNest(nest, 0, who, CFG.hatchTime + 0.1, seed, 1)
      seed = r.seed
      if (r.nest.babies[0].shiny) shiny++
    }
    return shiny / n
  }

  it('hatches shiny about 1 in 80', () => {
    const rate = shinyRate(owner, 8000)
    expect(rate).toBeGreaterThan(0.008)
    expect(rate).toBeLessThan(0.017)
  })

  it('hatches shiny about 1 in 25 with the luck potion', () => {
    const rate = shinyRate(lucky, 8000)
    expect(rate).toBeGreaterThan(0.03)
    expect(rate).toBeLessThan(0.05)
  })

  it('rainbow eggs hatch epic or better', () => {
    let seed = 5
    for (let k = 0; k < 200; k++) {
      const nest = addEgg(emptyNest(0), { rarity: 2, rainbow: true, insurance: false })
      const r = stepNest(nest, 0, owner, CFG.hatchTime + 0.1, seed, 1)
      seed = r.seed
      expect(r.nest.babies[0].rarity).toBeGreaterThanOrEqual(2)
    }
  })

  it('an insurance egg takes 120 s', () => {
    const nest = addEgg(emptyNest(0), { rarity: 3, rainbow: false, insurance: true })
    expect(run(nest, owner, 119).nest.babies).toHaveLength(0)
    expect(run(nest, owner, 121).nest.babies).toHaveLength(1)
  })
})

describe('capacity', () => {
  it('accepts eggs only while babies + hatching < capacity, insurance eggs do not count', () => {
    const five = { ...emptyNest(0), babies: [1, 2, 3, 4, 5].map((i) => baby(i)) }
    expect(canAccept(five)).toBe(true)
    const six = addEgg(five, { rarity: 0, rainbow: false, insurance: false })
    expect(canAccept(six)).toBe(false)
    const withInsurance = addEgg(five, { rarity: 0, rainbow: false, insurance: true })
    expect(canAccept(withInsurance)).toBe(true)
  })
})

describe('income', () => {
  it('pays babyIncome × 2 s every 2 s', () => {
    const r = stepNest({ ...emptyNest(0), babies: [{ ...baby(1), rarity: 2, nextCoin: 0.01 }] }, 0, owner, 0.02, 1, 1)
    expect(r.coins).toBeCloseTo(8 * CFG.coinEvery, 6)
  })
})
