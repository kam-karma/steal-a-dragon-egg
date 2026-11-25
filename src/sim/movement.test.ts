import { describe, expect, it } from 'vitest'
import { createGame, PLAYER_ID } from './game'
import { moveActor } from './movement'
import { makeLayout } from './world'

const layout = makeLayout(7)
const me = createGame(layout, 1).actors[PLAYER_ID]

describe('walking into rocks', () => {
  it('slides around a rock hit head-on instead of getting stuck', () => {
    const rock = layout.pillars[3]
    const len = Math.hypot(rock.x, rock.z)
    // Stand just outside the rock (on the far side from the dragon) and walk straight at its centre.
    const ux = rock.x / len
    const uz = rock.z / len
    let a = { ...me, pos: { x: rock.x + ux * (rock.r + 2), z: rock.z + uz * (rock.r + 2) } }
    const start = a.pos
    for (let k = 0; k < 90; k++) a = moveActor(layout, a, -ux, -uz, 1 / 30).actor
    const travelled = Math.hypot(a.pos.x - start.x, a.pos.z - start.z)
    expect(travelled).toBeGreaterThan(rock.r + 2.5)
  })
})

describe('sliding is steady', () => {
  /** Counts how often the sideways direction of travel flips while pushing into an obstacle. */
  function sideFlips(start: { x: number; z: number }, dirX: number, dirZ: number, frames: number): number {
    let a = { ...me, pos: start }
    let lastSide = 0
    let flips = 0
    for (let k = 0; k < frames; k++) {
      const prev = a.pos
      a = moveActor(layout, a, dirX, dirZ, 1 / 60).actor
      // Sideways component of this frame's motion; under 1 cm is rounding noise, not shaking.
      const sideways = (a.pos.x - prev.x) * -dirZ + (a.pos.z - prev.z) * dirX
      const side = Math.abs(sideways) < 0.01 ? 0 : Math.sign(sideways)
      if (side !== 0 && lastSide !== 0 && side !== lastSide) flips++
      if (side !== 0) lastSide = side
    }
    return flips
  }

  it('picks one side and keeps it when walking head-on into a rock', () => {
    const rock = layout.pillars[3]
    const len = Math.hypot(rock.x, rock.z)
    const ux = rock.x / len
    const uz = rock.z / len
    const start = { x: rock.x + ux * (rock.r + 0.7), z: rock.z + uz * (rock.r + 0.7) }
    expect(sideFlips(start, -ux, -uz, 120)).toBe(0)
  })

  it('does not shake when pushing straight into the dragon', () => {
    const start = { x: 0.001, z: 7 }
    expect(sideFlips(start, 0, -1, 120)).toBe(0)
  })

  it('does not shake when pushing into the cave wall', () => {
    const start = { x: 0.001, z: 25.5 }
    expect(sideFlips(start, 0, 1, 120)).toBe(0)
  })
})
