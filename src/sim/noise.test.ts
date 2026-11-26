import { describe, expect, it } from 'vitest'
import { CFG } from './config'
import { SLEEPING, stepDragon } from './dragon'
import { createGame, PLAYER_ID, stepGame } from './game'
import { accumulate, culprit, noiseFrom } from './noise'
import { makeLayout } from './world'
import type { Actor, GameState } from './types'

const layout = makeLayout(7)
const base = createGame(layout, 1)
const me: Actor = base.actors[PLAYER_ID]
const bot: Actor = base.actors[1]
const egg = { id: 1, spot: 0, rarity: 0 as const, rainbow: false }

describe('noiseFrom', () => {
  it('is metres × 5.5, ×1.35 carrying, ×2 with the rainbow egg, ×0.5 with boots, × botNoiseFactor for bots', () => {
    expect(noiseFrom(me, 1)).toBeCloseTo(5.5, 6)
    expect(noiseFrom({ ...me, carrying: egg }, 1)).toBeCloseTo(5.5 * 1.35, 6)
    expect(noiseFrom({ ...me, carrying: { ...egg, rainbow: true } }, 1)).toBeCloseTo(11, 6)
    expect(noiseFrom({ ...me, items: { ...me.items, bootsLeft: 10 } }, 1)).toBeCloseTo(2.75, 6)
    expect(noiseFrom(bot, 1)).toBeCloseTo(5.5 * CFG.botNoiseFactor, 6)
  })
})

describe('accumulate and culprit', () => {
  it('adds per actor and remembers who made it', () => {
    const r = accumulate({ ...base, time: CFG.botQuietTime }, [0, 10, 30, 0, 0, 0, 0, 0], 0.1)
    expect(r.noise).toBeCloseTo(40, 6)
    expect(culprit(r.noiseShare)).toBe(2)
  })
  it('decays noise and shares together when it is quiet', () => {
    const loud: GameState = { ...base, noise: 40, noiseShare: [0, 10, 30, 0, 0, 0, 0, 0] }
    const r = accumulate(loud, [0, 0, 0, 0, 0, 0, 0, 0], 1)
    expect(r.noise).toBeCloseTo(40 - CFG.noiseDecay, 6)
    expect(r.noiseShare[2] / r.noiseShare[1]).toBeCloseTo(3, 6)
  })
  it('caps noise at 100', () => {
    expect(accumulate(base, [200, 0, 0, 0, 0, 0, 0, 0], 0.1).noise).toBe(100)
  })
  it('has no culprit when nobody made noise', () => {
    expect(culprit([0, 0, 0])).toBeNull()
  })
})

describe('lullaby', () => {
  it('a dragon under lullaby stays in stir even at full noise, then wakes when it ends', () => {
    const stirring = { ...SLEEPING, mode: 'stir' as const, lullaby: 1 }
    const held = stepDragon(stirring, 120, 0.5, null)
    expect(held.dragon.mode).toBe('stir')
    expect(held.dragon.lullaby).toBeCloseTo(0.5, 6)
    const later = stepDragon({ ...held.dragon, lullaby: 0 }, 120, 0.1, null)
    expect(later.dragon.mode).toBe('wake')
  })
})

describe('silence streak', () => {
  function delivering(g: GameState): GameState {
    return { ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: layout.nests[PLAYER_ID], carrying: egg } : { ...a, stunned: 1e9, pos: { x: 0, z: -26 } })) }
  }
  it('grows by one on every delivery while the dragon sleeps', () => {
    const r = stepGame(delivering(base), layout, { x: 0, z: 0 }, 1 / 60)
    expect(r.state.actors[PLAYER_ID].streak).toBe(1)
    expect(r.events.some((e) => e.type === 'streak')).toBe(true)
  })
  it('resets on wake, unless the shield is up (which is used up)', () => {
    const heap = layout.gold[0]
    const waking: GameState = {
      ...base,
      noise: 100,
      noiseShare: [100, 0, 0, 0, 0, 0, 0, 0],
      dragon: { ...SLEEPING, mode: 'stir' },
      actors: base.actors.map((a) =>
        a.id === PLAYER_ID ? { ...a, streak: 6, streakShield: true, pos: { x: heap.x, z: heap.z } } : { ...a, streak: 4, stunned: 1e9 },
      ),
    }
    const r = stepGame(waking, layout, { x: 0.05, z: 1 }, 1 / 60)
    const wake = r.events.find((e) => e.type === 'wake')
    expect(wake).toEqual({ type: 'wake', culprit: PLAYER_ID })
    expect(r.state.actors[PLAYER_ID].streak).toBe(6)
    expect(r.state.actors[PLAYER_ID].streakShield).toBe(false)
    expect(r.state.actors[1].streak).toBe(0)
  })
})

describe('calm start', () => {
  const added = base.actors.map((a) => (a.id === 1 ? 10 : 0))
  it('ignores bot noise for the first seconds so a new player learns the rules in peace', () => {
    expect(accumulate({ ...base, time: 0 }, added, 1 / 60).noise).toBe(0)
    expect(accumulate({ ...base, time: CFG.botQuietTime - 1 }, added, 1 / 60).noise).toBe(0)
  })
  it('still hears the player during the calm start', () => {
    const mine = base.actors.map((a) => (a.id === PLAYER_ID ? 10 : 0))
    expect(accumulate({ ...base, time: 0 }, mine, 1 / 60).noise).toBe(10)
  })
  it('hears bots again once the calm start is over', () => {
    expect(accumulate({ ...base, time: CFG.botQuietTime }, added, 1 / 60).noise).toBe(10)
  })
})
