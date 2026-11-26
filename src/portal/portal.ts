/** What the game needs from a portal's SDK, whichever portal it is. */
export interface PortalSdk {
  readonly loaded: () => void
  readonly gameplayStart: () => void
  readonly gameplayStop: () => void
  /** A commercial break between rounds. */
  readonly midgame: () => Promise<void>
  /** Resolves true only when the ad was watched to the end. */
  readonly rewarded: () => Promise<boolean>
}

/** Adds a script tag; resolves false if it fails to load (offline, blocked). */
export function loadScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
}
