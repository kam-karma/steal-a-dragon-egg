import { levelTitle, T } from './i18n'
import { icon, type IconName } from './icons'
import { createNestPanel } from './nestPanel'
import { levelFromXp, streakMultiplier } from './sim/economy'
import { nextUnlock } from './sim/unlocks'
import type { Action, GameState, Layout } from './sim/types'

export interface Panels {
  readonly update: (state: GameState, player: number, layout: Layout) => void
  readonly culprit: (name: string) => void
  readonly banner: (text: string | null) => void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  parent.appendChild(e)
  return e
}

/** Status strip: silence streak, level bar, active boosts. */
function createStatus(ui: HTMLElement): (state: GameState, player: number) => void {
  const box = el('div', 'status', ui)
  const streak = el('div', 'streak', box)
  const level = el('div', 'level', box)
  const bar = el('div', 'xpbar', box)
  const fill = el('div', 'xpfill', bar)
  const buffs = el('div', 'buffs', box)
  const next = el('div', 'nextunlock', box)
  return (state, player) => {
    const me = state.actors[player]
    streak.textContent = me.streak > 0 ? T.streak(streakMultiplier(me.streak).toFixed(1)) : ''
    streak.style.display = me.streak > 0 ? 'block' : 'none'
    const lvl = levelFromXp(me.xp)
    const lo = 25 * lvl * (lvl + 1)
    const hi = 25 * (lvl + 1) * (lvl + 2)
    level.textContent = `${T.levelShort} ${lvl} · ${levelTitle(lvl)}${me.rebirths > 0 ? ` · 👑${me.rebirths}` : ''}`
    const up = nextUnlock(lvl)
    next.textContent = up === null ? T.unlocks.all : T.unlocks.next(up.level, T.unlocks.name[up.id])
    fill.style.width = `${((me.xp - lo) / (hi - lo)) * 100}%`
    const it = me.items
    const rows: [IconName, string, number][] = [
      ['boots', T.buff.boots, it.bootsLeft],
      ['totem', T.buff.totem, it.totemLeft],
      ['luck', T.buff.luck, it.luckLeft],
      ['gold2x', T.buff.gold2x, it.gold2xLeft],
      ['boots', T.buff.cloak, it.cloakLeft],
    ]
    const shown = rows.filter(([, , left]) => left > 0).map(([ic, label, left]) => `<div>${icon(ic, 'bic')}${label} <b>${Math.ceil(left)}s</b></div>`)
    if (me.streakShield) shown.push(`<div>${icon('streakShield', 'bic')}${T.buff.shield}</div>`)
    buffs.innerHTML = shown.join('')
  }
}

export function createPanels(root: HTMLElement, onAction: (a: Action) => void): Panels {
  const ui = el('div', 'ui ui2', root)
  const status = createStatus(ui)
  const nestPanel = createNestPanel(ui, onAction)
  const card = el('div', 'culprit', ui)
  const band = el('div', 'banner', ui)
  const act = el('button', 'actbtn', ui)
  act.innerHTML = `${icon('pan', 'actic')}<span>${T.action.pan}</span>`
  act.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    onAction({ type: 'usePan' })
  })
  // Put the egg on your head back (also Q on a keyboard).
  const drop = el('button', 'actbtn dropbtn', ui)
  drop.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    onAction({ type: 'dropEgg' })
  })
  let dropLabel = ''
  let cardTimer = 0

  return {
    update: (state, player, layout) => {
      status(state, player)
      nestPanel(state, player, layout)
      const me = state.actors[player]
      act.style.display = me.items.pans > 0 ? 'block' : 'none'
      act.classList.toggle('cool', me.items.panCooldown > 0)
      const canDrop = me.carrying !== null
      drop.style.display = canDrop ? 'block' : 'none'
      drop.classList.toggle('cool', me.drops < 1)
      const label = `${icon('rainbowEgg', 'actic')}<span>${T.action.drop(me.drops)}</span>`
      if (canDrop && label !== dropLabel) {
        dropLabel = label
        drop.innerHTML = label
      }
    },
    culprit: (name) => {
      card.textContent = T.culprit(name)
      card.classList.add('show')
      window.clearTimeout(cardTimer)
      cardTimer = window.setTimeout(() => card.classList.remove('show'), 2200)
    },
    banner: (text) => {
      band.textContent = text ?? ''
      band.classList.toggle('show', text !== null)
    },
  }
}
