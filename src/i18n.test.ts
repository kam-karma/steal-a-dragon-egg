import { describe, expect, it } from 'vitest'
import { displayName, T } from './i18n'
import { EN } from './i18n/en'
import { TR } from './i18n/tr'

describe('displayName', () => {
  it('marks bots as bots, so nobody mistakes them for real players', () => {
    expect(displayName({ isBot: true, id: 1, name: 'KaplanKız' })).toBe(`🤖 ${T.botNames[0]}`)
    expect(displayName({ isBot: true, id: 8, name: 'x' })).toBe(`🤖 ${T.botNames[0]}`)
  })
  it('shows the player as YOU', () => {
    expect(displayName({ isBot: false, id: 0, name: 'SEN' })).toBe(T.you)
  })
  it('has English bot names in English and the same number in both languages', () => {
    expect(EN.botNames).toHaveLength(7)
    expect(TR.botNames).toHaveLength(7)
    EN.botNames.forEach((n) => expect(n).toMatch(/^[A-Za-z]+$/))
  })
})
