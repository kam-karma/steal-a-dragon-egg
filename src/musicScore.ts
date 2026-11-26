/**
 * The game's two music loops as plain data: a tiptoeing pizzicato "sneak" while the dragon
 * sleeps, and a fast chase when it wakes. Eight bars of sixteenth notes each, in D minor.
 * music.ts turns these notes into sound; keeping the score pure makes it testable.
 */
export type MusicMode = 'calm' | 'chase'
export type Voice = 'bass' | 'pluck' | 'bell' | 'tick' | 'block' | 'stab' | 'drum' | 'ostinato' | 'xylo'

export interface Note {
  readonly voice: Voice
  /** MIDI pitch, or null for unpitched percussion. */
  readonly midi: number | null
  /** Length in sixteenth-note steps. */
  readonly len: number
  readonly vel: number
}

export const LOOP_STEPS = 128
export const TEMPO: Record<MusicMode, number> = { calm: 96, chase: 150 }

// Dm  Bb  C  Am | Dm  Gm  Bb  A  (root, third, fifth as MIDI numbers around octave 3)
const CHORDS: readonly (readonly [number, number, number])[] = [
  [50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52],
  [50, 53, 57], [43, 46, 50], [46, 50, 53], [45, 49, 52],
]

/** Melody per bar in eighth notes: an index into the chord's tones an octave up (3 = next root), or -1 for a rest. */
const SNEAK: readonly (readonly number[])[] = [
  [0, -1, 1, -1, 2, 1, 0, -1],
  [2, -1, 1, -1, 0, -1, 1, 2],
  [3, -1, 2, -1, 1, 2, 1, -1],
  [0, -1, -1, 1, 2, -1, 1, -1],
  [0, -1, 1, -1, 2, 3, 2, -1],
  [1, -1, 0, -1, 1, -1, 2, 1],
  [2, -1, 3, -1, 2, 1, 0, -1],
  [1, 2, 1, -1, 0, -1, -1, -1],
]

function tone(bar: number, k: number, octaveUp: number): number {
  const c = CHORDS[bar]
  return k >= 3 ? c[0] + 12 + octaveUp * 12 : c[k] + octaveUp * 12
}

function calm(step: number): Note[] {
  const bar = Math.floor(step / 16)
  const s = step % 16
  const c = CHORDS[bar]
  const out: Note[] = []
  if (s === 0) out.push({ voice: 'bass', midi: c[0] - 12, len: 6, vel: 0.9 })
  if (s === 8) out.push({ voice: 'bass', midi: c[2] - 12, len: 4, vel: 0.7 })
  if (s === 14 && bar % 2 === 1) out.push({ voice: 'bass', midi: c[1] - 12, len: 2, vel: 0.5 })
  if (s % 2 === 0) {
    const k = SNEAK[bar][s / 2]
    if (k >= 0) out.push({ voice: 'pluck', midi: tone(bar, k, 1), len: 2, vel: s % 4 === 0 ? 0.8 : 0.6 })
  }
  // Celesta sparkle answering every other bar.
  if (bar % 2 === 1 && s >= 12) out.push({ voice: 'bell', midi: tone(bar, s - 12, 2), len: 4, vel: 0.5 })
  if (s % 4 === 2) out.push({ voice: 'tick', midi: null, len: 1, vel: 0.5 })
  if (s === 4 || s === 12) out.push({ voice: 'block', midi: null, len: 1, vel: 0.6 })
  return out
}

function chase(step: number): Note[] {
  const bar = Math.floor(step / 16)
  const s = step % 16
  const c = CHORDS[bar]
  const out: Note[] = [{ voice: 'ostinato', midi: s % 4 === 3 ? c[2] : c[0], len: 1, vel: s % 4 === 0 ? 0.9 : 0.55 }]
  if (s === 0 || s === 10) c.forEach((m) => out.push({ voice: 'stab', midi: m + 12, len: 2, vel: 0.8 }))
  if (s === 0 || s === 8) out.push({ voice: 'drum', midi: null, len: 3, vel: s === 0 ? 1 : 0.7 })
  if (s === 6 || s === 14) out.push({ voice: 'drum', midi: null, len: 1, vel: 0.45 })
  if (s % 2 === 0) out.push({ voice: 'bass', midi: c[0] - 12, len: 1, vel: 0.7 })
  if (bar % 2 === 1 && s >= 12) out.push({ voice: 'xylo', midi: tone(bar, s - 12, 2), len: 1, vel: 0.7 })
  return out
}

export function notesAt(mode: MusicMode, step: number): readonly Note[] {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS
  return mode === 'calm' ? calm(s) : chase(s)
}
