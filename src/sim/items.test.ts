import { describe, expect, it } from 'vitest'
import { CFG } from './config'
import { createGame, PLAYER_ID } from './game'
import { spawnPan, stepItems, tryPickupPan, usePan } from './items'
import { makeLayout, onGold } from './world'
import type { GameState } from './types'

const layout = makeLayout(7)
const base = createGame(layout, 1)
const me = base.actors[PLAYER_ID]

function withPan(g: GameState): GameState {
  return { ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, items: { ...a.items, pans: 1 } } : a)) }
}

describe('timers', () => {
  it('counts every item timer down to zero', () => {
    const items = { pans: 1, panCooldown: 5, bootsLeft: 2, totemLeft: 0.5, luckLeft: 10, gold2xLeft: 1 }
    expect(stepItems(items, 1)).toEqual({ pans: 1, panCooldown: 4, bootsLeft: 1, totemLeft: 0, luckLeft: 9, gold2xLeft: 0 })
  })
})

describe('pan pickups', () => {
  it('walking onto a pan picks it up', () => {
    const pickups = [{ id: 9, kind: 'pan' as const, pos: me.pos, value: 0, ttl: Infinity }]
    const r = tryPickupPan(me, pickups)
    expect(r.picked).toBe(true)
    expect(r.actor.items.pans).toBe(1)
    expect(r.pickups).toHaveLength(0)
  })
  it('you can hold only one pan', () => {
    const pickups = [{ id: 9, kind: 'pan' as const, pos: me.pos, value: 0, ttl: Infinity }]
    const r = tryPickupPan({ ...me, items: { ...me.items, pans: 1 } }, pickups)
    expect(r.picked).toBe(false)
    expect(r.pickups).toHaveLength(1)
  })
  it('spawns on stone, never on gold or rocks', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = spawnPan({ ...base, seed, happenings: { ...base.happenings, panIn: 0 } }, layout)
      const pan = g.pickups.find((p) => p.kind === 'pan')
      expect(pan).toBeDefined()
      if (pan === undefined) continue
      expect(onGold(layout, pan.pos)).toBe(false)
      expect(layout.pillars.some((c) => Math.hypot(c.x - pan.pos.x, c.z - pan.pos.z) < c.r + 0.6)).toBe(false)
    }
  })
  it('does not spawn a second pan while one is on the floor', () => {
    const once = spawnPan({ ...base, happenings: { ...base.happenings, panIn: 0 } }, layout)
    const twice = spawnPan({ ...once, happenings: { ...once.happenings, panIn: 0 } }, layout)
    expect(twice.pickups.filter((p) => p.kind === 'pan')).toHaveLength(1)
  })
})

describe('banging the pan', () => {
  it('adds 40 noise credited to the banger and starts a 20 s cooldown', () => {
    const r = usePan(withPan(base), PLAYER_ID)
    expect(r.used).toBe(true)
    expect(r.state.noise).toBe(CFG.panNoise)
    expect(r.state.noiseShare[PLAYER_ID]).toBe(CFG.panNoise)
    expect(r.state.actors[PLAYER_ID].items.pans).toBe(0)
    expect(r.state.actors[PLAYER_ID].items.panCooldown).toBe(CFG.panCooldown)
  })
  it('does nothing and keeps the pan while the dragon is awake', () => {
    for (const mode of ['wake', 'hunt', 'settle'] as const) {
      const g = { ...withPan(base), dragon: { ...base.dragon, mode } }
      const r = usePan(g, PLAYER_ID)
      expect(r.used).toBe(false)
      expect(r.state).toEqual(g)
    }
  })
  it('does nothing during the cooldown', () => {
    const g = { ...base, actors: base.actors.map((a) => (a.id === PLAYER_ID ? { ...a, items: { ...a.items, pans: 1, panCooldown: 3 } } : a)) }
    expect(usePan(g, PLAYER_ID).used).toBe(false)
  })
})
