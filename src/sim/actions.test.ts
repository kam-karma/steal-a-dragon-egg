import { describe, expect, it } from 'vitest'
import { applyAction } from './actions'
import { CFG } from './config'
import { nestCapacity } from './economy'
import { createGame, NO_PERKS, PLAYER_ID, stepGame } from './game'
import { MAX_LEVEL, nextUpgradeCost, rebirthCost, storePrice } from './progression'
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
    expect(act(g, { type: 'buyItem', item: 'luck' }).state).toEqual(g)
    expect(act(g, { type: 'upgrade', track: 'size' }).state).toEqual(g)
    expect(act(g, { type: 'rebirth' }).state).toEqual(g)
  })
  it('nest actions far from home', () => {
    const g = game({ pos: { x: 0, z: 10 }, coins: 1e6 }, { babies: [baby(1, 0), baby(2, 0), baby(3, 0)] })
    expect(act(g, { type: 'merge', rarity: 0 }).state).toEqual(g)
    expect(act(g, { type: 'upgrade', track: 'size' }).state).toEqual(g)
  })
})

describe('nest actions', () => {
  it('merges three into one of the next rarity', () => {
    const r = act(game({}, { babies: [baby(1, 0), baby(2, 0), baby(3, 0)] }), { type: 'merge', rarity: 0 })
    expect(r.state.nests[PLAYER_ID].babies.map((b) => b.rarity)).toEqual([1])
    expect(r.events).toContainEqual({ type: 'merge', nest: PLAYER_ID, rarity: 1 })
  })
  it('grows the nest level by level up to 40 spots, paying each level price', () => {
    let g = game({ coins: 1e7 })
    for (let k = 0; k < MAX_LEVEL.size; k++) {
      const price = nextUpgradeCost('size', k) as number
      const r = act(g, { type: 'upgrade', track: 'size' })
      expect(me(r.state).coins).toBe(me(g).coins - price)
      expect(r.events).toContainEqual({ type: 'upgraded', actor: PLAYER_ID, track: 'size', level: k + 1 })
      g = r.state
    }
    expect(nestCapacity(g.nests[PLAYER_ID])).toBe(40)
    expect(act(g, { type: 'upgrade', track: 'size' }).state).toEqual(g)
  })
  it('buys nursery and vault levels', () => {
    let g = game({ coins: 1e6 })
    g = act(g, { type: 'upgrade', track: 'nursery' }).state
    g = act(g, { type: 'upgrade', track: 'vault' }).state
    expect(g.nests[PLAYER_ID]).toMatchObject({ nursery: 1, vault: 1 })
  })
})

describe('store (gold)', () => {
  it('sells a rewarded-ad item anywhere, and each buy costs more', () => {
    let g = game({ coins: 10_000, pos: { x: 0, z: 0 } })
    const p0 = storePrice('boots', 0)
    g = act(g, { type: 'buyItem', item: 'boots' }).state
    expect(me(g).items.bootsLeft).toBe(CFG.bootsTime)
    expect(me(g).coins).toBe(10_000 - p0)
    const before = me(g).coins
    g = act(g, { type: 'buyItem', item: 'boots' }).state
    expect(me(g).coins).toBe(before - storePrice('boots', 1))
    expect(me(g).bought.boots).toBe(2)
  })
  it('does not charge for an item that would do nothing now', () => {
    const g = game({ coins: 10_000 })
    expect(act(g, { type: 'buyItem', item: 'instantHatch' }).state).toEqual(g)
  })
  it('sells extra egg drops', () => {
    const r = act(game({ coins: 10_000, drops: 0 }), { type: 'buyItem', item: 'drop' })
    expect(me(r.state).drops).toBe(1)
  })
})

describe('dropping the egg on your head', () => {
  const egg = { id: 77, spot: 3, rarity: 1 as const, rainbow: false }
  it('puts it back on its spot and uses one drop', () => {
    const r = act(game({ carrying: egg, drops: 1, pos: { x: 0, z: 10 } }), { type: 'dropEgg' })
    expect(me(r.state).carrying).toBeNull()
    expect(me(r.state).drops).toBe(0)
    expect(r.state.eggs).toContainEqual(egg)
    expect(r.events).toContainEqual({ type: 'eggDropped', actor: PLAYER_ID })
  })
  it('needs a drop left', () => {
    const g = game({ carrying: egg, drops: 0 })
    expect(act(g, { type: 'dropEgg' }).state).toEqual(g)
  })
})

describe('crown shop', () => {
  it('spends crowns on a permanent perk, one more crown per level', () => {
    let g = game({ crowns: 3 })
    g = act(g, { type: 'buyPerk', perk: 'quiet' }).state
    g = act(g, { type: 'buyPerk', perk: 'quiet' }).state
    expect(me(g)).toMatchObject({ crowns: 0, perks: expect.objectContaining({ quiet: 2 }) })
    expect(act(g, { type: 'buyPerk', perk: 'quiet' }).state).toEqual(g)
  })
  it('the Bigger Nest perk adds two spots that survive rebirth', () => {
    let g = game({ crowns: 1, coins: CFG.rebirthCost })
    g = act(g, { type: 'buyPerk', perk: 'nest' }).state
    expect(nestCapacity(g.nests[PLAYER_ID])).toBe(8)
    g = act(g, { type: 'rebirth' }).state
    expect(nestCapacity(g.nests[PLAYER_ID])).toBe(8)
  })
})

describe('rebirth', () => {
  it('clears gold, babies, hatching (insurance too), capacity and the carried egg; keeps xp', () => {
    const egg = { id: 77, spot: 3, rarity: 1 as const, rainbow: false }
    const g = game(
      { coins: CFG.rebirthCost + 10_000, carrying: egg, xp: 500, streak: 4 },
      { babies: [baby(1, 3)], hatching: [{ rarity: 2, left: 1, rainbow: false, insurance: true }], capacityLevel: 2, nursery: 2, vault: 3 },
    )
    const r = act(g, { type: 'rebirth' })
    const n = r.state.nests[PLAYER_ID]
    expect(me(r.state)).toMatchObject({ coins: 0, carrying: null, rebirths: 1, crowns: 1, xp: 500, streak: 0, drops: 1, bought: {} })
    expect(me(r.state).items.cloakLeft).toBe(CFG.cloakTime)
    expect(n).toMatchObject({ babies: [], hatching: [], capacityLevel: 0, nursery: 0, vault: 0 })
    expect(r.state.eggs.some((e) => e.id === 77)).toBe(true)
    expect(r.events).toContainEqual({ type: 'rebirth', actor: PLAYER_ID, rebirths: 1 })
  })
  it('the next crown costs more, and Head Start gives gold back', () => {
    const g = game({ coins: rebirthCost(1) - 1, rebirths: 1, perks: { ...NO_PERKS, head: 2 } })
    expect(act(g, { type: 'rebirth' }).state).toEqual(g)
    const r = act({ ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, coins: rebirthCost(1) } : a)) }, { type: 'rebirth' })
    expect(me(r.state).coins).toBe(10_000)
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
    const r = stepGame(game({ coins: 600 }), layout, { x: 0, z: 0, action: { type: 'buyItem', item: 'boots' } }, 1 / 60)
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

describe('mission bonus', () => {
  it('adds the gold and XP a finished mission pays, anywhere in the cave', () => {
    const g = game({ coins: 10, xp: 5, pos: { x: 0, z: 0 } })
    const r = act(g, { type: 'bonus', coins: 120, xp: 30 })
    expect(me(r.state).coins).toBe(130)
    expect(me(r.state).xp).toBe(35)
  })
  it('ignores negative or broken amounts', () => {
    const g = game({ coins: 10 })
    expect(act(g, { type: 'bonus', coins: -5, xp: 0 }).state).toEqual(g)
    expect(act(g, { type: 'bonus', coins: Number.NaN, xp: 0 }).state).toEqual(g)
  })
})

describe('bonus with crowns and drops (daily calendar, dragon book)', () => {
  it('adds a crown and egg drops, within small limits', () => {
    const g = game({ crowns: 0, drops: 1 })
    const r = act(g, { type: 'bonus', coins: 0, xp: 0, crowns: 1, drops: 2 })
    expect(me(r.state)).toMatchObject({ crowns: 1, drops: 3 })
    expect(act(g, { type: 'bonus', coins: 0, xp: 0, crowns: 5 }).state).toEqual(g)
  })
})
