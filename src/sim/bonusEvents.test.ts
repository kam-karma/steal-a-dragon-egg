import { describe, expect, it } from 'vitest'
import { CFG } from './config'
import { createGame, PLAYER_ID, stepGame } from './game'
import { eggPos } from './happenings'
import { moveActor } from './movement'
import { nextUnlock, UNLOCKS } from './unlocks'
import { makeLayout, onGold } from './world'
import type { Actor, GameState } from './types'

const layout = makeLayout(7)
const still = { x: 0, z: 0 }
const xpFor = (level: number): number => 25 * level * (level + 1)

function solo(patch: Partial<Actor> = {}): GameState {
  const g = createGame(layout, 1)
  return {
    ...g,
    time: CFG.botQuietTime + 1,
    actors: g.actors.map((a) => (a.isBot ? { ...a, stunned: 1e9, pos: { x: 0, z: -26 } } : a.id === PLAYER_ID ? { ...a, ...patch } : a)),
  }
}
const me = (g: GameState): Actor => g.actors[PLAYER_ID]

describe('unlock ladder', () => {
  it('opens something new every few levels, in order', () => {
    const levels = UNLOCKS.map((u) => u.level)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
    expect(UNLOCKS.length).toBeGreaterThanOrEqual(5)
    expect(nextUnlock(0)?.id).toBe('peek')
    expect(nextUnlock(CFG.peekLevel)?.id).toBe('rain')
    expect(nextUnlock(99)).toBeNull()
  })
})

describe('egg rain (level 4)', () => {
  const soon = (g: GameState): GameState => ({ ...g, happenings: { ...g.happenings, rainIn: 0.01 } })
  it('never rains for a beginner', () => {
    const r = stepGame(soon(solo()), layout, still, 0.05)
    expect(r.state.eggs.some((e) => e.rain === true)).toBe(false)
  })
  it('drops quiet eggs on the stone ring outside the hoard, which vanish after a while', () => {
    const r = stepGame(soon(solo({ xp: xpFor(4) })), layout, still, 0.05)
    expect(r.events).toContainEqual({ type: 'rain' })
    const rain = r.state.eggs.filter((e) => e.rain === true)
    expect(rain.length).toBe(CFG.rainCount)
    rain.forEach((e) => {
      const p = eggPos(e, r.state, layout)
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(CFG.hoardRadius)
      expect(onGold(layout, p)).toBe(false)
    })
    const later = stepGame({ ...r.state, time: r.state.time + CFG.rainTtl + 1 }, layout, still, 0.05)
    expect(later.state.eggs.some((e) => e.rain === true)).toBe(false)
  })
})

describe('treasure chest (level 8)', () => {
  it('appears on the hoard for a level-8 player', () => {
    const g = solo({ xp: xpFor(8) })
    const r = stepGame({ ...g, happenings: { ...g.happenings, chestIn: 0.01 } }, layout, still, 0.05)
    expect(r.state.eggs.filter((e) => e.chest === true)).toHaveLength(1)
    expect(r.events.some((e) => e.type === 'chestSpawn')).toBe(true)
  })
  it('is heavy: you walk slower carrying it', () => {
    const chest = { id: 950, spot: -2, rarity: 3 as const, rainbow: false, chest: true, pos: { x: 0, z: 12 } }
    const egg = { id: 951, spot: 0, rarity: 3 as const, rainbow: false }
    const a = me(solo({ pos: { x: 0, z: 20 } }))
    const withChest = moveActor(layout, { ...a, carrying: chest }, 1, 0, 0.1).walked
    const withEgg = moveActor(layout, { ...a, carrying: egg }, 1, 0, 0.1).walked
    expect(withChest).toBeLessThan(withEgg)
  })
  it('delivered home it pays a pile of gold and a free reward, without using a nest spot', () => {
    const chest = { id: 952, spot: -2, rarity: 3 as const, rainbow: false, chest: true, pos: { x: 0, z: 12 } }
    const r = stepGame(solo({ xp: xpFor(8), carrying: chest, pos: layout.nests[PLAYER_ID] }), layout, still, 1 / 60)
    const paid = r.events.find((e) => e.type === 'chest')
    expect(paid).toBeDefined()
    expect(me(r.state).coins).toBeGreaterThan(1000)
    expect(me(r.state).carrying).toBeNull()
    expect(r.state.nests[PLAYER_ID].hatching).toHaveLength(0)
  })
})

describe('rainbow shower (level 11)', () => {
  it('the rainbow egg comes back twice as fast', () => {
    const run = (xp: number): number => {
      const g0 = solo({ xp })
      let g = { ...g0, happenings: { ...g0.happenings, rainbowIn: 0.01 } }
      g = stepGame(g, layout, still, 0.05).state
      return g.happenings.rainbowIn
    }
    expect(run(xpFor(11))).toBeCloseTo(run(0) / 2, 0)
  })
})

describe('bots and the chest', () => {
  it('bots leave a fresh chest alone for a while', () => {
    const g0 = createGame(layout, 1)
    const t = 100
    const chest = { id: 960, spot: -2, rarity: 3 as const, rainbow: false, chest: true, pos: { x: 0, z: 10 }, expires: t + CFG.chestTtl }
    let s: GameState = { ...g0, time: t, eggs: [chest] }
    for (let k = 0; k < 60; k++) s = stepGame(s, layout, still, 1 / 30).state
    expect(s.actors.some((a) => a.isBot && a.carrying?.chest === true)).toBe(false)
  })
})

describe('review fixes for rain and chests', () => {
  it('a chest never spawns inside a rock', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g0 = solo({ xp: xpFor(8) })
      const r = stepGame({ ...g0, seed, happenings: { ...g0.happenings, chestIn: 0.01 } }, layout, still, 0.05)
      const c = r.state.eggs.find((e) => e.chest === true)
      expect(c).toBeDefined()
      const p = eggPos(c as NonNullable<typeof c>, r.state, layout)
      expect(layout.pillars.every((k) => Math.hypot(k.x - p.x, k.z - p.z) >= k.r + 1.2)).toBe(true)
    }
  })
  it('a rain egg picked up no longer runs out, even if put back late', () => {
    const egg = { id: 970, spot: -2, rarity: 0 as const, rainbow: false, rain: true, pos: { x: 0, z: 18 }, expires: CFG.botQuietTime + 5 }
    let g = solo({ pos: { x: 0, z: 18 }, drops: 1 })
    g = { ...g, eggs: [...g.eggs, egg] }
    g = stepGame(g, layout, still, 1 / 60).state
    expect(me(g).carrying?.id).toBe(970)
    g = { ...g, time: g.time + 60 }
    g = stepGame(g, layout, { x: 0, z: 0, action: { type: 'dropEgg' } }, 1 / 60).state
    g = stepGame(g, layout, still, 1 / 60).state
    expect(g.eggs.some((e) => e.id === 970)).toBe(true)
  })
  it('"get it back" returns the very egg you lost, chest included', () => {
    const chest = { id: 980, spot: -2, rarity: 3 as const, rainbow: false, chest: true, pos: { x: 0, z: 11 } }
    const legendary = { id: 981, spot: 0, rarity: 3 as const, rainbow: false }
    let g = solo({ pos: { x: 0, z: 20 }, lastDrop: { rarity: 3, rainbow: false, babyNest: null, eggId: 980 } })
    g = { ...g, eggs: [legendary, chest] }
    const r = stepGame(g, layout, { x: 0, z: 0, action: { type: 'grant', reward: 'recover' } }, 1 / 60)
    expect(me(r.state).carrying?.id).toBe(980)
  })
})
