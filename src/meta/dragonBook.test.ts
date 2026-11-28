import { describe, expect, it } from 'vitest'
import { PLAYER_ID } from '../sim/ids'
import { BOOK_ENTRIES, bookFrom, discover, entryReward, NEW_BOOK } from './dragonBook'

describe('dragon book', () => {
  it('has an entry for every baby (normal and shiny) and the special finds', () => {
    expect(BOOK_ENTRIES).toHaveLength(14)
  })
  it('records the player own finds once, each with a reward', () => {
    const r1 = discover(NEW_BOOK, [
      { type: 'hatch', nest: PLAYER_ID, rarity: 2, shiny: true },
      { type: 'hatch', nest: 3, rarity: 4, shiny: false },
    ])
    expect(r1.found).toEqual(['baby2s'])
    expect(r1.book.found).toContain('baby2s')
    const r2 = discover(r1.book, [{ type: 'hatch', nest: PLAYER_ID, rarity: 2, shiny: true }])
    expect(r2.found).toEqual([])
  })
  it('knows golden eggs, rainbow eggs, chests and grown-ups', () => {
    const r = discover(NEW_BOOK, [
      { type: 'deliver', actor: PLAYER_ID, rarity: 1, rainbow: true },
      { type: 'deliver', actor: PLAYER_ID, rarity: 1, rainbow: false, golden: true },
      { type: 'chest', actor: PLAYER_ID, coins: 10, reward: 'luck' },
      { type: 'grow', nest: PLAYER_ID, baby: 1, stage: 2 },
    ])
    expect([...r.found].sort()).toEqual(['adult', 'chest', 'golden', 'rainbow'])
  })
  it('rarer finds pay more, and the last page completes the book', () => {
    expect(entryReward('baby4s')).toBeGreaterThan(entryReward('baby0'))
    const all = { found: BOOK_ENTRIES.filter((e) => e !== 'chest') }
    const r = discover(all, [{ type: 'chest', actor: PLAYER_ID, coins: 1, reward: 'luck' }])
    expect(r.completed).toBe(true)
  })
  it('reads back what was stored and ignores rubbish', () => {
    expect(bookFrom({ found: ['baby1', 'nope', 5] })).toEqual({ found: ['baby1'] })
    expect(bookFrom(null)).toEqual(NEW_BOOK)
  })
})
