import { T } from './i18n'

const MOVE_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD'] as const
const FALLBACK = ['W', 'A', 'S', 'D'] as const

/** The letters on the player's own keyboard for the W/A/S/D positions (ZQSD on AZERTY). */
export function moveKeyLabels(layout: ReadonlyMap<string, string> | null): string[] {
  return MOVE_CODES.map((code, i) => (layout?.get(code) ?? FALLBACK[i]).toUpperCase())
}

interface KeyboardWithLayout {
  getLayoutMap?: () => Promise<ReadonlyMap<string, string>>
}

/** Asks the browser for the keyboard layout where it can tell (Chromium); null elsewhere. */
function readLayout(): Promise<ReadonlyMap<string, string> | null> {
  const kb = (navigator as Navigator & { keyboard?: KeyboardWithLayout }).keyboard
  if (kb?.getLayoutMap === undefined) return Promise.resolve(null)
  return kb.getLayoutMap().catch(() => null)
}

function keys(labels: readonly string[]): string {
  const [up, left, down, right] = labels.map((l) => `<kbd>${l}</kbd>`)
  return `<div class="keys"><div>${up}</div><div>${left}${down}${right}</div></div>`
}

export interface ControlsHint {
  /** Keeps the hint just above the player's head (screen pixels). */
  readonly follow: (x: number, y: number) => void
  readonly hide: () => void
}

/**
 * The first thing a new player sees in the game: which keys move (or how to drag on a phone).
 * Visual, almost no text; hidden as soon as the player has walked a few steps.
 */
export function showControlsHint(root: HTMLElement, touch: boolean): ControlsHint {
  const box = document.createElement('div')
  box.className = 'controls'
  if (touch) {
    box.innerHTML = `<div class="drag">👆</div><span>${T.controls.drag}</span>`
  } else {
    const draw = (labels: readonly string[]): void => {
      box.innerHTML = `<div class="sets">${keys(labels)}<i>${T.controls.or}</i>${keys(['↑', '←', '↓', '→'])}</div><span>${T.controls.move}</span>`
    }
    draw(FALLBACK)
    void readLayout().then((layout) => draw(moveKeyLabels(layout)))
  }
  root.appendChild(box)
  let gone = false
  return {
    follow: (x, y) => {
      box.style.left = `${x}px`
      box.style.top = `${y}px`
    },
    hide: () => {
      if (gone) return
      gone = true
      box.classList.add('out')
      window.setTimeout(() => box.remove(), 500)
    },
  }
}
