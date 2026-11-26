import { describe, expect, it } from 'vitest'
import { pickPlatform } from './platform'

describe('pickPlatform', () => {
  it('uses the CrazyGames SDK in a CrazyGames build, wherever it runs', () => {
    expect(pickPlatform('crazygames', 'crazygames.com', '')).toBe('crazygames')
    expect(pickPlatform('crazygames', 'localhost', '')).toBe('crazygames')
  })

  it('uses the Poki SDK in a Poki build once hosted', () => {
    expect(pickPlatform('poki', 'games.poki.com', '')).toBe('poki')
    expect(pickPlatform(undefined, 'kam-karma.github.io', '')).toBe('poki')
  })

  it('uses the fake ad locally in a Poki build unless ?pokisdk=1 asks for the real one', () => {
    expect(pickPlatform('poki', 'localhost', '')).toBe('none')
    expect(pickPlatform('poki', '127.0.0.1', '?x=1')).toBe('none')
    expect(pickPlatform('poki', 'localhost', '?pokisdk=1')).toBe('poki')
  })

  it('falls back to the Poki build for an unknown target', () => {
    expect(pickPlatform('itch', 'example.com', '')).toBe('poki')
  })
})
