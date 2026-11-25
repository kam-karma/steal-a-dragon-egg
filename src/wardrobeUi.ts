import type { Ads } from './ads'
import { icon } from './icons'
import { CHARACTERS, COLORS, type CatalogItem, type CharacterId, buyWithGold, fromStored, isOwned, select, type Wardrobe, watchedAd } from './meta/wardrobe'

const KEY = 'ue.wardrobe'

function load(): Wardrobe {
  try {
    const raw = window.localStorage.getItem(KEY)
    return fromStored(raw === null ? null : JSON.parse(raw))
  } catch {
    return fromStored(null)
  }
}

function store(w: Wardrobe): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(w))
  } catch {
    // Storage blocked: the wardrobe lasts for this session only.
  }
}

interface Deps {
  readonly coins: () => number
  readonly spend: (amount: number) => void
  readonly ads: Ads
  readonly onWear: (w: Wardrobe) => void
}

const fmt = (n: number): string => n.toLocaleString('tr-TR')

/** The 👕 button and the wardrobe panel: wear, buy with gold, or unlock with rewarded ads. */
export function createWardrobeUi(root: HTMLElement, d: Deps): { readonly current: () => Wardrobe } {
  let w = load()
  const btn = document.createElement('button')
  btn.className = 'wardbtn'
  btn.innerHTML = icon('wardrobe', 'rbic')
  root.appendChild(btn)
  const panel = document.createElement('div')
  panel.className = 'wardrobe'
  root.appendChild(panel)

  function change(next: Wardrobe): void {
    w = next
    store(w)
    d.onWear(w)
    render()
  }

  function offer(it: CatalogItem, wear: () => void): HTMLElement {
    const row = document.createElement('div')
    row.className = 'wbtns'
    const add = (label: string, cls: string, run: () => void): void => {
      const b = document.createElement('button')
      b.className = cls
      b.innerHTML = label
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        run()
      })
      row.appendChild(b)
    }
    if (isOwned(w, it.id)) {
      add('Giy', 'wbtn', wear)
      return row
    }
    const affordable = d.coins() >= it.gold
    add(`${icon('coin', 'bic')}<span>${fmt(it.gold)}</span>`, affordable ? 'wbtn' : 'wbtn off', () => {
      const r = buyWithGold(w, it.id, d.coins())
      if (r === null) return
      d.spend(r.price)
      change(r.wardrobe)
    })
    add(`<span class="adplay">▶</span><span>Reklam ${w.adProgress[it.id] ?? 0}/${it.ads}</span>`, 'wbtn ad', () => {
      void d.ads.rewarded().then((ok) => {
        if (ok) change(watchedAd(w, it.id))
      })
    })
    return row
  }

  function render(): void {
    panel.innerHTML = ''
    const head = document.createElement('div')
    head.className = 'whead'
    head.innerHTML = `${icon('wardrobe', 'tic')}<b>Gardırop</b><span>${icon('coin', 'bic')}${fmt(Math.floor(d.coins()))}</span>`
    const close = document.createElement('button')
    close.className = 'wclose'
    close.textContent = '✕'
    close.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      panel.classList.remove('open')
    })
    head.appendChild(close)
    panel.appendChild(head)
    const chars = document.createElement('div')
    chars.className = 'wgrid'
    for (const c of CHARACTERS) {
      const card = document.createElement('div')
      card.className = `wcard${w.wearing.character === c.id ? ' on' : ''}`
      card.innerHTML = `<div class="wemoji">${c.emoji}</div><div class="wname">${c.name}</div>`
      card.appendChild(offer(c, () => change(select(w, c.id as CharacterId, w.wearing.color))))
      chars.appendChild(card)
    }
    panel.appendChild(chars)
    const cols = document.createElement('div')
    cols.className = 'wgrid colors'
    for (const c of COLORS) {
      const card = document.createElement('div')
      card.className = `wcard${w.wearing.color === c.id ? ' on' : ''}`
      const sw = c.hex === null ? 'linear-gradient(135deg,#b400ff,#ff9a1a)' : `#${c.hex.toString(16).padStart(6, '0')}`
      card.innerHTML = `<div class="wswatch" style="background:${sw}"></div><div class="wname">${c.name}</div>`
      card.appendChild(offer(c, () => change(select(w, w.wearing.character, c.id))))
      cols.appendChild(card)
    }
    panel.appendChild(cols)
  }

  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    render()
    panel.classList.toggle('open')
  })
  d.onWear(w)
  return { current: () => w }
}
