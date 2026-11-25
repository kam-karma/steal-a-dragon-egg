import { describe, expect, it } from 'vitest'
import { assignPersonality, botIntent } from './bots'
import { createGame, PLAYER_ID, stepGame } from './game'
import { makeLayout, NEST_COUNT, onGold, polar, nestAngle } from './world'
import type { GameEvent, GameState } from './types'

const layout = makeLayout(7)

describe('personalities', () => {
  it('are dealt in a fixed order to the 7 bots', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(assignPersonality)).toEqual(['careful', 'greedy', 'troll', 'avenger', 'careful', 'greedy', 'troll'])
    const g = createGame(layout, 1)
    expect(g.actors[PLAYER_ID].personality).toBeNull()
    expect(g.actors.slice(1).map((a) => a.personality)).toEqual(['careful', 'greedy', 'troll', 'avenger', 'careful', 'greedy', 'troll'])
  })
})

describe('layout with 8 nests', () => {
  it('keeps every nest corridor quiet in the outer ring', () => {
    expect(NEST_COUNT).toBe(8)
    for (let i = 0; i < NEST_COUNT; i++) expect(onGold(layout, polar(11, nestAngle(i)))).toBe(false)
  })
})

describe('troll', () => {
  it('bangs its pan while the player carries an egg deep in the hoard', () => {
    const g0 = createGame(layout, 1)
    const troll = g0.actors.find((a) => a.personality === 'troll')
    if (troll === undefined) throw new Error('no troll')
    let g: GameState = {
      ...g0,
      actors: g0.actors.map((a) =>
        a.id === PLAYER_ID
          ? { ...a, pos: { x: 0, z: 6 }, carrying: { id: 900, spot: 0, rarity: 3, rainbow: false }, stunned: 1e9 }
          : a.id === troll.id
            ? { ...a, items: { ...a.items, pans: 1 } }
            : { ...a, stunned: 1e9 },
      ),
    }
    const events: GameEvent[] = []
    for (let k = 0; k < 120 * 30; k++) {
      const r = stepGame(g, layout, { x: 0, z: 0 }, 1 / 30)
      events.push(...r.events)
      g = r.state
      if (events.some((e) => e.type === 'pan')) break
    }
    expect(events).toContainEqual({ type: 'pan', actor: troll.id })
  })
})

describe('avenger', () => {
  it('goes after the player nest once the player is carrying its baby', () => {
    const g0 = createGame(layout, 1)
    const avenger = g0.actors.find((a) => a.personality === 'avenger')
    if (avenger === undefined) throw new Error('no avenger')
    const g: GameState = {
      ...g0,
      nests: g0.nests.map((n, i) => (i === PLAYER_ID ? { ...n, babies: [{ id: 1, rarity: 2, shiny: false, age: 0, nextCoin: 9 }] } : n)),
      actors: g0.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: { x: 0, z: 10 }, stolen: { rarity: 1, shiny: false, age: 0, from: avenger.nest } } : a)),
    }
    // The avenger first chases; once it cannot see the thief it still holds the grudge.
    const far = { ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: { x: 0, z: -24 } } : a)) }
    const intent = botIntent(far, layout, far.actors[avenger.id], 1 / 30, 0.5)
    expect(intent.brain.grudge).toBeGreaterThan(0)
    expect(intent.brain.raidNest).toBe(PLAYER_ID)
  })
})

describe('human mistakes', () => {
  it('a bot sometimes wanders off for a moment', () => {
    const g0 = createGame(layout, 1)
    const bot = { ...g0.actors[1], bot: g0.actors[1].bot && { ...g0.actors[1].bot, oopsIn: 0.01 } }
    const intent = botIntent({ ...g0, actors: g0.actors.map((a) => (a.id === 1 ? bot : a)) }, layout, bot, 1 / 30, 0.3)
    expect(intent.brain.oopsLeft).toBeGreaterThan(0)
    expect(intent.brain.oopsIn).toBeGreaterThanOrEqual(20)
  })
})

describe('rainbow rush', () => {
  it('greedy bots head for the rainbow egg as soon as it is announced', () => {
    const g0 = createGame(layout, 1)
    const greedy = g0.actors.find((a) => a.personality === 'greedy')
    if (greedy === undefined) throw new Error('no greedy')
    const g: GameState = { ...g0, happenings: { ...g0.happenings, rainbowWarned: true, rainbowIn: 5 } }
    const intent = botIntent(g, layout, g.actors[greedy.id], 1 / 30, 0.9)
    expect(Math.hypot(intent.brain.target?.x ?? 99, intent.brain.target?.z ?? 99)).toBeLessThan(6)
  })
})

describe('bots move without shaking', () => {
  /** Counts direction reversals that come less than 0.3 s after the previous one. */
  function rapidReversals(seconds: number): number {
    const layout = makeLayout(7)
    let s = createGame(layout, 3)
    const last = s.actors.map(() => ({ x: 0, z: 0 }))
    const lastRev = s.actors.map(() => -99)
    let rapid = 0
    for (let k = 0; k < 60 * seconds; k++) {
      const before = s.actors.map((a) => a.pos)
      s = stepGame(s, layout, { x: 0, z: 0 }, 1 / 60).state
      s.actors.forEach((a, i) => {
        if (!a.isBot) return
        const mx = a.pos.x - before[i].x
        const mz = a.pos.z - before[i].z
        const m = Math.hypot(mx, mz)
        if (m < 1e-4) return
        const l = last[i]
        const lm = Math.hypot(l.x, l.z)
        if (lm > 1e-4 && (mx * l.x + mz * l.z) / (m * lm) < -0.5) {
          if (k / 60 - lastRev[i] < 0.3) rapid++
          lastRev[i] = k / 60
        }
        last[i] = { x: mx, z: mz }
      })
    }
    return rapid
  }

  it('do not flip back and forth at the edge of the hoard when the dragon wakes', () => {
    expect(rapidReversals(120)).toBeLessThan(20)
  })
})
