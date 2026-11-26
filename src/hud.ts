import { displayName, T } from './i18n'
import { icon } from './icons'
import { incomePerSecond } from './sim/nests'
import type { GameState } from './sim/types'

export interface Hud {
  readonly showLoading: () => () => void
  readonly update: (state: GameState, player: number) => void
  readonly toast: (text: string, tone?: 'good' | 'bad' | 'info') => void
  readonly floater: (x: number, y: number, text: string, color: string) => void
  readonly hint: (text: string | null) => void
  readonly onMute: (fn: () => boolean) => void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  e.innerHTML = html
  parent.appendChild(e)
  return e
}

const MOOD: Record<string, string> = T.mood

export function createHud(root: HTMLElement): Hud {
  const ui = el('div', 'ui', root)

  const meter = el('div', 'meter', ui)
  const eye = el('div', 'eye', meter, icon('eye', 'eyeimg'))
  const lid = el('div', 'lid', eye)
  const bar = el('div', 'bar', meter)
  const fill = el('div', 'fill', bar)
  const mood = el('div', 'mood', meter)

  const purse = el('div', 'purse', ui)
  el('div', 'purseicon', purse, icon('coin'))
  const purseText = el('div', 'pursetext', purse)
  const coins = el('div', 'coins', purseText)
  const rate = el('div', 'rate', purseText)

  const boardBox = el('div', 'board', ui, `<div class="boardhead">${icon('trophy')}<span>${T.board}</span></div>`)
  const board = el('div', 'rows', boardBox)
  const mute = el('button', 'mute', ui, '🔊')

  const toastBox = el('div', 'toast', ui)
  const hintBox = el('div', 'hint', ui)
  let toastTimer = 0

  let muteFn: (() => boolean) | null = null
  mute.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    if (muteFn !== null) mute.textContent = muteFn() ? '🔇' : '🔊'
  })

  function update(state: GameState, player: number): void {
    const n = state.noise
    const m = state.dragon.mode
    const open = m === 'wake' || m === 'hunt' ? 1 : m === 'stir' ? 0.55 : Math.min(0.35, n / 160)
    lid.style.height = `${(1 - open) * 62}%`
    eye.style.filter = `drop-shadow(0 0 ${4 + open * 16}px rgba(255, ${Math.round(190 - open * 120)}, 0, ${0.3 + open * 0.6}))`
    fill.style.width = `${n}%`
    fill.style.background = `hsl(${Math.max(0, 120 - n * 1.2)}, 90%, 55%)`
    mood.textContent = MOOD[m]
    meter.classList.toggle('alarm', m === 'wake' || m === 'hunt')
    meter.classList.toggle('warn', m === 'stir')

    const me = state.actors[player]
    coins.textContent = Math.floor(me.coins).toLocaleString(T.locale)
    rate.textContent = `+${Math.round(incomePerSecond(state.nests[player], me))}${T.perSec}`

    const ranked = [...state.actors].sort((a, b) => b.coins - a.coins)
    board.innerHTML = ranked
      .map(
        (a, i) =>
          `<div class="row${a.id === player ? ' me' : ''}"><span>${i + 1}.</span><i style="background:#${a.color
            .toString(16)
            .padStart(6, '0')}"></i><b>${displayName(a)}</b><em>${Math.floor(a.coins)}</em></div>`,
      )
      .join('')
  }

  function toast(text: string, tone: 'good' | 'bad' | 'info' = 'info'): void {
    toastBox.textContent = text
    toastBox.className = `toast show ${tone}`
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toastBox.className = 'toast'
    }, 1900)
  }

  function floater(x: number, y: number, text: string, color: string): void {
    const f = el('div', 'floater', ui, text)
    f.style.left = `${x}px`
    f.style.top = `${y}px`
    f.style.color = color
    window.setTimeout(() => f.remove(), 1100)
  }

  function hint(text: string | null): void {
    hintBox.textContent = text ?? ''
    hintBox.classList.toggle('show', text !== null)
  }

  /** Logo while the models load; `done` fades it away and the player is already in the game. */
  function showLoading(): () => void {
    const s = el('div', 'loading', root, `<img class="logo" src="./ui/logo.webp" alt="${T.start.title}" draggable="false"><div class="dots">${T.loading}</div>`)
    return () => {
      s.classList.add('out')
      window.setTimeout(() => s.remove(), 600)
    }
  }

  return { showLoading, update, toast, floater, hint, onMute: (fn) => (muteFn = fn) }
}
