import { describe, expect, it } from 'vitest'
import { CFG } from './config'
import { createGame, PLAYER_ID, stepGame } from './game'
import { makeLayout } from './world'
import type { Actor, GameState, Rarity } from './types'

const layout = makeLayout(7)
const still = { x: 0, z: 0 }
const RIVAL = 1

/** Player and one rival; other bots parked and frozen far away. Rival nest has babies. */
function setup(rivalPos: { x: number; z: number }, babies: Rarity[] = [0, 3, 1]): GameState {
  const g = createGame(layout, 1)
  return {
    ...g,
    actors: g.actors.map((a) => (a.id > RIVAL ? { ...a, stunned: 1e9, pos: { x: 0, z: -26 } } : a.id === RIVAL ? { ...a, pos: rivalPos, stunned: 1e9 } : a)),
    nests: g.nests.map((n, i) => (i === RIVAL ? { ...n, babies: babies.map((r, i) => ({ id: 100 + i, rarity: r, shiny: false, age: 0, nextCoin: 99 })) } : n)),
  }
}

function patch(g: GameState, id: number, p: Partial<Actor>): GameState {
  return { ...g, actors: g.actors.map((a) => (a.id === id ? { ...a, ...p } : a)) }
}

const far = { x: 0, z: 0 + 6 }

describe('stealing babies', () => {
  it('walking into an unguarded rival nest grabs its best baby', () => {
    let g = setup(far)
    g = patch(g, PLAYER_ID, { pos: layout.nests[RIVAL] })
    const r = stepGame(g, layout, still, 1 / 60)
    expect(r.state.actors[PLAYER_ID].stolen).toEqual({ rarity: 3, shiny: false, age: 0, from: RIVAL })
    expect(r.state.nests[RIVAL].babies.map((b) => b.rarity)).toEqual([0, 1])
    expect(r.events.some((e) => e.type === 'steal')).toBe(true)
  })

  it('cannot steal while the owner guards the nest', () => {
    let g = setup(layout.nests[RIVAL])
    g = { ...g, actors: g.actors.map((a) => (a.id === RIVAL ? { ...a, stunned: 0 } : a)) }
    g = patch(g, PLAYER_ID, { pos: layout.nests[RIVAL] })
    const r = stepGame(g, layout, still, 1 / 60)
    expect(r.state.actors[PLAYER_ID].stolen).toBeNull()
  })

  it('a stolen baby becomes yours at your nest', () => {
    let g = patch(setup(far), PLAYER_ID, { pos: layout.nests[PLAYER_ID], stolen: { rarity: 2, shiny: false, age: 0, from: RIVAL } })
    const r = stepGame(g, layout, still, 1 / 60)
    g = r.state
    expect(g.actors[PLAYER_ID].stolen).toBeNull()
    expect(g.nests[PLAYER_ID].babies.map((b) => b.rarity)).toEqual([2])
    expect(r.events.some((e) => e.type === 'claim')).toBe(true)
  })

  it('the owner touching the thief gets the baby back', () => {
    const meet = { x: 10, z: 10 }
    let g = setup(meet, [0])
    g = { ...g, actors: g.actors.map((a) => (a.id === RIVAL ? { ...a, stunned: 0 } : a)) }
    g = patch(g, PLAYER_ID, { pos: { x: 10.5, z: 10 }, stolen: { rarity: 3, shiny: false, age: 0, from: RIVAL } })
    const r = stepGame(g, layout, still, 1 / 60)
    expect(r.state.actors[PLAYER_ID].stolen).toBeNull()
    expect(r.state.actors[PLAYER_ID].stunned).toBeCloseTo(CFG.tagStun, 1)
    expect(r.state.nests[RIVAL].babies.map((b) => b.rarity)).toContain(3)
    expect(r.events.some((e) => e.type === 'recover')).toBe(true)
  })

  it('carrying a baby slows you down like an egg', () => {
    const g = patch(setup(far), PLAYER_ID, { pos: { x: 0, z: 20 }, stolen: { rarity: 0, shiny: false, age: 0, from: RIVAL } })
    const r = stepGame(g, layout, { x: 1, z: 0 }, 0.1)
    expect(r.state.actors[PLAYER_ID].pos.x).toBeCloseTo(CFG.carrySpeed * 0.1, 3)
  })
})

describe('raiding bots', () => {
  it('bots sometimes raid nests and claim babies over a long game', () => {
    let g = createGame(layout, 9)
    let steals = 0
    let claims = 0
    for (let k = 0; k < 60 * 400; k++) {
      const r = stepGame(g, layout, still, 1 / 60)
      steals += r.events.filter((e) => e.type === 'steal').length
      claims += r.events.filter((e) => e.type === 'claim').length
      g = r.state
    }
    expect(steals).toBeGreaterThan(0)
    expect(claims).toBeGreaterThan(0)
  })
})

describe('day-1 raid rules', () => {
  it('a totem guards the nest while its owner is away', () => {
    let g = setup(far)
    g = { ...g, actors: g.actors.map((a) => (a.id === RIVAL ? { ...a, items: { ...a.items, totemLeft: 30 } } : a)) }
    g = patch(g, PLAYER_ID, { pos: layout.nests[RIVAL] })
    expect(stepGame(g, layout, still, 1 / 60).state.actors[PLAYER_ID].stolen).toBeNull()
  })

  it('the same nest cannot be robbed again for a short while (CFG.stealGap)', () => {
    let g = setup(far)
    g = { ...g, time: 100, nests: g.nests.map((n, i) => (i === RIVAL ? { ...n, lastStolenAt: 100 - CFG.stealGap + 5 } : n)) }
    g = patch(g, PLAYER_ID, { pos: layout.nests[RIVAL] })
    expect(stepGame(g, layout, still, 1 / 60).state.actors[PLAYER_ID].stolen).toBeNull()
    expect(CFG.stealGap).toBeLessThanOrEqual(20)
    const later = { ...g, time: 106 }
    expect(stepGame(later, layout, still, 1 / 60).state.actors[PLAYER_ID].stolen).not.toBeNull()
  })

  it('a theft stamps the time on the robbed nest', () => {
    let g = { ...setup(far), time: 42 }
    g = patch(g, PLAYER_ID, { pos: layout.nests[RIVAL] })
    expect(stepGame(g, layout, still, 1 / 60).state.nests[RIVAL].lastStolenAt).toBeCloseTo(42, 3)
  })

  it('claiming a stolen baby gives the victim a 120 s insurance egg of the same rarity', () => {
    const g = patch(setup(far), PLAYER_ID, { pos: layout.nests[PLAYER_ID], stolen: { rarity: 3, shiny: false, age: 0, from: RIVAL } })
    const r = stepGame(g, layout, still, 1 / 60)
    const ins = r.state.nests[RIVAL].hatching.find((h) => h.insurance)
    expect(ins).toMatchObject({ rarity: 3, insurance: true })
    expect(ins?.left).toBeGreaterThan(119)
    expect(r.events).toContainEqual({ type: 'insurance', nest: RIVAL, rarity: 3 })
  })

  it('counts bots that rob the player and names the worst one nemesis; revenge pays triple xp', () => {
    let g = setup(far)
    g = { ...g, nemesisCounts: g.nemesisCounts.map((c, i) => (i === RIVAL ? 2 : c)) }
    g = patch(g, PLAYER_ID, { pos: layout.nests[RIVAL] })
    const r = stepGame(g, layout, still, 1 / 60)
    expect(r.events).toContainEqual({ type: 'revenge', actor: PLAYER_ID, victim: RIVAL })
    expect(r.state.actors[PLAYER_ID].xp).toBe(CFG.xpSteal * CFG.xpRevengeFactor)
  })

  it('a bot stealing from the player raises its nemesis count', () => {
    const g0 = createGame(layout, 1)
    let g: GameState = {
      ...g0,
      nests: g0.nests.map((n, i) => (i === PLAYER_ID ? { ...n, babies: [{ id: 1, rarity: 1, shiny: false, age: 0, nextCoin: 9 }] } : n)),
      actors: g0.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: { x: 0, z: 5 }, stunned: 1e9 } : a.id === RIVAL ? { ...a, pos: layout.nests[PLAYER_ID] } : { ...a, stunned: 1e9 })),
    }
    g = stepGame(g, layout, still, 1 / 60).state
    expect(g.nemesisCounts[RIVAL]).toBe(1)
  })

  it('xp: delivery 10 + 5 × rarity, steal 25, recover 20', () => {
    const egg = { id: 1, spot: 0, rarity: 2 as const, rainbow: false }
    const delivered = stepGame(patch(setup(far), PLAYER_ID, { pos: layout.nests[PLAYER_ID], carrying: egg }), layout, still, 1 / 60)
    expect(delivered.state.actors[PLAYER_ID].xp).toBe(20)
    const stole = stepGame(patch(setup(far), PLAYER_ID, { pos: layout.nests[RIVAL] }), layout, still, 1 / 60)
    expect(stole.state.actors[PLAYER_ID].xp).toBe(25)
  })
})
