import { describe, expect, it } from 'vitest'
import { CFG } from './config'
import { createGame, NO_PERKS, PLAYER_ID, stepGame } from './game'
import { noiseFrom } from './noise'
import { makeLayout, onGold } from './world'
import type { Actor, GameState } from './types'

const layout = makeLayout(7)
const still = { x: 0, z: 0 }

/** Only the player moves: bots parked far away and frozen, calm start over. */
function solo(patch: Partial<Actor> = {}): GameState {
  const g = createGame(layout, 1)
  return {
    ...g,
    time: CFG.botQuietTime + 1,
    actors: g.actors.map((a) => (a.isBot ? { ...a, stunned: 1e9, pos: { x: 0, z: -26 } } : a.id === PLAYER_ID ? { ...a, ...patch } : a)),
  }
}
const me = (g: GameState): Actor => g.actors[PLAYER_ID]
const XP_LEVEL_6 = 25 * 6 * 7

describe('invisibility cloak', () => {
  it('makes your steps silent', () => {
    const a = createGame(layout, 1).actors[PLAYER_ID]
    expect(noiseFrom({ ...a, items: { ...a.items, cloakLeft: 10 } }, 3)).toBe(0)
  })
  it('the dragon fire cannot burn you', () => {
    const g0 = solo({ pos: { x: 0, z: 6 }, items: { ...createGame(layout, 1).actors[0].items, cloakLeft: 10 } })
    const g = { ...g0, dragon: { ...g0.dragon, mode: 'hunt' as const, fire: true, yaw: 0, t: 1 } }
    expect(stepGame(g, layout, still, 1 / 60).events.some((e) => e.type === 'burned' && e.actor === PLAYER_ID)).toBe(false)
  })
})

describe('Soft Steps perk', () => {
  it('makes you quieter, 10% per level', () => {
    const a = createGame(layout, 1).actors[PLAYER_ID]
    expect(noiseFrom({ ...a, perks: { ...NO_PERKS, quiet: 3 } }, 1)).toBeCloseTo(noiseFrom(a, 1) * 0.7, 6)
  })
})

describe('the dragon peeks (from level 3)', () => {
  const walkOffGold = (g: GameState): GameState => {
    // A stone tile next to the player's nest, walking along it.
    let s = g
    for (let k = 0; k < 30; k++) s = stepGame(s, layout, { x: 1, z: 0 }, 1 / 60).state
    return s
  }
  it('does not happen for a new player', () => {
    let g = solo()
    g = { ...g, happenings: { ...g.happenings, peekIn: 0.01 } }
    const r = stepGame(g, layout, still, 0.05)
    expect(r.events.some((e) => e.type === 'peekWarn' || e.type === 'peek')).toBe(false)
  })
  it('warns, then any step makes noise while its eye is open', () => {
    let g = solo({ xp: 25 * 3 * 4, pos: { x: layout.nests[PLAYER_ID].x * 0.85, z: layout.nests[PLAYER_ID].z * 0.85 } })
    expect(onGold(layout, me(g).pos)).toBe(false)
    g = { ...g, happenings: { ...g.happenings, peekIn: CFG.peekWarn + 0.01 } }
    const warned = stepGame(g, layout, still, 0.05)
    expect(warned.events).toContainEqual({ type: 'peekWarn' })
    g = { ...warned.state, happenings: { ...warned.state.happenings, peekIn: 0.01 } }
    const peeked = stepGame(g, layout, still, 0.05)
    expect(peeked.events).toContainEqual({ type: 'peek' })
    const after = walkOffGold(peeked.state)
    expect(after.noise).toBeGreaterThan(10)
  })
  it('ends after a few seconds', () => {
    let g = solo({ xp: 25 * 3 * 4 })
    g = { ...g, happenings: { ...g.happenings, peekIn: 99, peekLeft: 0.02 } }
    expect(stepGame(g, layout, still, 0.05).events).toContainEqual({ type: 'peekEnd' })
  })
})

describe('golden eggs (from level 6)', () => {
  it('delivering one pays a pile of gold', () => {
    const egg = { id: 900, spot: 0, rarity: 1 as const, rainbow: false, golden: true }
    const g = solo({ xp: XP_LEVEL_6, carrying: egg, pos: layout.nests[PLAYER_ID] })
    const r = stepGame(g, layout, still, 1 / 60)
    const paid = r.events.find((e) => e.type === 'golden')
    expect(paid).toBeDefined()
    expect(me(r.state).coins).toBeGreaterThan(500)
  })
  it('some eggs grow back golden for a level-6 player, never for a beginner', () => {
    const count = (xp: number): number => {
      let total = 0
      for (let seed = 1; seed <= 20; seed++) {
        let g = solo({ xp })
        g = { ...g, seed, eggs: [], regrow: g.regrow.map(() => 0.01) }
        total += stepGame(g, layout, still, 0.05).state.eggs.filter((e) => e.golden === true).length
      }
      return total
    }
    expect(count(0)).toBe(0)
    // 20 regrowths of every spot at 12%: dozens, not none and not all.
    const n = count(XP_LEVEL_6)
    expect(n).toBeGreaterThan(5)
    expect(n).toBeLessThan(120)
  })
})

describe('review fixes', () => {
  it('a dropped egg is not picked straight back up', () => {
    const spot = layout.spots[0]
    const egg = { id: 901, spot: 0, rarity: spot.rarity, rainbow: false }
    let g = solo({ carrying: egg, drops: 1, pos: spot.pos })
    g = { ...g, eggs: g.eggs.filter((e) => e.spot !== 0) }
    const r = stepGame(g, layout, { x: 0, z: 0, action: { type: 'dropEgg' } }, 1 / 60)
    expect(me(r.state).carrying).toBeNull()
    expect(me(r.state).drops).toBe(0)
    expect(r.state.eggs.some((e) => e.id === 901)).toBe(true)
  })
  it('the store does not charge for 2× gold at its cap, a second streak shield, or a lullaby while awake', () => {
    const items = createGame(layout, 1).actors[0].items
    const full = solo({ coins: 1e6, items: { ...items, gold2xLeft: CFG.gold2xMax } })
    expect(stepGame(full, layout, { x: 0, z: 0, action: { type: 'buyItem', item: 'gold2x' } }, 1 / 60).state.actors[PLAYER_ID].coins).toBe(1e6)
    const shielded = solo({ coins: 1e6, streakShield: true })
    expect(stepGame(shielded, layout, { x: 0, z: 0, action: { type: 'buyItem', item: 'streakShield' } }, 1 / 60).state.actors[PLAYER_ID].coins).toBe(1e6)
    const awake0 = solo({ coins: 1e6 })
    const awake = { ...awake0, dragon: { ...awake0.dragon, mode: 'hunt' as const, t: 0 } }
    expect(stepGame(awake, layout, { x: 0, z: 0, action: { type: 'buyItem', item: 'lullaby' } }, 1 / 60).state.actors[PLAYER_ID].coins).toBe(1e6)
  })
  it('a peek ends at once when the dragon wakes, so bots can run', () => {
    const g0 = solo({ xp: 25 * 3 * 4 })
    const g = { ...g0, dragon: { ...g0.dragon, mode: 'wake' as const }, happenings: { ...g0.happenings, peekLeft: 2.5 } }
    const r = stepGame(g, layout, still, 1 / 60)
    expect(r.state.happenings.peekLeft).toBe(0)
    expect(r.events).toContainEqual({ type: 'peekEnd' })
  })
  it('a crown keeps egg drops bought with gold', () => {
    const r = stepGame(solo({ coins: CFG.rebirthCost, drops: 5, pos: layout.nests[PLAYER_ID] }), layout, { x: 0, z: 0, action: { type: 'rebirth' } }, 1 / 60)
    expect(me(r.state).drops).toBe(5)
  })
  it('a bigger nest is also bigger to deliver into', () => {
    const home = layout.nests[PLAYER_ID]
    const egg = { id: 902, spot: 0, rarity: 0 as const, rainbow: false }
    const out = Math.hypot(home.x, home.z)
    const edge = { x: home.x * (1 - (CFG.nestRadius + 1) / out), z: home.z * (1 - (CFG.nestRadius + 1) / out) }
    const small = solo({ carrying: egg, pos: edge })
    expect(stepGame(small, layout, still, 1 / 60).events.some((e) => e.type === 'deliver')).toBe(false)
    const big = { ...small, nests: small.nests.map((n, i) => (i === PLAYER_ID ? { ...n, capacityLevel: 5 } : n)) }
    expect(stepGame(big, layout, still, 1 / 60).events.some((e) => e.type === 'deliver')).toBe(true)
  })
})

describe('egg drop, standing still', () => {
  it('the dropped egg stays on its spot while you stand there, and can be taken again after walking away', () => {
    const spot = layout.spots[0]
    const egg = { id: 903, spot: 0, rarity: spot.rarity, rainbow: false }
    let g = solo({ carrying: egg, drops: 1, pos: spot.pos })
    g = { ...g, eggs: g.eggs.filter((e) => e.spot !== 0) }
    g = stepGame(g, layout, { x: 0, z: 0, action: { type: 'dropEgg' } }, 1 / 60).state
    for (let k = 0; k < 180; k++) g = stepGame(g, layout, still, 1 / 60).state
    expect(me(g).carrying).toBeNull()
    g = { ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: { x: spot.pos.x + 3, z: spot.pos.z } } : a)) }
    g = stepGame(g, layout, still, 1 / 60).state
    expect(me(g).ignoreEgg).toBeNull()
    g = { ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: spot.pos } : a)) }
    g = stepGame(g, layout, still, 1 / 60).state
    expect(me(g).carrying?.id).toBe(903)
  })
})
