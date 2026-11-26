import { loadScript, type PortalSdk } from './portal'

/** Poki SDK v2, as documented at sdk.poki.com. */
interface PokiApi {
  init(): Promise<void>
  gameLoadingFinished(): void
  gameplayStart(): void
  gameplayStop(): void
  commercialBreak(): Promise<void>
  rewardedBreak(): Promise<boolean>
}

declare global {
  interface Window {
    PokiSDK?: PokiApi
  }
}

const SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js'

export async function loadPoki(): Promise<PortalSdk | null> {
  if (!(await loadScript(SDK_URL))) return null
  const sdk = window.PokiSDK
  if (sdk === undefined) return null
  // With an ad blocker init rejects, but the SDK still works: ads just fail.
  await sdk.init().catch(() => undefined)
  return {
    loaded: () => sdk.gameLoadingFinished(),
    gameplayStart: () => sdk.gameplayStart(),
    gameplayStop: () => sdk.gameplayStop(),
    midgame: () => sdk.commercialBreak(),
    rewarded: () => sdk.rewardedBreak(),
  }
}
