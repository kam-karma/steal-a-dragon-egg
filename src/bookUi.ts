import { T } from './i18n'
import { BOOK_ENTRIES, type BookEntry, bookFrom, discover, type DragonBook, entryReward } from './meta/dragonBook'
import type { GameEvent, Rarity } from './sim/types'

const KEY = 'ue.book'
const RARITY_COLOR = ['#9fe08a', '#5ab8ff', '#c86bff', '#ffc23d', '#ff6fb5']
const SPECIAL_EMOJI: Record<string, string> = { adult: '🐲', golden: '🌟', rainbow: '🌈', chest: '🧰' }

function load(): DragonBook {
  try {
    const raw = window.localStorage.getItem(KEY)
    return bookFrom(raw === null ? null : JSON.parse(raw))
  } catch {
    return bookFrom(null)
  }
}

function save(b: DragonBook): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(b))
  } catch {
    // Storage unavailable: the book starts over next time.
  }
}

export function entryName(e: BookEntry): string {
  const m = /^baby(\d)(s?)$/.exec(e)
  if (m === null) return T.book.special[e] ?? e
  return T.book.baby(T.rarity[Number(m[1]) as Rarity], m[2] === 's')
}

function entryArt(e: BookEntry): string {
  const m = /^baby(\d)(s?)$/.exec(e)
  if (m === null) return `<div class="perkic">${SPECIAL_EMOJI[e] ?? '❔'}</div>`
  const shiny = m[2] === 's'
  return `<div class="perkic bookbaby${shiny ? ' shiny' : ''}" style="--c:${RARITY_COLOR[Number(m[1])]}">🐉</div>`
}

interface Deps {
  readonly pay: (coins: number, crowns: number) => void
  readonly celebrate: (text: string) => void
}

export interface BookUi {
  readonly events: (events: readonly GameEvent[]) => void
}

/** The 📖 button and the Dragon Book page grid; finds arrive as simulation events. */
export function createBookUi(root: HTMLElement, d: Deps): BookUi {
  let book = load()
  const btn = document.createElement('button')
  btn.className = 'bookbtn'
  root.appendChild(btn)
  const panel = document.createElement('div')
  panel.className = 'gifts bookpanel'
  root.appendChild(panel)

  function drawButton(): void {
    btn.innerHTML = `<span class="bookic">📖</span><b>${book.found.length}</b>`
  }

  function render(): void {
    panel.innerHTML = `<div class="whead"><span class="bookic">📖</span><b>${T.book.title}</b><span>${T.book.progress(book.found.length, BOOK_ENTRIES.length)}</span></div>`
    const close = document.createElement('button')
    close.className = 'wclose'
    close.textContent = '✕'
    close.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      panel.classList.remove('open')
    })
    panel.firstElementChild?.appendChild(close)
    panel.insertAdjacentHTML('beforeend', `<div class="odesc">${T.book.hint}</div>`)
    const grid = document.createElement('div')
    grid.className = 'wgrid'
    for (const e of BOOK_ENTRIES) {
      const have = book.found.includes(e)
      const card = document.createElement('div')
      card.className = `wcard${have ? ' on' : ' locked'}`
      card.innerHTML = have
        ? `${entryArt(e)}<div class="otitle">${entryName(e)}</div>`
        : `<div class="perkic">❔</div><div class="otitle">${T.book.locked}</div><div class="oleft">🪙 ${entryReward(e).toLocaleString(T.locale)}</div>`
      grid.appendChild(card)
    }
    panel.appendChild(grid)
  }

  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    render()
    panel.classList.toggle('open')
  })
  drawButton()

  return {
    events: (events) => {
      if (events.length === 0) return
      const r = discover(book, events)
      if (r.found.length === 0) return
      book = r.book
      save(book)
      for (const e of r.found) {
        const coins = entryReward(e)
        d.pay(coins, 0)
        d.celebrate(T.book.found(entryName(e), coins))
      }
      if (r.completed) {
        d.pay(0, 1)
        d.celebrate(T.book.complete)
      }
      drawButton()
      if (panel.classList.contains('open')) render()
    },
  }
}
