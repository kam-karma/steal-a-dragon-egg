import { fromSave, type SaveV1 } from './sim/save'

const KEY = 'ue.save'

/**
 * `?reset=1` wipes the save and the playtest log before the game loads.
 * (Clearing storage from the console does not work: the page re-saves itself on unload.)
 */
export function resetIfAsked(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('reset')) return
  try {
    window.localStorage.removeItem(KEY)
    window.localStorage.removeItem('ue.log')
    window.localStorage.removeItem('ue.wardrobe')
    window.localStorage.removeItem('ue.ads')
    window.localStorage.removeItem('ue.missions')
  } catch {
    // Storage blocked: nothing to reset.
  }
  url.searchParams.delete('reset')
  window.history.replaceState(null, '', url.toString())
}

/** Reads the save; any problem (blocked storage, bad JSON, old version) means a fresh game. */
export function loadSave(): SaveV1 | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw === null ? null : fromSave(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Writes the save; failing to write (private mode, full quota) is silently ignored. */
export function writeSave(save: SaveV1): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // Storage unavailable: the game keeps running, progress just is not kept.
  }
}

/** Saves every 10 s and whenever the tab is hidden. */
export function autoSave(snapshot: () => SaveV1): void {
  window.setInterval(() => writeSave(snapshot()), 10_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeSave(snapshot())
  })
}
