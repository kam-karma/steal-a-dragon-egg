import { describe, expect, it } from 'vitest'
import { applyAction } from './actions'
import { CFG } from './config'
import { createGame, PLAYER_ID, stepGame } from './game'
import { makeLayout } from './world'
import type { Actor, Baby, GameState, Nest, Rarity } from './types'

const layout = makeLayout(7)
const home = layout.nests[PLAYER_ID]
const baby = (id: number, rarity: Rarity, age = 0): Baby => ({ id, rarity, shiny: false, age, nextCoin: 9 })

function game(me: Partial<Actor> = {}, nest: Partial<Nest> = {}): GameState {
  const g = createGame(layout, 1)
  return {
    ...g,
    actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: home, ...me } : a)),
    nests: g.nests.map((n, i) => (i === PLAYER_ID ? { ...n, ...nest } : n)),
  }
}
const act = (g: GameState, action: Parameters<typeof applyAction>[3]) => applyAction(g, layout, PLAYER_ID, action)
const me = (g: GameState) => g.actors[PLAYER_ID]

describe('no-ops (state stays exactly the same)', () => {
  it('merge with fewer than three', () => {
    const g = game({}, { babies: [baby(1, 0), baby(2, 0)] })
    expect(act(g, { type: 'merge', rarity: 0 }).state).toEqual(g)
  })
  it('buying without enough gold', () => {
    const g = game({ coins: 499 })
    expect(act(g, { type: 'buy', item: 'boots' }).state).toEqual(g)
    expect(act(g, { type: 'upgradeNest' }).state).toEqual(g)
    expect(act(g, { type: 'rebirth' }).state).toEqual(g)
  })
  it('nest actions far from home', () => {
    const g = game({ pos: { x: 0, z: 10 }, coins: 1e6 }, { babies: [baby(1, 0), baby(2, 0), baby(3, 0)] })
    expect(act(g, { type: 'merge', rarity: 0 }).state).toEqual(g)
    expect(act(g, { type: 'upgradeNest' }).state).toEqual(g)
  })
})

describe('nest actions', () => {
  it('merges three into one of the next rarity', () => {
    const r = act(game({}, { babies: [baby(1, 0), baby(2, 0), baby(3, 0)] }), { type: 'merge', rarity: 0 })
    expect(r.state.nests[PLAYER_ID].babies.map((b) => b.rarity)).toEqual([1])
    expect(r.events).toContainEqual({ type: 'merge', nest: PLAYER_ID, rarity: 1 })
  })
  it('upgrades capacity for 10000 then 80000', () => {
    const r1 = act(game({ coins: 100_000 }), { type: 'upgradeNest' })
    expect(r1.state.nests[PLAYER_ID].capacityLevel).toBe(1)
    expect(me(r1.state).coins).toBe(90_000)
    const r2 = act(r1.state, { type: 'upgradeNest' })
    expect(r2.state.nests[PLAYER_ID].capacityLevel).toBe(2)
    expect(me(r2.state).coins).toBe(10_000)
    expect(act(r2.state, { type: 'upgradeNest' }).state).toEqual(r2.state)
  })
  it('buys boots (500) and a totem (1500)', () => {
    const r = act(act(game({ coins: 2_000 }), { type: 'buy', item: 'boots' }).state, { type: 'buy', item: 'totem' })
    expect(me(r.state).items.bootsLeft).toBe(CFG.bootsTime)
    expect(me(r.state).items.totemLeft).toBe(CFG.totemTime)
    expect(me(r.state).coins).toBe(0)
  })
})

describe('rebirth', () => {
  it('clears gold, babies, hatching (insurance too), capacity and the carried egg; keeps xp', () => {
    const egg = { id: 77, spot: 3, rarity: 1 as const, rainbow: false }
    const g = game(
      { coins: CFG.rebirthCost + 10_000, carrying: egg, xp: 500, streak: 4 },
      { babies: [baby(1, 3)], hatching: [{ rarity: 2, left: 1, rainbow: false, insurance: true }], capacityLevel: 2 },
    )
    const r = act(g, { type: 'rebirth' })
    const n = r.state.nests[PLAYER_ID]
    expect(me(r.state)).toMatchObject({ coins: 0, carrying: null, rebirths: 1, xp: 500, streak: 0 })
    expect(n).toMatchObject({ babies: [], hatching: [], capacityLevel: 0 })
    expect(r.state.eggs.some((e) => e.id === 77)).toBe(true)
    expect(r.events).toContainEqual({ type: 'rebirth', actor: PLAYER_ID, rebirths: 1 })
  })
})

describe('rewards (granted after a rewarded ad)', () => {
  it('2× gold stacks 600 s at a time up to 1800 s', () => {
    let g = game()
    for (let k = 0; k < 4; k++) g = act(g, { type: 'grant', reward: 'gold2x' }).state
    expect(me(g).items.gold2xLeft).toBe(CFG.gold2xMax)
  })
  it('luck, boots, totem, lullaby and the streak shield', () => {
    let g = game()
    for (const reward of ['luck', 'boots', 'totem', 'lullaby', 'streakShield'] as const) g = act(g, { type: 'grant', reward }).state
    expect(me(g).items).toMatchObject({ luckLeft: CFG.luckTime, bootsLeft: CFG.bootsTime, totemLeft: CFG.totemTime })
    expect(g.dragon.lullaby).toBe(CFG.lullabyTime)
    expect(me(g).streakShield).toBe(true)
  })
  it('instant hatch finishes the rarest egg in the nest', () => {
    const g = game({}, { hatching: [{ rarity: 0, left: 2, rainbow: false, insurance: false }, { rarity: 3, left: 2, rainbow: false, insurance: false }] })
    const r = act(g, { type: 'grant', reward: 'instantHatch' })
    expect(r.state.nests[PLAYER_ID].hatching.map((h) => h.left)).toEqual([2, 0])
  })
  it('grow pushes the baby furthest from its next stage up one stage', () => {
    const g = game({}, { babies: [baby(1, 0, 250), baby(2, 0, 10), baby(3, 0, 950)] })
    const r = act(g, { type: 'grant', reward: 'grow' })
    expect(r.state.nests[PLAYER_ID].babies.map((b) => b.age)).toEqual([250, CFG.teenAge, 950])
  })
  it('recover puts the burned egg back in your hands', () => {
    const egg = { id: 5, spot: 2, rarity: 2 as const, rainbow: false }
    let g = game({ pos: { x: 0, z: 12 }, lastDrop: { rarity: 2, rainbow: false, babyNest: null } })
    g = { ...g, eggs: g.eggs.map((e) => (e.spot === 2 ? egg : e)) }
    const r = act(g, { type: 'grant', reward: 'recover' })
    expect(me(r.state).carrying).toEqual(egg)
    expect(me(r.state).lastDrop).toBeNull()
    expect(r.state.eggs.some((e) => e.id === 5)).toBe(false)
  })
  it('the action reaches the game through PlayerInput', () => {
    const r = stepGame(game({ coins: 600 }), layout, { x: 0, z: 0, action: { type: 'buy', item: 'boots' } }, 1 / 60)
    expect(me(r.state).items.bootsLeft).toBeGreaterThan(CFG.bootsTime - 1)
  })
})

describe('spending gold on cosmetics', () => {
  it('spends exactly the price when the player can afford it', () => {
    const r = act(game({ coins: 50_000, pos: { x: 0, z: 0 } }), { type: 'spend', amount: 30_000 })
    expect(me(r.state).coins).toBe(20_000)
  })
  it('does nothing without enough gold, or with a negative / non-finite price', () => {
    const g = game({ coins: 100 })
    expect(act(g, { type: 'spend', amount: 101 }).state).toEqual(g)
    expect(act(g, { type: 'spend', amount: -5 }).state).toEqual(g)
    expect(act(g, { type: 'spend', amount: Number.NaN }).state).toEqual(g)
  })
})
