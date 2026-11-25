/** Poki SDK wrapper: rewarded ads, commercial breaks, gameplay start/stop. */

interface PokiSdk {
  init(): Promise<void>
  gameLoadingFinished(): void
  gameplayStart(): void
  gameplayStop(): void
  commercialBreak(): Promise<void>
  rewardedBreak(): Promise<boolean>
}

declare global {
  interface Window {
    PokiSDK?: PokiSdk
  }
}

export interface Ads {
  readonly loaded: () => void
  readonly gameplayStart: () => void
  readonly gameplayStop: () => void
  readonly commercialBreak: () => Promise<void>
  /** Resolves true only when the ad was watched to the end. */
  readonly rewarded: () => Promise<boolean>
}

const SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js'

function loadSdk(): Promise<PokiSdk | null> {
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = SDK_URL
    s.onload = () => {
      const sdk = window.PokiSDK
      if (sdk === undefined) return resolve(null)
      sdk.init().then(
        () => resolve(sdk),
        () => resolve(sdk), // ad blocker: the SDK still works, ads just fail
      )
    }
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
}

/** Local stand-in so rewards can be tested without Poki: a short "ad" overlay. */
function fakeAd(label: string): Promise<boolean> {
  return new Promise((resolve) => {
    const o = document.createElement('div')
    o.className = 'fakead'
    o.textContent = `📺 ${label} (geliştirme reklamı)`
    document.body.appendChild(o)
    window.setTimeout(() => {
      o.remove()
      resolve(true)
    }, 1500)
  })
}

/**
 * `pause` / `resume` stop the game and mute audio around every ad,
 * as Poki requires. Without the SDK, dev builds show a fake ad.
 */
export function createAds(pause: () => void, resume: () => void): Ads {
  // Locally the SDK's test ads report "not watched", so rewards could not be tested:
  // use the fake ad there unless ?pokisdk=1 asks for the real SDK.
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
  const sdk = local && !new URLSearchParams(window.location.search).has('pokisdk') ? Promise.resolve(null) : loadSdk()
  let playing = false

  async function around<T>(run: (s: PokiSdk | null) => Promise<T>): Promise<T> {
    const s = await sdk
    pause()
    if (playing) s?.gameplayStop()
    try {
      return await run(s)
    } finally {
      resume()
      if (playing) s?.gameplayStart()
    }
  }

  return {
    loaded: () => void sdk.then((s) => s?.gameLoadingFinished()),
    gameplayStart: () => {
      if (playing) return
      playing = true
      void sdk.then((s) => s?.gameplayStart())
    },
    gameplayStop: () => {
      if (!playing) return
      playing = false
      void sdk.then((s) => s?.gameplayStop())
    },
    commercialBreak: () => around((s) => (s === null ? Promise.resolve() : s.commercialBreak())),
    rewarded: () =>
      around((s) => {
        if (s !== null) return s.rewardedBreak()
        return local ? fakeAd('Ödüllü reklam') : Promise.resolve(false)
      }),
  }
}
