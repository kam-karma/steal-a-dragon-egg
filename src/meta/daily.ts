import type { Reward } from '../sim/types'

/** A 7-day login calendar: something nice every day you come back, a crown on day 7. */
export interface DailyReward {
  readonly coins?: number
  readonly drops?: number
  readonly crowns?: number
  readonly grant?: Reward
}

export const DAILY_REWARDS: readonly DailyReward[] = [
  { coins: 1_000 },
  { drops: 1 },
  { coins: 3_000 },
  { grant: 'luck' },
  { grant: 'gold2x' },
  { coins: 10_000 },
  { crowns: 1 },
]

export interface Daily {
  /** Date of the last claim (YYYY-MM-DD), '' never. */
  readonly last: string
  /** Day of the calendar last claimed, 1..7 (0 = none yet). */
  readonly streak: number
}

export const NEW_DAILY: Daily = { last: '', streak: 0 }

function dayBefore(today: string): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function canClaim(d: Daily, today: string): boolean {
  return d.last !== today
}

/** Which calendar day today's claim is: the one after yesterday's, else day 1 (after day 7 too). */
export function nextDay(d: Daily, today: string): number {
  return d.last === dayBefore(today) && d.streak < 7 ? d.streak + 1 : 1
}

export function claim(d: Daily, today: string): Daily {
  return canClaim(d, today) ? { last: today, streak: nextDay(d, today) } : d
}

export function dailyFrom(raw: unknown): Daily {
  const r = raw as Partial<Daily> | null
  if (r === null || typeof r !== 'object' || typeof r.last !== 'string' || !/^(\d{4}-\d{2}-\d{2})?$/.test(r.last)) return NEW_DAILY
  if (typeof r.streak !== 'number' || !Number.isInteger(r.streak) || r.streak < 0 || r.streak > 7) return NEW_DAILY
  return { last: r.last, streak: r.streak }
}
