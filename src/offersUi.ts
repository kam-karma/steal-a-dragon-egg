import type { Ads } from './ads'
import { T } from './i18n'
import { icon } from './icons'
import { applicable, canUse, DAILY_LIMIT, isFree, type AdLedger, ledgerFromStored, type OfferMemory, pickOffer, recordUse, usedToday } from './meta/offers'
import { PLAYER_ID } from './sim/ids'
import { storePrice, type StoreItem } from './sim/progression'
import type { GameEvent, GameState, Layout, Reward } from './sim/types'

const KEY = 'ue.ads'
const SHOW_FOR = 6

const today = (): string => new Date().toISOString().slice(0, 10)

function loadLedger(): AdLedger {
  try {
    const raw = window.localStorage.getItem(KEY)
    return ledgerFromStored(raw === null ? null : JSON.parse(raw))
  } catch {
    return ledgerFromStored(null)
  }
}

interface Deps {
  readonly ads: Ads
  readonly grant: (r: Reward) => void
  /** Gold purchase (price rises with each buy). */
  readonly buy: (item: StoreItem) => void
  readonly state: () => GameState
}

export interface OffersUi {
  readonly tick: (state: GameState, layout: Layout, gameTime: number) => void
  readonly event: (e: GameEvent, gameTime: number) => void
  /** Dev only: what the picker remembers. */
  readonly debug: () => { memory: OfferMemory; showing: Reward | null; busy: boolean }
}

/**
 * The small offer bubble (right moment, one at a time, gone in 6 s) and the
 * 🎁 Hediyeler panel where a child can pick any reward whenever they like.
 */
export function createOffersUi(root: HTMLElement, d: Deps): OffersUi {
  let ledger = loadLedger()
  let memory: OfferMemory = { lastShownAt: {}, lastAnyAt: -999, burnedAt: null, deliveredAt: null }
  let showing: Reward | null = null
  let shownAt = 0
  let busy = false

  const bubble = document.createElement('div')
  bubble.className = 'offer'
  root.appendChild(bubble)
  const giftBtn = document.createElement('button')
  giftBtn.className = 'giftbtn'
  giftBtn.innerHTML = icon('gift', 'rbic')
  root.appendChild(giftBtn)
  const panel = document.createElement('div')
  panel.className = 'gifts'
  root.appendChild(panel)

  const save = (): void => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(ledger))
    } catch {
      // best effort
    }
  }

  /** First use of each reward is a free taste; after that a rewarded ad pays for it. */
  async function claim(r: Reward): Promise<void> {
    if (busy || !canUse(ledger, r, today()) || !applicable(d.state(), r)) return
    busy = true
    const ok = isFree(ledger, r) ? true : await d.ads.rewarded()
    busy = false
    if (!ok) return
    ledger = recordUse(ledger, r, today())
    save()
    d.grant(r)
    hide()
    if (panel.classList.contains('open')) renderPanel()
  }

  function button(parent: HTMLElement, r: Reward, enabled: boolean): void {
    const b = document.createElement('button')
    b.className = enabled ? 'obtn' : 'obtn off'
    b.textContent = isFree(ledger, r) ? T.offer.free : T.offer.watch
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      if (enabled) void claim(r)
    })
    parent.appendChild(b)
  }

  function show(r: Reward, now: number): void {
    showing = r
    shownAt = now
    memory = { ...memory, lastAnyAt: now, lastShownAt: { ...memory.lastShownAt, [r]: now } }
    bubble.innerHTML = `${icon(r, 'oic')}<div class="otext"><div class="otitle">${T.offer.title[r]}</div><div class="odesc">${T.offer.desc[r]}</div></div>`
    button(bubble, r, true)
    const close = document.createElement('button')
    close.className = 'oclose'
    close.textContent = '✕'
    close.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      hide()
    })
    bubble.appendChild(close)
    bubble.classList.add('show')
  }

  function hide(): void {
    showing = null
    bubble.classList.remove('show')
  }

  /** The gold price button under a card; greyed out when you cannot afford it or it would do nothing. */
  function coinButton(parent: HTMLElement, item: StoreItem, usable: boolean): void {
    const me = d.state().actors[PLAYER_ID]
    const price = storePrice(item, me.bought[item] ?? 0)
    const ok = usable && me.coins >= price
    const b = document.createElement('button')
    b.className = ok ? 'obtn coinbtn' : 'obtn coinbtn off'
    b.textContent = T.offer.coins(price)
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      if (!ok) return
      d.buy(item)
      // The purchase lands on the next simulation step; redraw right after it.
      window.setTimeout(renderPanel, 80)
    })
    parent.appendChild(b)
  }

  let panelKey = ''

  function renderPanel(): void {
    const g = d.state()
    const me = g.actors[PLAYER_ID]
    panelKey = `${Math.floor(me.coins / 50)}|${JSON.stringify(me.bought)}|${me.drops}`
    panel.innerHTML = `<div class="whead">${icon('gift', 'tic')}<b>${T.offer.giftsTitle}</b></div>`
    const close = document.createElement('button')
    close.className = 'wclose'
    close.textContent = '✕'
    close.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      panel.classList.remove('open')
    })
    panel.firstElementChild?.appendChild(close)
    const grid = document.createElement('div')
    grid.className = 'wgrid'
    for (const r of Object.keys(DAILY_LIMIT) as Reward[]) {
      const left = DAILY_LIMIT[r] - usedToday(ledger, r, today())
      const card = document.createElement('div')
      card.className = 'wcard'
      card.innerHTML = `${icon(r, 'cic')}<div class="otitle">${T.offer.title[r]}</div><div class="odesc">${T.offer.desc[r]}</div><div class="oleft">${T.offer.left(left, DAILY_LIMIT[r])}</div>`
      const ok = left > 0 && applicable(g, r)
      const row = document.createElement('div')
      row.className = 'obtns'
      button(row, r, ok)
      coinButton(row, r, applicable(g, r))
      card.appendChild(row)
      if (!applicable(g, r)) card.insertAdjacentHTML('beforeend', `<div class="oleft">${T.offer.notNow}</div>`)
      grid.appendChild(card)
    }
    const drop = document.createElement('div')
    drop.className = 'wcard'
    drop.innerHTML = `${icon('rainbowEgg', 'cic')}<div class="otitle">${T.offer.dropTitle}</div><div class="odesc">${T.offer.dropDesc(me.drops)}</div>`
    const dropRow = document.createElement('div')
    dropRow.className = 'obtns'
    coinButton(dropRow, 'drop', true)
    drop.appendChild(dropRow)
    grid.appendChild(drop)
    panel.appendChild(grid)
  }

  giftBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    renderPanel()
    panel.classList.toggle('open')
  })

  return {
    tick: (state, layout, now) => {
      if (panel.classList.contains('open')) {
        const me = state.actors[PLAYER_ID]
        if (`${Math.floor(me.coins / 50)}|${JSON.stringify(me.bought)}|${me.drops}` !== panelKey) renderPanel()
      }
      if (showing !== null && now - shownAt > SHOW_FOR) hide()
      if (showing !== null || busy) return
      const r = pickOffer(state, layout, memory, now, ledger, today())
      if (r !== null) show(r, now)
    },
    debug: () => ({ memory, showing, busy }),
    event: (e, now) => {
      if (e.type === 'burned' && e.actor === PLAYER_ID && e.dropped !== null) memory = { ...memory, burnedAt: now }
      if (e.type === 'deliver' && e.actor === PLAYER_ID) memory = { ...memory, deliveredAt: now }
    },
  }
}
