import { PLAYER_ID } from './sim/ids'
import type { GameEvent } from './sim/types'

const KEY = 'ue.log'
const MAX = 5000

interface LogEntry {
  readonly t: number
  readonly name: string
  readonly data?: Record<string, unknown>
}

function read(): LogEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LogEntry[]) : []
  } catch {
    return []
  }
}

let buffer: LogEntry[] = []
let dirty = false

/** Records one event (kept in a ring of the last 5000, written to storage every few seconds). */
export function track(name: string, data?: Record<string, unknown>): void {
  buffer = [...buffer.slice(-(MAX - 1)), { t: Date.now(), name, data }]
  dirty = true
}

function flush(): void {
  if (!dirty) return
  dirty = false
  try {
    window.localStorage.setItem(KEY, JSON.stringify(buffer))
  } catch {
    // Storage full or blocked: the log is best-effort.
  }
}

/** Downloads the whole log as a JSON file (for the kid playtests). */
export function exportLog(): void {
  flush()
  const blob = new Blob([JSON.stringify(buffer, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `uyuyan-ejderha-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Maps the simulation events a playtest cares about to log lines. */
export function createSessionLog(): (e: GameEvent, gameTime: number) => void {
  // Read here, not at import time, so `?reset=1` (run first in main) really starts clean.
  buffer = read()
  const firsts = new Set<string>()
  const startedAt = Date.now()
  track('session_start')
  window.setInterval(flush, 5000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      track('session_length', { seconds: Math.round((Date.now() - startedAt) / 1000) })
      flush()
    }
  })
  const once = (name: string, gameTime: number): void => {
    if (firsts.has(name)) return
    firsts.add(name)
    track(name, { seconds: Math.round(gameTime) })
  }
  return (e, gameTime) => {
    const mine = 'actor' in e && e.actor === PLAYER_ID
    if (e.type === 'pickup' && mine) once('first_egg_pickup', gameTime)
    if (e.type === 'deliver' && mine) once('first_deliver', gameTime)
    if (e.type === 'deliver' && mine && e.rainbow) track('rainbow_delivered')
    if (e.type === 'wake') track('wake', { culprit: e.culprit, byPlayer: e.culprit === PLAYER_ID })
    if (e.type === 'steal' || e.type === 'claim') track(e.type, { actor: e.actor, from: e.from, rarity: e.rarity })
    if (e.type === 'recover') track('recover', { owner: e.owner, thief: e.thief })
    if (e.type === 'rebirth' || e.type === 'merge' || e.type === 'reward') track(e.type, { ...e })
    if (e.type === 'shiny' && e.nest === PLAYER_ID) track('shiny')
  }
}
