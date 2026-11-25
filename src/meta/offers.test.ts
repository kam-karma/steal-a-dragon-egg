import { describe, expect, it } from 'vitest'
import { createGame, PLAYER_ID } from '../sim/game'
import { makeLayout } from '../sim/world'
import type { GameState } from '../sim/types'
import { canUse, DAILY_LIMIT, isFree, NEW_LEDGER, ledgerFromStored, pickOffer, recordUse, type OfferMemory } from './offers'

const layout = makeLayout(7)
const today = '2026-11-23'
const base = createGame(layout, 1)
const fresh: OfferMemory = { lastShownAt: {}, lastAnyAt: -999, burnedAt: null, deliveredAt: null }
const at = (g: GameState, patch: Partial<GameState['actors'][number]>): GameState => ({
  ...g,
  actors: g.actors.map((a) => (a.id === PLAYER_ID ? { ...a, ...patch } : a)),
})
const awayFromHome = { x: 0, z: 12 }

describe('daily ledger', () => {
  it('the first use of each reward is free, later ones need an ad', () => {
    expect(isFree(NEW_LEDGER, 'luck')).toBe(true)
    const l = recordUse(NEW_LEDGER, 'luck', today)
    expect(isFree(l, 'luck')).toBe(false)
    expect(isFree(l, 'gold2x')).toBe(true)
  })
  it('stops at the daily limit and resets the next day', () => {
    let l = NEW_LEDGER
    for (let k = 0; k < DAILY_LIMIT.lullaby; k++) l = recordUse(l, 'lullaby', today)
    expect(canUse(l, 'lullaby', today)).toBe(false)
    expect(canUse(l, 'lullaby', '2026-11-24')).toBe(true)
  })
  it('survives storage and rejects junk', () => {
    const l = recordUse(recordUse(NEW_LEDGER, 'luck', today), 'boots', today)
    expect(ledgerFromStored(JSON.parse(JSON.stringify(l)))).toEqual(l)
    expect(ledgerFromStored('x')).toEqual(NEW_LEDGER)
  })
})

describe('contextual offers', () => {
  it('offers 2× gold early in the session', () => {
    expect(pickOffer(base, layout, { ...fresh }, 25, NEW_LEDGER, today)).toBe('gold2x')
  })
  it('offers Geri Al after being burned, once the dragon has stopped breathing fire', () => {
    const g = { ...at(base, { pos: awayFromHome, lastDrop: { rarity: 2, rainbow: false, babyNest: null } }), dragon: { ...base.dragon, mode: 'settle' as const } }
    expect(pickOffer(g, layout, { ...fresh, burnedAt: 100, lastShownAt: { gold2x: 99 } }, 104, NEW_LEDGER, today)).toBe('recover')
    const hunting = { ...g, dragon: { ...g.dragon, mode: 'hunt' as const } }
    expect(pickOffer(hunting, layout, { ...fresh, burnedAt: 100, lastShownAt: { gold2x: 99 } }, 101, NEW_LEDGER, today)).toBeNull()
  })
  it('offers Ninni near the rainbow egg', () => {
    const pos = { x: 0, z: 4.8 }
    const g: GameState = {
      ...at(base, { pos: { x: 0.5, z: 7 } }),
      eggs: [...base.eggs, { id: 999, spot: -1, rarity: 2, rainbow: true }],
      happenings: { ...base.happenings, rainbowPos: pos },
    }
    expect(pickOffer(g, layout, { ...fresh, lastShownAt: { gold2x: 1 } }, 30, NEW_LEDGER, today)).toBe('lullaby')
  })
  it('offers Seriyi Koru when the dragon stirs and the streak is 5+', () => {
    const g = { ...at(base, { pos: awayFromHome, streak: 6 }), dragon: { ...base.dragon, mode: 'stir' as const } }
    expect(pickOffer(g, layout, { ...fresh, lastShownAt: { gold2x: 1 } }, 30, NEW_LEDGER, today)).toBe('streakShield')
  })
  it('never offers while the player carries something or is being robbed', () => {
    const carrying = at(base, { pos: awayFromHome, carrying: { id: 1, spot: 0, rarity: 0, rainbow: false } })
    expect(pickOffer(carrying, layout, { ...fresh }, 25, NEW_LEDGER, today)).toBeNull()
    const robbed: GameState = { ...base, actors: base.actors.map((a) => (a.id === 2 ? { ...a, stolen: { rarity: 1, shiny: false, age: 0, from: PLAYER_ID } } : a)) }
    expect(pickOffer(robbed, layout, { ...fresh }, 25, NEW_LEDGER, today)).toBeNull()
  })
  it('waits at least 25 s between offers and respects daily limits', () => {
    expect(pickOffer(base, layout, { ...fresh, lastAnyAt: 10 }, 25, NEW_LEDGER, today)).toBeNull()
    let l = NEW_LEDGER
    for (let k = 0; k < DAILY_LIMIT.gold2x; k++) l = recordUse(l, 'gold2x', today)
    expect(pickOffer(base, layout, { ...fresh }, 25, l, today)).not.toBe('gold2x')
  })
  it('offers instant hatch for an epic egg in the nest', () => {
    const g: GameState = {
      ...at(base, { pos: awayFromHome }),
      nests: base.nests.map((n, i) => (i === PLAYER_ID ? { ...n, hatching: [{ rarity: 3, left: 2, rainbow: false, insurance: false }] } : n)),
    }
    expect(pickOffer(g, layout, { ...fresh, lastShownAt: { gold2x: 1 } }, 30, NEW_LEDGER, today)).toBe('instantHatch')
  })
})

describe('applicable (never sell an ad that would do nothing)', () => {
  it('Geri Al needs something dropped, instant hatch an egg in the nest, grow a growing baby', async () => {
    const { applicable } = await import('./offers')
    expect(applicable(base, 'recover')).toBe(false)
    expect(applicable(at(base, { lastDrop: { rarity: 1, rainbow: false, babyNest: null } }), 'recover')).toBe(true)
    expect(applicable(base, 'instantHatch')).toBe(false)
    expect(applicable(base, 'grow')).toBe(false)
    expect(applicable(base, 'gold2x')).toBe(true)
    expect(applicable({ ...base, dragon: { ...base.dragon, mode: 'hunt' } }, 'lullaby')).toBe(false)
  })
})
