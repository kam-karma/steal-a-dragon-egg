import { describe, expect, it } from 'vitest'
import { CFG } from './config'
import { createGame, PLAYER_ID, stepGame } from './game'
import { stepHappenings } from './happenings'
import { makeLayout } from './world'
import type { GameEvent, GameState } from './types'

const layout = makeLayout(7)
/** Bots frozen far away, player parked at home, so only the timers act. */
function quiet(): GameState {
  const g = createGame(layout, 1)
  return { ...g, actors: g.actors.map((a) => (a.isBot ? { ...a, stunned: 1e9, pos: { x: 0, z: -26 } } : a)) }
}

function advance(g: GameState, seconds: number, dt = 0.5): { state: GameState; events: GameEvent[] } {
  let s = g
  const events: GameEvent[] = []
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const r = stepHappenings(s, layout, dt)
    s = r.state
    events.push(...r.events)
  }
  return { state: s, events }
}

describe('rainbow egg', () => {
  it('warns 10 s ahead and appears every 240 s', () => {
    const at230 = advance(quiet(), 230)
    expect(at230.events.some((e) => e.type === 'rainbowWarn')).toBe(false)
    const at231 = advance(at230.state, 1)
    expect(at231.events.some((e) => e.type === 'rainbowWarn')).toBe(true)
    const at240 = advance(at231.state, 9)
    expect(at240.events.some((e) => e.type === 'rainbowSpawn')).toBe(true)
    const rainbow = at240.state.eggs.filter((e) => e.rainbow)
    expect(rainbow).toHaveLength(1)
    expect(rainbow[0].spot).toBe(-1)
    expect(at240.state.happenings.rainbowPos).not.toBeNull()
  })

  it('never has two rainbow eggs out at once', () => {
    const r = advance(quiet(), 500)
    expect(r.state.eggs.filter((e) => e.rainbow)).toHaveLength(1)
  })

  it('can be picked up and hatches epic or better', () => {
    let g = advance(quiet(), 240).state
    const pos = g.happenings.rainbowPos
    if (pos === null) throw new Error('no rainbow egg')
    g = { ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos } : a)) }
    g = stepGame(g, layout, { x: 0, z: 0 }, 1 / 60).state
    expect(g.actors[PLAYER_ID].carrying?.rainbow).toBe(true)
    g = { ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: layout.nests[PLAYER_ID] } : a)) }
    for (let k = 0; k < 4 * 60; k++) g = stepGame(g, layout, { x: 0, z: 0 }, 1 / 60).state
    expect(g.nests[PLAYER_ID].babies[0].rarity).toBeGreaterThanOrEqual(2)
    expect(g.happenings.rainbowPos).toBeNull()
  })
})

describe('sneeze', () => {
  const soon = (): GameState => {
    const g = quiet()
    return { ...g, happenings: { ...g.happenings, sneezeIn: 3, rainbowIn: 999 } }
  }

  it('warns 2 s ahead, then scatters 20 coins worth 30 that vanish after 12 s', () => {
    const r = advance(soon(), 3)
    expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(['sneezeWarn', 'sneeze']))
    const coins = r.state.pickups.filter((p) => p.kind === 'coin')
    expect(coins).toHaveLength(CFG.sneezeCoins)
    expect(coins.every((c) => c.value === CFG.sneezeCoinValue)).toBe(true)
    expect(advance(r.state, 12.5).state.pickups.filter((p) => p.kind === 'coin')).toHaveLength(0)
    expect(r.state.happenings.sneezeIn).toBeGreaterThanOrEqual(CFG.sneezeMin - 1)
    expect(r.state.happenings.sneezeIn).toBeLessThanOrEqual(CFG.sneezeMax)
  })

  it('blows away anyone within 7 m', () => {
    const g = soon()
    const near = { ...g, actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: { x: 0, z: 5 } } : a)) }
    const r = advance(near, 3)
    expect(Math.hypot(r.state.actors[PLAYER_ID].pos.x, r.state.actors[PLAYER_ID].pos.z)).toBeGreaterThan(7.5)
  })

  it('walking onto a coin collects it', () => {
    const r = advance(soon(), 3)
    const coin = r.state.pickups.find((p) => p.kind === 'coin')
    if (coin === undefined) throw new Error('no coin')
    const g = { ...r.state, actors: r.state.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: coin.pos } : a)) }
    const after = stepHappenings(g, layout, 0.01)
    expect(after.events).toContainEqual({ type: 'coinPickup', actor: PLAYER_ID, value: CFG.sneezeCoinValue })
    expect(after.state.actors[PLAYER_ID].coins).toBe(CFG.sneezeCoinValue)
  })
})
