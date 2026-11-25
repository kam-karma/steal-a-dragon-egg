import { describe, expect, it } from 'vitest'
import { CHARACTERS, COLORS, buyWithGold, fromStored, isOwned, NEW_WARDROBE, select, watchedAd } from './wardrobe'

describe('catalog', () => {
  it('Pati is free; Tilki and Jessie cost gold or ads', () => {
    expect(CHARACTERS.find((c) => c.id === 'pati')).toMatchObject({ gold: 0, ads: 0 })
    expect(CHARACTERS.find((c) => c.id === 'tilki')?.ads).toBeGreaterThan(0)
    expect(CHARACTERS.find((c) => c.id === 'jessie')?.gold).toBeGreaterThan(CHARACTERS.find((c) => c.id === 'tilki')?.gold ?? 0)
    expect(COLORS.length).toBeGreaterThanOrEqual(6)
  })
  it('a new wardrobe owns Pati and the original colour, and wears them', () => {
    expect(isOwned(NEW_WARDROBE, 'pati')).toBe(true)
    expect(isOwned(NEW_WARDROBE, 'orijinal')).toBe(true)
    expect(isOwned(NEW_WARDROBE, 'tilki')).toBe(false)
    expect(NEW_WARDROBE.wearing).toEqual({ character: 'pati', color: 'orijinal' })
  })
})

describe('unlocking', () => {
  it('buys with gold when affordable and reports the price to spend', () => {
    const tilki = CHARACTERS.find((c) => c.id === 'tilki')
    if (tilki === undefined) throw new Error('no tilki')
    expect(buyWithGold(NEW_WARDROBE, 'tilki', tilki.gold - 1)).toBeNull()
    const r = buyWithGold(NEW_WARDROBE, 'tilki', tilki.gold)
    expect(r?.price).toBe(tilki.gold)
    expect(r && isOwned(r.wardrobe, 'tilki')).toBe(true)
  })
  it('unlocks after enough rewarded ads, counting each one', () => {
    const tilki = CHARACTERS.find((c) => c.id === 'tilki')
    if (tilki === undefined) throw new Error('no tilki')
    let w = NEW_WARDROBE
    for (let k = 1; k < tilki.ads; k++) {
      w = watchedAd(w, 'tilki')
      expect(isOwned(w, 'tilki')).toBe(false)
      expect(w.adProgress.tilki).toBe(k)
    }
    w = watchedAd(w, 'tilki')
    expect(isOwned(w, 'tilki')).toBe(true)
  })
  it('cannot wear what is not owned', () => {
    expect(select(NEW_WARDROBE, 'tilki', 'orijinal')).toEqual(NEW_WARDROBE)
    const owned = { ...NEW_WARDROBE, owned: [...NEW_WARDROBE.owned, 'tilki', 'nane'] }
    expect(select(owned, 'tilki', 'nane').wearing).toEqual({ character: 'tilki', color: 'nane' })
  })
})

describe('storage', () => {
  it('round-trips and rejects junk', () => {
    const w = { ...NEW_WARDROBE, owned: [...NEW_WARDROBE.owned, 'jessie'], adProgress: { tilki: 2 } }
    expect(fromStored(JSON.parse(JSON.stringify(w)))).toEqual(w)
    expect(fromStored('x')).toEqual(NEW_WARDROBE)
    expect(fromStored({ owned: ['hacker'], wearing: { character: 'jessie', color: 'altin' } })).toEqual(NEW_WARDROBE)
  })
})
