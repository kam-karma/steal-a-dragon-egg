import { loadScript, type PortalSdk } from './portal'

/** CrazyGames HTML5 SDK v3, as documented at docs.crazygames.com/sdk. */
type AdType = 'midgame' | 'rewarded'
export interface AdCallbacks {
  adStarted?: () => void
  adFinished?: () => void
  adError?: (error: unknown) => void
}
interface CrazyApi {
  init(): Promise<void>
  /** 'local' on localhost, 'crazygames' on their site, 'disabled' anywhere else (every call throws). */
  readonly environment: 'local' | 'crazygames' | 'disabled'
  readonly ad: { requestAd(type: AdType, callbacks: AdCallbacks): void }
  readonly game: {
    gameplayStart(): void
    gameplayStop(): void
    loadingStart(): void
    loadingStop(): void
    readonly settings?: { readonly muteAudio?: boolean }
  }
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyApi }
  }
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'

/** An ad that has not started by then is given up on; one that started gets longer to finish. */
const START_TIMEOUT_MS = 10_000
const FINISH_TIMEOUT_MS = 120_000

/**
 * Requests one ad; resolves true only when it played to the end. Errors (ad blocker, no fill)
 * and an SDK that never calls back resolve false, so the game is never left paused.
 */
export function playAd(sdk: Pick<CrazyApi, 'ad'>, type: AdType): Promise<boolean> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const end = (ok: boolean): void => {
      clearTimeout(timer)
      resolve(ok)
    }
    const wait = (ms: number): void => {
      clearTimeout(timer)
      timer = setTimeout(() => end(false), ms)
    }
    wait(START_TIMEOUT_MS)
    try {
      sdk.ad.requestAd(type, {
        adStarted: () => wait(FINISH_TIMEOUT_MS),
        adFinished: () => end(true),
        adError: () => end(false),
      })
    } catch {
      end(false)
    }
  })
}

/** Calls an SDK method, ignoring errors so a broken SDK never stops the game. */
function safe(run: () => void): void {
  try {
    run()
  } catch {
    // The SDK throws when disabled; the game carries on without it.
  }
}

export async function loadCrazyGames(): Promise<PortalSdk | null> {
  if (!(await loadScript(SDK_URL))) return null
  const sdk = window.CrazyGames?.SDK
  if (sdk === undefined) return null
  try {
    await sdk.init()
  } catch {
    return null
  }
  if (sdk.environment === 'disabled') return null
  safe(() => sdk.game.loadingStart())
  return {
    loaded: () => safe(() => sdk.game.loadingStop()),
    gameplayStart: () => safe(() => sdk.game.gameplayStart()),
    gameplayStop: () => safe(() => sdk.game.gameplayStop()),
    midgame: () => playAd(sdk, 'midgame').then(() => undefined),
    rewarded: () => playAd(sdk, 'rewarded'),
  }
}
