import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playAd, type AdCallbacks } from './crazygames'

/** A fake SDK whose requestAd hands its callbacks to the test. */
function fakeSdk(): { sdk: Parameters<typeof playAd>[0]; cb: () => AdCallbacks } {
  let last: AdCallbacks = {}
  return {
    sdk: { ad: { requestAd: (_t, c) => void (last = c) } },
    cb: () => last,
  }
}

describe('playAd', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('resolves true only when the ad finishes', async () => {
    const f = fakeSdk()
    const p = playAd(f.sdk, 'rewarded')
    f.cb().adStarted?.()
    f.cb().adFinished?.()
    await expect(p).resolves.toBe(true)
  })

  it('resolves false on an ad error', async () => {
    const f = fakeSdk()
    const p = playAd(f.sdk, 'rewarded')
    f.cb().adError?.('unfilled')
    await expect(p).resolves.toBe(false)
  })

  it('gives up if the ad never starts, so the game is not stuck paused', async () => {
    const f = fakeSdk()
    const p = playAd(f.sdk, 'rewarded')
    vi.advanceTimersByTime(10_000)
    await expect(p).resolves.toBe(false)
  })

  it('waits for a started ad longer, but not forever', async () => {
    const f = fakeSdk()
    let done: boolean | null = null
    void playAd(f.sdk, 'rewarded').then((v) => (done = v))
    f.cb().adStarted?.()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(done).toBe(null)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(done).toBe(false)
  })

  it('resolves false when requestAd throws', async () => {
    const p = playAd({ ad: { requestAd: () => { throw new Error('disabled') } } }, 'midgame')
    await expect(p).resolves.toBe(false)
  })
})
