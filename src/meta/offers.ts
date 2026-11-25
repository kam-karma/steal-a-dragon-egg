import { CFG } from '../sim/config'
import { babyStage } from '../sim/economy'
import { PLAYER_ID } from '../sim/ids'
import { handsFree } from '../sim/movement'
import type { GameState, Layout, Reward } from '../sim/types'
import { dist } from '../sim/world'

/** Rewarded-ad offers: when each one appears, how often, and the daily ledger. */

export const DAILY_LIMIT: Record<Reward, number> = {
  luck: 5,
  recover: 5,
  gold2x: 6,
  lullaby: 3,
  instantHatch: 5,
  grow: 5,
  totem: 5,
  boots: 5,
  streakShield: 2,
}

/** Seconds before the same offer may pop up again. */
const COOLDOWN: Record<Reward, number> = {
  luck: 300,
  recover: 20,
  gold2x: 600,
  lullaby: 30,
  instantHatch: 60,
  grow: 120,
  totem: 60,
  boots: 90,
  streakShield: 30,
}

/** Offers that answer a moment right now may come sooner after another offer. */
const URGENT: ReadonlySet<Reward> = new Set(['recover', 'streakShield', 'lullaby'])
const GAP = 25
const URGENT_GAP = 5

export interface AdLedger {
  readonly day: string
  readonly used: Readonly<Partial<Record<Reward, number>>>
  /** Rewards ever used: the first use of each is free (a taste of its value). */
  readonly everUsed: readonly Reward[]
}

export const NEW_LEDGER: AdLedger = { day: '', used: {}, everUsed: [] }

const REWARDS = Object.keys(DAILY_LIMIT) as Reward[]

export function isFree(l: AdLedger, r: Reward): boolean {
  return !l.everUsed.includes(r)
}

export function usedToday(l: AdLedger, r: Reward, today: string): number {
  return l.day === today ? (l.used[r] ?? 0) : 0
}

export function canUse(l: AdLedger, r: Reward, today: string): boolean {
  return usedToday(l, r, today) < DAILY_LIMIT[r]
}

export function recordUse(l: AdLedger, r: Reward, today: string): AdLedger {
  const used = l.day === today ? l.used : {}
  return {
    day: today,
    used: { ...used, [r]: (used[r] ?? 0) + 1 },
    everUsed: l.everUsed.includes(r) ? l.everUsed : [...l.everUsed, r],
  }
}

export function ledgerFromStored(raw: unknown): AdLedger {
  if (typeof raw !== 'object' || raw === null) return NEW_LEDGER
  const r = raw as Record<string, unknown>
  const used: Partial<Record<Reward, number>> = {}
  if (typeof r.used === 'object' && r.used !== null) {
    for (const k of REWARDS) {
      const v = (r.used as Record<string, unknown>)[k]
      if (typeof v === 'number' && Number.isFinite(v)) used[k] = Math.max(0, Math.min(99, Math.floor(v)))
    }
  }
  const everUsed = Array.isArray(r.everUsed) ? REWARDS.filter((k) => (r.everUsed as unknown[]).includes(k)) : []
  return { day: typeof r.day === 'string' ? r.day : '', used, everUsed }
}

/** What the offer picker remembers between frames (game-time seconds). */
export interface OfferMemory {
  readonly lastShownAt: Readonly<Partial<Record<Reward, number>>>
  readonly lastAnyAt: number
  readonly burnedAt: number | null
  readonly deliveredAt: number | null
}

type Check = (g: GameState, layout: Layout, m: OfferMemory, now: number) => boolean

/** The moment each offer answers. Order = priority. */
const MOMENTS: readonly [Reward, Check][] = [
  ['recover', (g, _l, m, now) => {
    const me = g.actors[PLAYER_ID]
    return me.lastDrop !== null && m.burnedAt !== null && now - m.burnedAt < 10 && g.dragon.mode !== 'hunt' && g.dragon.mode !== 'wake'
  }],
  ['streakShield', (g) => g.dragon.mode === 'stir' && g.actors[PLAYER_ID].streak >= 5 && !g.actors[PLAYER_ID].streakShield],
  ['lullaby', (g) => {
    const p = g.happenings.rainbowPos
    const asleep = g.dragon.mode === 'sleep' || g.dragon.mode === 'stir'
    return p !== null && asleep && g.dragon.lullaby <= 0 && g.eggs.some((e) => e.rainbow) && dist(g.actors[PLAYER_ID].pos, p) < 6
  }],
  ['totem', (g, l) => {
    const me = g.actors[PLAYER_ID]
    const watched = g.actors.some((a) => a.bot?.raidNest === PLAYER_ID && a.bot.goal === 'raid')
    return watched && me.items.totemLeft <= 0 && g.nests[PLAYER_ID].babies.length > 0 && dist(me.pos, l.nests[PLAYER_ID]) > 10
  }],
  ['instantHatch', (g) => g.nests[PLAYER_ID].hatching.some((h) => !h.insurance && h.rarity >= 2 && h.left > 1)],
  ['boots', (g, l) => {
    const me = g.actors[PLAYER_ID]
    const d = dist(me.pos, l.nests[PLAYER_ID])
    return me.items.bootsLeft <= 0 && g.noise >= 40 && d > CFG.guardRadius && d < CFG.guardRadius + 4
  }],
  ['grow', (g, l) => {
    const me = g.actors[PLAYER_ID]
    const toNext = (age: number): number => (babyStage(age) === 0 ? CFG.teenAge - age : CFG.adultAge - age)
    return dist(me.pos, l.nests[PLAYER_ID]) < CFG.guardRadius && g.nests[PLAYER_ID].babies.some((b) => babyStage(b.age) < 2 && toNext(b.age) > 180)
  }],
  ['luck', (g, _l, m, now) => m.deliveredAt !== null && now - m.deliveredAt < 3 && g.actors[PLAYER_ID].items.luckLeft <= 0],
  ['gold2x', (g, _l, _m, now) => now >= 20 && g.actors[PLAYER_ID].items.gold2xLeft < 60],
]

/** No offer while the child is busy: carrying, being robbed, or under dragon attack. */
function busy(g: GameState): boolean {
  const me = g.actors[PLAYER_ID]
  const robbed = g.actors.some((a) => a.stolen?.from === PLAYER_ID)
  return !handsFree(me) || robbed || me.stunned > 0
}

/** The one offer that fits this moment, or null. At most one at a time, never pushy. */
export function pickOffer(g: GameState, layout: Layout, m: OfferMemory, now: number, ledger: AdLedger, today: string): Reward | null {
  if (busy(g)) return null
  for (const [reward, fits] of MOMENTS) {
    const gap = URGENT.has(reward) ? URGENT_GAP : GAP
    if (now - m.lastAnyAt < gap) continue
    if (now - (m.lastShownAt[reward] ?? -Infinity) < COOLDOWN[reward]) continue
    if (!canUse(ledger, reward, today)) continue
    if (fits(g, layout, m, now)) return reward
  }
  return null
}

/** Would this reward do anything right now? (The 🎁 panel greys out the ones that would not.) */
export function applicable(g: GameState, r: Reward): boolean {
  const me = g.actors[PLAYER_ID]
  const nest = g.nests[PLAYER_ID]
  switch (r) {
    case 'recover':
      return me.lastDrop !== null && handsFree(me)
    case 'instantHatch':
      return nest.hatching.length > 0
    case 'grow':
      return nest.babies.some((b) => babyStage(b.age) < 2)
    case 'lullaby':
      return g.dragon.mode === 'sleep' || g.dragon.mode === 'stir'
    case 'streakShield':
      return !me.streakShield
    default:
      return true
  }
}
