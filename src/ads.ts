import { T } from './i18n'
import { pickPlatform } from './platform'
import type { PortalSdk } from './portal/portal'

/** Ads for whichever portal this build is for: rewarded ads, commercial breaks, gameplay start/stop. */
export interface Ads {
  readonly loaded: () => void
  readonly gameplayStart: () => void
  readonly gameplayStop: () => void
  readonly commercialBreak: () => Promise<void>
  /** Resolves true only when the ad was watched to the end. */
  readonly rewarded: () => Promise<boolean>
}

/**
 * Only one portal's SDK code ends up in a build: VITE_PLATFORM is replaced at build time,
 * so the other branch and its import are dropped.
 */
function loadPortal(): Promise<PortalSdk | null> {
  if (import.meta.env.VITE_PLATFORM === 'crazygames') {
    return import('./portal/crazygames').then((m) => m.loadCrazyGames())
  }
  if (pickPlatform(import.meta.env.VITE_PLATFORM, window.location.hostname, window.location.search) === 'none') {
    return Promise.resolve(null)
  }
  return import('./portal/poki').then((m) => m.loadPoki())
}

/** Local stand-in so rewards can be tested without a portal: a short "ad" overlay. */
function fakeAd(label: string): Promise<boolean> {
  return new Promise((resolve) => {
    const o = document.createElement('div')
    o.className = 'fakead'
    o.textContent = T.devAd(label)
    document.body.appendChild(o)
    window.setTimeout(() => {
      o.remove()
      resolve(true)
    }, 1500)
  })
}

/**
 * `pause` / `resume` stop the game and mute audio around every ad, as the portals require.
 * Without an SDK, local builds show a fake ad.
 */
export function createAds(pause: () => void, resume: () => void): Ads {
  const sdk = loadPortal().catch(() => null)
  const local =
    import.meta.env.VITE_PLATFORM !== 'crazygames' &&
    pickPlatform(undefined, window.location.hostname, window.location.search) === 'none'
  let playing = false
  let loadedSent = false
  let adRunning = false

  // Portals expect "loading finished" before the first "gameplay start".
  function sendLoaded(s: PortalSdk | null): void {
    if (loadedSent) return
    loadedSent = true
    s?.loaded()
  }

  /** Runs one ad with the game paused; a second ad asked for meanwhile gets `busy` at once. */
  async function around<T>(busy: T, run: (s: PortalSdk | null) => Promise<T>): Promise<T> {
    if (adRunning) return busy
    adRunning = true
    const s = await sdk
    pause()
    if (playing) s?.gameplayStop()
    try {
      return await run(s)
    } finally {
      adRunning = false
      resume()
      if (playing) s?.gameplayStart()
    }
  }

  return {
    loaded: () => void sdk.then(sendLoaded),
    gameplayStart: () => {
      if (playing) return
      playing = true
      void sdk.then((s) => {
        sendLoaded(s)
        s?.gameplayStart()
      })
    },
    gameplayStop: () => {
      if (!playing) return
      playing = false
      void sdk.then((s) => s?.gameplayStop())
    },
    commercialBreak: () => around(undefined, (s) => (s === null ? Promise.resolve() : s.midgame())),
    rewarded: () =>
      around(false, (s) => {
        if (s !== null) return s.rewarded()
        return local ? fakeAd(T.rewardedAd) : Promise.resolve(false)
      }),
  }
}
