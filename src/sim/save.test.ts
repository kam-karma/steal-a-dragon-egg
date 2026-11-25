import { describe, expect, it } from 'vitest'
import { createGame, PLAYER_ID } from './game'
import { applySave, fromSave, toSave } from './save'
import { makeLayout } from './world'
import type { GameState } from './types'

const layout = makeLayout(7)

function played(): GameState {
  const g = createGame(layout, 1)
  return {
    ...g,
    actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, coins: 4321, xp: 260, rebirths: 2, items: { ...a.items, pans: 1, bootsLeft: 30, luckLeft: 12, totemLeft: 50 } } : a)),
    nests: g.nests.map((n, i) =>
      i === PLAYER_ID
        ? {
            ...n,
            capacityLevel: 1,
            babies: [{ id: 50, rarity: 3, shiny: true, age: 400, nextCoin: 1 }],
            hatching: [{ rarity: 2, left: 80, rainbow: false, insurance: true }],
          }
        : n,
    ),
  }
}

describe('save round trip', () => {
  it('keeps gold, xp, rebirths, capacity, babies, insurance eggs and items', () => {
    const save = toSave(played(), 1_000)
    const back = fromSave(JSON.parse(JSON.stringify(save)))
    expect(back).not.toBeNull()
    if (back === null) return
    const g = applySave(createGame(layout, 2), back)
    const me = g.actors[PLAYER_ID]
    expect(me).toMatchObject({ coins: 4321, xp: 260, rebirths: 2 })
    expect(me.items).toMatchObject({ pans: 1, bootsLeft: 30, luckLeft: 12 })
    const nest = g.nests[PLAYER_ID]
    expect(nest.capacityLevel).toBe(1)
    expect(nest.babies.map((b) => [b.rarity, b.shiny, b.age])).toEqual([[3, true, 400]])
    expect(nest.hatching).toEqual([{ rarity: 2, left: 80, rainbow: false, insurance: true }])
    expect(back.lastSeen).toBe(1_000)
  })
  it('gives loaded babies fresh unique ids', () => {
    const g = applySave(createGame(layout, 2), toSave(played(), 0))
    const ids = g.nests[PLAYER_ID].babies.map((b) => b.id)
    expect(ids.every((id) => id >= createGame(layout, 2).nextId)).toBe(true)
  })
})

describe('bad saves start a new game', () => {
  it('rejects junk and unknown versions', () => {
    expect(fromSave('çöp')).toBeNull()
    expect(fromSave(null)).toBeNull()
    expect(fromSave({ saveVersion: 9 })).toBeNull()
    expect(fromSave({ ...toSave(played(), 0), babies: 'nope' })).toBeNull()
  })
  it('clamps impossible numbers', () => {
    const s = fromSave({ ...toSave(played(), 0), coins: -50, rebirths: 1e9, capacityLevel: 7, babies: [{ rarity: 9, shiny: 1, age: -3 }] })
    expect(s).not.toBeNull()
    expect(s?.coins).toBe(0)
    expect(s?.rebirths).toBeLessThanOrEqual(100)
    expect(s?.capacityLevel).toBe(2)
    expect(s?.babies).toEqual([{ rarity: 4, shiny: true, age: 0 }])
  })
  it('keeps babies above nest capacity but caps absurd counts at 64', () => {
    const many = Array.from({ length: 40 }, () => ({ rarity: 0, shiny: false, age: 0 }))
    expect(fromSave({ ...toSave(played(), 0), capacityLevel: 0, babies: many })?.babies).toHaveLength(40)
    const absurd = Array.from({ length: 500 }, () => ({ rarity: 0, shiny: false, age: 0 }))
    expect(fromSave({ ...toSave(played(), 0), babies: absurd })?.babies).toHaveLength(64)
  })
})
