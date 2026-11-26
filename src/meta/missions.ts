import { CFG } from '../sim/config'
import { PLAYER_ID } from '../sim/ids'
import { nextSeed, seedToUnit } from '../sim/rng'
import type { GameEvent } from '../sim/types'

/**
 * Three short goals on screen at all times. Each one asks for something a little different
 * (a deep egg, a quiet run, a raid, the rainbow egg), so the egg run never turns into
 * "the same thing again". A finished goal pays gold and makes room for a new one.
 */
export type MissionKind = 'deliver' | 'rare' | 'streak' | 'steal' | 'rainbow' | 'merge' | 'coins'

export interface Mission {
  readonly kind: MissionKind
  readonly goal: number
  readonly done: number
  /** For 'rare': the lowest rarity that counts. */
  readonly min: number
}

export interface Missions {
  readonly list: readonly Mission[]
  readonly seed: number
  readonly completed: number
}

/** The first three teach the core: carry eggs, go deeper for better ones, don't wake it. */
export const FIRST_MISSIONS: readonly Mission[] = [
  { kind: 'deliver', goal: 2, done: 0, min: 0 },
  { kind: 'rare', goal: 1, done: 0, min: 1 },
  { kind: 'streak', goal: 3, done: 0, min: 0 },
]

const KINDS: readonly MissionKind[] = ['deliver', 'rare', 'streak', 'steal', 'rainbow', 'merge', 'coins']

/** Base gold per mission kind; harder goals and later missions pay more. */
const BASE: Record<MissionKind, number> = { deliver: 40, rare: 120, streak: 60, steal: 200, rainbow: 300, merge: 150, coins: 8 }

export function missionReward(m: Mission, completed: number): number {
  const effort = m.kind === 'rare' ? 1 + m.min : m.goal
  return Math.round(BASE[m.kind] * effort * (1 + completed * 0.25))
}

export function newMissions(seed: number): Missions {
  return { list: FIRST_MISSIONS, seed: seed >>> 0, completed: 0 }
}

function roll(seed: number, taken: readonly MissionKind[], completed: number): { mission: Mission; seed: number } {
  const free = KINDS.filter((k) => !taken.includes(k))
  const s1 = nextSeed(seed)
  const kind = free[Math.floor(seedToUnit(s1) * free.length)] ?? 'deliver'
  const s2 = nextSeed(s1)
  const u = seedToUnit(s2)
  const step = Math.min(3, Math.floor(completed / 4))
  const goals: Record<MissionKind, number> = {
    deliver: 3 + Math.floor(u * 3) + step,
    rare: 1,
    streak: 3 + Math.floor(u * 2) + step,
    steal: 1,
    rainbow: 1,
    merge: 1,
    coins: 5 + Math.floor(u * 6),
  }
  const min = kind === 'rare' ? Math.min(3, 1 + Math.floor(u * 2) + (step > 1 ? 1 : 0)) : 0
  return { mission: { kind, goal: goals[kind], done: 0, min }, seed: s2 }
}

/** How far one event moves a mission along (a new value for `done`). */
function advance(m: Mission, e: GameEvent): number {
  switch (m.kind) {
    case 'deliver':
      return e.type === 'deliver' && e.actor === PLAYER_ID ? m.done + 1 : m.done
    case 'rare':
      return e.type === 'deliver' && e.actor === PLAYER_ID && e.rarity >= m.min ? m.done + 1 : m.done
    case 'rainbow':
      return e.type === 'deliver' && e.actor === PLAYER_ID && e.rainbow ? m.done + 1 : m.done
    case 'streak':
      // Quiet deliveries since the mission appeared; waking the dragon starts it over.
      if (e.type === 'wake') return 0
      return e.type === 'streak' && e.actor === PLAYER_ID ? m.done + 1 : m.done
    case 'steal':
      return e.type === 'claim' && e.actor === PLAYER_ID ? m.done + 1 : m.done
    case 'merge':
      return e.type === 'merge' && e.nest === PLAYER_ID ? m.done + 1 : m.done
    case 'coins':
      // One pickup event can scoop up several coins.
      return e.type === 'coinPickup' && e.actor === PLAYER_ID ? m.done + Math.max(1, Math.round(e.value / CFG.sneezeCoinValue)) : m.done
  }
}

export interface MissionStep {
  readonly missions: Missions
  /** Missions finished by these events, as they were when finished. */
  readonly finished: readonly Mission[]
}

export function stepMissions(ms: Missions, events: readonly GameEvent[]): MissionStep {
  const progressed = ms.list.map((m) => ({ ...m, done: Math.min(m.goal, events.reduce((d, e) => advance({ ...m, done: d }, e), m.done)) }))
  const finished = progressed.filter((m) => m.done >= m.goal)
  if (finished.length === 0) {
    const same = progressed.every((m, i) => m.done === ms.list[i].done)
    return { missions: same ? ms : { ...ms, list: progressed }, finished }
  }
  let seed = ms.seed
  let completed = ms.completed
  let list: Mission[] = progressed.filter((m) => m.done < m.goal)
  progressed.forEach((m, i) => {
    if (m.done < m.goal) return
    completed += 1
    const r = roll(seed, [...list.map((x) => x.kind), m.kind], completed)
    seed = r.seed
    list = [...list.slice(0, i), r.mission, ...list.slice(i)]
  })
  return { missions: { list, seed, completed }, finished }
}

/** Reads a stored value back; anything malformed gives a fresh set. */
export function missionsFrom(raw: unknown, seed: number): Missions {
  const r = raw as Partial<Missions> | null
  if (r === null || typeof r !== 'object' || !Array.isArray(r.list) || r.list.length !== 3) return newMissions(seed)
  const ok = r.list.every(
    (m: Partial<Mission>) => KINDS.includes(m.kind as MissionKind) && Number.isFinite(m.goal) && Number.isFinite(m.done) && Number.isFinite(m.min),
  )
  if (!ok || !Number.isFinite(r.seed) || !Number.isFinite(r.completed)) return newMissions(seed)
  return { list: r.list as Mission[], seed: (r.seed as number) >>> 0, completed: r.completed as number }
}
