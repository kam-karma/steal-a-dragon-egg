import { describe, expect, it } from 'vitest'
import { moveKeyLabels } from './controlsHint'

describe('moveKeyLabels', () => {
  it('is WASD when the keyboard layout is unknown', () => {
    expect(moveKeyLabels(null)).toEqual(['W', 'A', 'S', 'D'])
  })
  it('follows the player’s keyboard: ZQSD on AZERTY', () => {
    const azerty = new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyS', 's'], ['KeyD', 'd']])
    expect(moveKeyLabels(azerty)).toEqual(['Z', 'Q', 'S', 'D'])
  })
  it('falls back per key when the layout has no letter for it', () => {
    expect(moveKeyLabels(new Map([['KeyW', 'z']]))).toEqual(['Z', 'A', 'S', 'D'])
  })
})
