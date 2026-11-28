import { describe, expect, it } from 'vitest'
import { canClaim, claim, DAILY_REWARDS, dailyFrom, NEW_DAILY, nextDay } from './daily'

describe('daily login rewards', () => {
  it('a 7-day calendar ending in a crown', () => {
    expect(DAILY_REWARDS).toHaveLength(7)
    expect(DAILY_REWARDS[6].crowns).toBe(1)
  })
  it('day 1 on the first visit, one claim per day', () => {
    expect(canClaim(NEW_DAILY, '2026-12-01')).toBe(true)
    expect(nextDay(NEW_DAILY, '2026-12-01')).toBe(1)
    const d = claim(NEW_DAILY, '2026-12-01')
    expect(canClaim(d, '2026-12-01')).toBe(false)
  })
  it('coming back the next day moves on; missing a day starts over; after day 7 it wraps', () => {
    let d = claim(NEW_DAILY, '2026-12-01')
    expect(nextDay(d, '2026-12-02')).toBe(2)
    expect(nextDay(d, '2026-12-03')).toBe(1)
    for (const day of ['02', '03', '04', '05', '06', '07']) d = claim(d, `2026-12-${day}`)
    expect(d.streak).toBe(7)
    expect(nextDay(d, '2026-12-08')).toBe(1)
  })
  it('crosses month ends', () => {
    expect(nextDay(claim(NEW_DAILY, '2026-11-30'), '2026-12-01')).toBe(2)
  })
  it('reads back a stored calendar and ignores rubbish', () => {
    expect(dailyFrom({ last: '2026-12-01', streak: 3 })).toEqual({ last: '2026-12-01', streak: 3 })
    expect(dailyFrom({ last: 5, streak: 99 })).toEqual(NEW_DAILY)
  })
})
