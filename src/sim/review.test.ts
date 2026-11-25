import { describe, expect, it } from 'vitest'
import { applyAction } from './actions'
import { botIntent } from './bots'
import { CFG } from './config'
import { createGame, PLAYER_ID, stepGame } from './game'
import { applySave, fromSave, toSave } from './save'
import { blocked, makeLayout } from './world'
import type { Baby, GameEvent, GameState, Rarity } from './types'

const layout = makeLayout(7)
const still = { x: 0, z: 0 }
const baby = (id: number, rarity: Rarity): Baby => ({ id, rarity, shiny: false, age: 0, nextCoin: 9 })
const openSpot = layout.spots.find((s) => !blocked(layout, { x: 0, z: 0 }, s.pos))?.pos ?? { x: 0, z: 9 }

describe('fix 1: returned babies get real ids', () => {
  it('a burned thief returns the stolen baby with a fresh unique id', () => {
    const g0 = createGame(layout, 1)
    const g: GameState = {
      ...g0,
      nests: g0.nests.map((n, i) => (i === PLAYER_ID ? { ...n, babies: [baby(100, 0), baby(101, 0)] } : n)),
      actors: g0.actors.map((a) =>
        a.id === 1 ? { ...a, pos: openSpot, stolen: { rarity: 3, shiny: false, age: 0, from: PLAYER_ID } } : { ...a, stunned: 1e9, pos: { x: 0, z: -26 } },
      ),
      dragon: { mode: 'hunt', t: 1, yaw: Math.atan2(openSpot.x, openSpot.z), fire: true, wakes: 1, lullaby: 0 },
    }
    const r = stepGame(g, layout, still, 1 / 60)
    const ids = r.state.nests[PLAYER_ID].babies.map((b) => b.id)
    expect(ids.every((id) => id >= 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('rebirth while carrying a stolen baby returns it with a real id', () => {
    const g0 = createGame(layout, 1)
    const g: GameState = {
      ...g0,
      actors: g0.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: layout.nests[PLAYER_ID], coins: CFG.rebirthCost, stolen: { rarity: 2, shiny: false, age: 0, from: 1 } } : a)),
    }
    const r = applyAction(g, layout, PLAYER_ID, { type: 'rebirth' })
    expect(r.state.nests[1].babies.map((b) => b.id).every((id) => id >= 0)).toBe(true)
  })
})

describe('fix 2: the save never loses babies', () => {
  it('keeps babies above capacity (insurance, claims and returns ignore capacity)', () => {
    const g0 = createGame(layout, 1)
    const seven = [0, 1, 2, 3, 4, 5, 6].map((i) => baby(200 + i, i === 6 ? 3 : 1))
    const g: GameState = { ...g0, nests: g0.nests.map((n, i) => (i === PLAYER_ID ? { ...n, babies: seven } : n)) }
    const back = fromSave(JSON.parse(JSON.stringify(toSave(g, 0))))
    expect(back?.babies).toHaveLength(7)
    expect(back?.babies.some((b) => b.rarity === 3)).toBe(true)
  })
  it('a baby being carried off by a thief is saved as an insurance egg', () => {
    const g0 = createGame(layout, 1)
    const g: GameState = { ...g0, actors: g0.actors.map((a) => (a.id === 2 ? { ...a, stolen: { rarity: 3, shiny: true, age: 50, from: PLAYER_ID } } : a)) }
    const loaded = applySave(createGame(layout, 2), toSave(g, 0))
    expect(loaded.nests[PLAYER_ID].hatching).toContainEqual({ rarity: 3, left: CFG.insuranceHatchTime, rainbow: false, insurance: true })
  })
})

describe('fix 3: a full nest never traps the child', () => {
  function atFullNest(babies: Baby[]): GameState {
    const g0 = createGame(layout, 1)
    return {
      ...g0,
      nests: g0.nests.map((n, i) => (i === PLAYER_ID ? { ...n, babies } : n)),
      actors: g0.actors.map((a) =>
        a.id === PLAYER_ID ? { ...a, pos: { x: 0, z: 17 }, carrying: { id: 99, spot: 4, rarity: 1, rainbow: false } } : { ...a, stunned: 1e9, pos: { x: 0, z: -26 } },
      ),
      eggs: g0.eggs.filter((e) => e.spot !== 4),
    }
  }
  function walkHome(g0: GameState): { g: GameState; events: GameEvent[] } {
    let g = g0
    const events: GameEvent[] = []
    for (let k = 0; k < 120; k++) {
      const r = stepGame(g, layout, { x: 0, z: 1 }, 1 / 60)
      events.push(...r.events)
      g = r.state
    }
    return { g, events }
  }
  it('with nothing to merge, the egg goes back to its spot and the hands are free', () => {
    const r = walkHome(atFullNest([baby(1, 0), baby(2, 0), baby(3, 1), baby(4, 1), baby(5, 2), baby(6, 3)]))
    expect(r.g.actors[PLAYER_ID].carrying).toBeNull()
    expect(r.g.eggs.some((e) => e.id === 99 && e.spot === 4)).toBe(true)
    expect(r.events).toContainEqual({ type: 'nestFull', actor: PLAYER_ID, canMerge: false })
  })
  it('with a triple to merge, the egg stays in hand so one tap makes room', () => {
    const r = walkHome(atFullNest([baby(1, 0), baby(2, 0), baby(3, 0), baby(4, 1), baby(5, 2), baby(6, 3)]))
    expect(r.g.actors[PLAYER_ID].carrying?.id).toBe(99)
    expect(r.events).toContainEqual({ type: 'nestFull', actor: PLAYER_ID, canMerge: true })
  })
})

describe('fix 4: bots with no room leave the rainbow egg alone', () => {
  it('a greedy bot whose nest is full and unmergeable does not chase the rainbow egg', () => {
    const g0 = createGame(layout, 1)
    const greedy = g0.actors.find((a) => a.personality === 'greedy')
    if (greedy === undefined) throw new Error('no greedy bot')
    // 16 babies, no triple of any mergeable rarity (two of each 0..3, the rest divine).
    const full = [0, 1, 2, 3, 0, 1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4].map((r, i) => baby(300 + i, r as Rarity))
    const g: GameState = {
      ...g0,
      happenings: { ...g0.happenings, rainbowWarned: true, rainbowIn: 5 },
      nests: g0.nests.map((n, i) => (i === greedy.nest ? { ...n, babies: full, capacityLevel: 2 } : n)),
    }
    const intent = botIntent(g, layout, g.actors[greedy.id], 1 / 30, 0.9)
    const t = intent.brain.target
    expect(t === null || Math.hypot(t.x, t.z) > 6).toBe(true)
  })
  it('bots start with the biggest nest so they rarely fill up', () => {
    const g = createGame(layout, 1)
    expect(g.nests.filter((n) => n.owner !== PLAYER_ID).every((n) => n.capacityLevel === 2)).toBe(true)
    expect(g.nests[PLAYER_ID].capacityLevel).toBe(0)
  })
})
