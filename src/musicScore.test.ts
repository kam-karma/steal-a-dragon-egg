import { describe, expect, it } from 'vitest'
import { LOOP_STEPS, notesAt, TEMPO } from './musicScore'

/** D dorian / D minor with the C# leading tone of the A chord: every pitch class the score may use. */
const ALLOWED = new Set([2, 4, 5, 7, 9, 10, 11, 0, 1])

describe('music score', () => {
  it('loops after eight bars of sixteenth notes', () => {
    expect(LOOP_STEPS).toBe(128)
    expect(notesAt('calm', 3)).toEqual(notesAt('calm', 3 + LOOP_STEPS))
    expect(notesAt('chase', 77)).toEqual(notesAt('chase', 77 + LOOP_STEPS))
  })

  it('stays in key, so nothing sounds like a wrong note', () => {
    for (const mode of ['calm', 'chase'] as const) {
      for (let s = 0; s < LOOP_STEPS; s++) {
        notesAt(mode, s)
          .filter((n) => n.midi !== null)
          .forEach((n) => expect(ALLOWED.has((n.midi as number) % 12)).toBe(true))
      }
    }
  })

  it('has a bass note on every downbeat and leaves room between melody notes', () => {
    for (let bar = 0; bar < 8; bar++) expect(notesAt('calm', bar * 16).some((n) => n.voice === 'bass')).toBe(true)
    const melodySteps = Array.from({ length: LOOP_STEPS }, (_, s) => s).filter((s) => notesAt('calm', s).some((n) => n.voice === 'pluck'))
    expect(melodySteps.length).toBeGreaterThan(30)
    expect(melodySteps.length).toBeLessThan(LOOP_STEPS / 2)
  })

  it('the chase is faster and busier than the sneak', () => {
    expect(TEMPO.chase).toBeGreaterThan(TEMPO.calm * 1.4)
    const count = (mode: 'calm' | 'chase') => Array.from({ length: LOOP_STEPS }, (_, s) => notesAt(mode, s).length).reduce((a, b) => a + b, 0)
    expect(count('chase')).toBeGreaterThan(count('calm'))
  })
})
