import { describe, expect, it } from 'vitest'
import { CFG } from './config'
import { SLEEPING, stepDragon } from './dragon'
import { createGame, PLAYER_ID, stepGame } from './game'
import { blocked, makeLayout, onGold } from './world'
import type { Actor, GameState, Layout } from './types'

const layout = makeLayout(7)
const still = { x: 0, z: 0 }

/** A game with only the player (bots parked far away and frozen). */
function soloGame(l: Layout = layout): GameState {
  const g = createGame(l, 1)
  return { ...g, actors: g.actors.map((a) => (a.isBot ? { ...a, stunned: 1e9, pos: { x: 0, z: -26 } } : a)) }
}

function withPlayer(g: GameState, patch: Partial<Actor>): GameState {
  return { ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, ...patch } : a)) }
}

const player = (g: GameState): Actor => g.actors[PLAYER_ID]

describe('layout', () => {
  it('is deterministic for a seed', () => {
    expect(makeLayout(7)).toEqual(layout)
  })
  it('keeps the nest corridors quiet in the outer ring', () => {
    const p = { x: 0, z: 11 }
    expect(onGold(layout, p)).toBe(false)
  })
  it('has rare eggs deeper than common ones', () => {
    const r = (k: number) => Math.hypot(layout.spots[k].pos.x, layout.spots[k].pos.z)
    const legendary = layout.spots.findIndex((s) => s.rarity === 3)
    const common = layout.spots.findIndex((s) => s.rarity === 0)
    expect(r(legendary)).toBeLessThan(r(common))
  })
})

describe('eggs and nests', () => {
  it('picks up an egg by walking into it, delivers it, hatches and earns coins', () => {
    const spot = layout.spots[0]
    let g = withPlayer(soloGame(), { pos: spot.pos })
    g = stepGame(g, layout, still, 1 / 60).state
    expect(player(g).carrying?.rarity).toBe(spot.rarity)

    g = withPlayer(g, { pos: layout.nests[PLAYER_ID] })
    const delivered = stepGame(g, layout, still, 1 / 60)
    expect(delivered.events.some((e) => e.type === 'deliver')).toBe(true)
    g = delivered.state
    expect(player(g).carrying).toBeNull()

    for (let k = 0; k < (CFG.hatchTime + CFG.coinEvery + 0.5) * 10; k++) g = stepGame(g, layout, still, 0.1).state
    expect(g.nests[PLAYER_ID].babies).toHaveLength(1)
    expect(player(g).coins).toBeGreaterThan(0)
  })

  it('a full nest keeps the egg in your hands and says so once', () => {
    const full = { ...soloGame().nests[PLAYER_ID], babies: [1, 2, 3, 4, 5, 6].map((id) => ({ id, rarity: 0 as const, shiny: false, age: 0, nextCoin: 99 })) }
    let g = soloGame()
    g = { ...withPlayer(g, { pos: { x: 0, z: 17 }, carrying: { id: 99, spot: 0, rarity: 1, rainbow: false } }), nests: g.nests.map((n, i) => (i === PLAYER_ID ? full : n)) }
    const events = []
    for (let k = 0; k < 120; k++) {
      const r = stepGame(g, layout, { x: 0, z: 1 }, 1 / 60)
      events.push(...r.events)
      g = r.state
    }
    expect(player(g).carrying?.id).toBe(99)
    expect(g.nests[PLAYER_ID].hatching).toHaveLength(0)
    expect(events.filter((e) => e.type === 'nestFull')).toHaveLength(1)
  })

  it('grows a new egg on the emptied spot', () => {
    let g = withPlayer(soloGame(), { pos: layout.spots[5].pos })
    g = stepGame(g, layout, still, 1 / 60).state
    g = withPlayer(g, { pos: layout.nests[PLAYER_ID] })
    g = stepGame(g, layout, still, 1 / 60).state
    for (let k = 0; k < (CFG.regrowTime + 1) * 10; k++) g = stepGame(withPlayer(g, { pos: layout.nests[PLAYER_ID] }), layout, still, 0.1).state
    expect(g.eggs.some((e) => e.spot === 5)).toBe(true)
  })
})

describe('noise and the dragon', () => {
  it('walking on gold raises noise, stone does not', () => {
    const g0 = withPlayer(soloGame(), { pos: { x: 0, z: 11 } })
    const quiet = stepGame(g0, layout, { x: 1, z: 0 }, 0.05).state
    expect(quiet.noise).toBe(0)

    const heap = layout.gold[0]
    const g1 = withPlayer(soloGame(), { pos: { x: heap.x, z: heap.z } })
    const loud = stepGame(g1, layout, { x: 0.05, z: 1 }, 0.05).state
    expect(loud.noise).toBeGreaterThan(0)
  })

  it('noise fades when everyone is quiet', () => {
    const g = { ...soloGame(), noise: 30 }
    const after = stepGame(g, layout, still, 1).state
    expect(after.noise).toBeCloseTo(30 - CFG.noiseDecay, 5)
  })

  it('goes sleep → stir → wake → hunt (fire) → settle → sleep', () => {
    let d = stepDragon(SLEEPING, CFG.stirAt, 0.1, null)
    expect(d.dragon.mode).toBe('stir')
    d = stepDragon(d.dragon, 100, 0.1, 0)
    expect(d.dragon.mode).toBe('wake')
    d = stepDragon(d.dragon, 100, CFG.wakeTime, 0)
    expect(d.dragon.mode).toBe('hunt')
    d = stepDragon(d.dragon, 100, CFG.fireDelay, 0)
    expect(d.dragon.fire).toBe(true)
    d = stepDragon(d.dragon, 100, CFG.huntTime, 0)
    expect(d.dragon.mode).toBe('settle')
    d = stepDragon(d.dragon, 100, CFG.settleTime, 0)
    expect(d.dragon.mode).toBe('sleep')
    expect(d.noise).toBe(0)
  })

  it('stir calms down if the cave goes quiet', () => {
    const d = stepDragon({ ...SLEEPING, mode: 'stir' }, CFG.calmBelow - 1, 0.1, null)
    expect(d.dragon.mode).toBe('sleep')
  })

  it('fire makes a carrier drop the egg back on the pile', () => {
    const spot = layout.spots.find((s) => !blocked(layout, { x: 0, z: 0 }, s.pos))
    if (spot === undefined) throw new Error('no open spot')
    let g = withPlayer(soloGame(), { pos: spot.pos })
    g = stepGame(g, layout, still, 1 / 60).state
    const eggsBefore = g.eggs.length
    const yaw = Math.atan2(spot.pos.x, spot.pos.z)
    g = { ...g, dragon: { mode: 'hunt', t: 1, yaw, fire: true, wakes: 1, lullaby: 0 } }
    const r = stepGame(g, layout, still, 1 / 60)
    expect(r.events.some((e) => e.type === 'burned')).toBe(true)
    expect(player(r.state).carrying).toBeNull()
    expect(r.state.eggs.length).toBe(eggsBefore + 1)
    expect(player(r.state).stunned).toBeGreaterThan(0)
  })

  it('a rock between the dragon and you blocks the fire', () => {
    const rock = layout.pillars[0]
    const len = Math.hypot(rock.x, rock.z)
    const behind = { x: rock.x + (rock.x / len) * (rock.r + 0.7), z: rock.z + (rock.z / len) * (rock.r + 0.7) }
    expect(blocked(layout, { x: 0, z: 0 }, behind)).toBe(true)
    let g = withPlayer(soloGame(), { pos: behind })
    g = { ...g, dragon: { mode: 'hunt', t: 1, yaw: Math.atan2(behind.x, behind.z), fire: true, wakes: 1, lullaby: 0 } }
    const r = stepGame(g, layout, still, 1 / 60)
    expect(r.events.some((e) => e.type === 'burned')).toBe(false)
  })
})

describe('bots', () => {
  it('eventually bring eggs home on their own', () => {
    let g = createGame(layout, 3)
    let delivered = 0
    for (let k = 0; k < 60 * 60; k++) {
      const r = stepGame(g, layout, still, 1 / 60)
      delivered += r.events.filter((e) => e.type === 'deliver').length
      g = r.state
    }
    expect(delivered).toBeGreaterThan(0)
  })
})
