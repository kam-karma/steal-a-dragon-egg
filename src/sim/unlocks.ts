import { CFG } from './config'

/** What opens up as the player levels: the game keeps adding something new to look forward to. */
export type UnlockId = 'peek' | 'rain' | 'golden' | 'chest' | 'shower'

export interface Unlock {
  readonly level: number
  readonly id: UnlockId
}

export const UNLOCKS: readonly Unlock[] = [
  { level: CFG.peekLevel, id: 'peek' },
  { level: CFG.rainLevel, id: 'rain' },
  { level: CFG.goldenLevel, id: 'golden' },
  { level: CFG.chestLevel, id: 'chest' },
  { level: CFG.showerLevel, id: 'shower' },
]

/** The next thing to unlock above this level, or null when everything is open. */
export function nextUnlock(level: number): Unlock | null {
  return UNLOCKS.find((u) => u.level > level) ?? null
}

export function unlocked(level: number, id: UnlockId): boolean {
  return UNLOCKS.some((u) => u.id === id && u.level <= level)
}
