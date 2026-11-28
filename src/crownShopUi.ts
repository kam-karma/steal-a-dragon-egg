import { T } from './i18n'
import { icon } from './icons'
import { PLAYER_ID } from './sim/ids'
import { type Perk, PERK_MAX, perkCost } from './sim/progression'
import type { GameState } from './sim/types'

const PERKS: readonly Perk[] = ['nest', 'quiet', 'luck', 'head', 'drop']
const PERK_EMOJI: Record<Perk, string> = { nest: '🪺', quiet: '🐾', luck: '🍀', head: '🚀', drop: '🥚' }

interface Deps {
  readonly state: () => GameState
  readonly buyPerk: (perk: Perk) => void
}

export interface CrownShopUi {
  readonly tick: (state: GameState) => void
}

/** The 👑 button (with your crown count) and the Crown Shop: permanent perks bought with crowns. */
export function createCrownShopUi(root: HTMLElement, d: Deps): CrownShopUi {
  const btn = document.createElement('button')
  btn.className = 'crownbtn'
  root.appendChild(btn)
  const panel = document.createElement('div')
  panel.className = 'gifts crownshop'
  root.appendChild(panel)
  let btnKey = ''
  let panelKey = ''

  function render(): void {
    const me = d.state().actors[PLAYER_ID]
    panelKey = `${me.crowns}|${JSON.stringify(me.perks)}`
    panel.innerHTML = `<div class="whead">${icon('crown', 'tic')}<b>${T.crownShop.title}</b><span>${T.crownShop.have(me.crowns)}</span></div>`
    const close = document.createElement('button')
    close.className = 'wclose'
    close.textContent = '✕'
    close.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      panel.classList.remove('open')
    })
    panel.firstElementChild?.appendChild(close)
    panel.insertAdjacentHTML('beforeend', `<div class="odesc">${T.crownShop.hint}</div>`)
    const grid = document.createElement('div')
    grid.className = 'wgrid'
    for (const perk of PERKS) {
      const lvl = me.perks[perk]
      const cost = perkCost(perk, lvl)
      const card = document.createElement('div')
      card.className = 'wcard'
      card.innerHTML = `<div class="perkic">${PERK_EMOJI[perk]}</div><div class="otitle">${T.crownShop.name[perk]}</div><div class="odesc">${T.crownShop.desc[perk]}</div><div class="oleft">${T.crownShop.level(lvl, PERK_MAX[perk])}</div>`
      const b = document.createElement('button')
      const ok = cost !== null && me.crowns >= cost
      b.className = `obtn crownbuy${ok ? '' : ' off'}`
      b.textContent = cost === null ? T.crownShop.maxed : T.crownShop.buy(cost)
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        if (!ok) return
        d.buyPerk(perk)
        window.setTimeout(render, 80)
      })
      card.appendChild(b)
      grid.appendChild(card)
    }
    panel.appendChild(grid)
  }

  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    render()
    panel.classList.toggle('open')
  })

  return {
    tick: (state) => {
      const me = state.actors[PLAYER_ID]
      const k = String(me.crowns)
      if (k !== btnKey) {
        btnKey = k
        btn.innerHTML = `${icon('crown', 'rbic')}<b>${me.crowns}</b>`
        btn.classList.toggle('has', me.crowns > 0)
      }
      if (panel.classList.contains('open') && `${me.crowns}|${JSON.stringify(me.perks)}` !== panelKey) render()
    },
  }
}
