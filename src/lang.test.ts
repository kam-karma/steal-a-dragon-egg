import { describe, expect, it } from 'vitest'
import { pickLang } from './lang'

describe('pickLang', () => {
  it('speaks Turkish to Turkish browsers', () => {
    expect(pickLang(['tr-TR', 'en-US'], '')).toBe('tr')
    expect(pickLang(['tr'], '')).toBe('tr')
  })

  it('speaks English to everyone else', () => {
    expect(pickLang(['en-US'], '')).toBe('en')
    expect(pickLang(['de-DE', 'tr-TR'], '')).toBe('en')
    expect(pickLang([], '')).toBe('en')
  })

  it('lets ?lang= choose', () => {
    expect(pickLang(['tr-TR'], '?lang=en')).toBe('en')
    expect(pickLang(['en-US'], '?lang=tr')).toBe('tr')
    expect(pickLang(['en-US'], '?lang=xx')).toBe('en')
  })
})
