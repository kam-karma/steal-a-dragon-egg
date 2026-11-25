import { T } from './i18n'
import { icon, type IconName } from './icons'
import { CFG } from './sim/config'
import { levelFromXp, nestCapacity, streakMultiplier, titleFor, upgradeCost } from './sim/economy'
import type { Action, GameState, Layout, Rarity } from './sim/types'

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

function button(parent: HTMLElement, label: string, enabled: boolean, onPress: () => void, ic?: IconName): void {
  const b = el('button', enabled ? 'pbtn' : 'pbtn off', parent)
  b.innerHTML = `${ic ? icon(ic, 'bic') : ''}<span>${label}</span>`
  b.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    if (enabled) onPress()
  })
}

/** Status strip: silence streak, level bar, active boosts. */
function createStatus(ui: HTMLElement): (state: GameState, player: number) => void {
  const box = el('div', 'status', ui)
  const streak = el('div', 'streak', box)
  const level = el('div', 'level', box)
  const bar = el('div', 'xpbar', box)
  const fill = el('div', 'xpfill', bar)
  const buffs = el('div', 'buffs', box)
  return (state, player) => {
    const me = state.actors[player]
    streak.textContent = me.streak > 0 ? T.streak(streakMultiplier(me.streak).toFixed(1)) : ''
    streak.style.display = me.streak > 0 ? 'block' : 'none'
    const lvl = levelFromXp(me.xp)
    const lo = 25 * lvl * (lvl + 1)
    const hi = 25 * (lvl + 1) * (lvl + 2)
    level.textContent = `Sv ${lvl} · ${titleFor(lvl)}${me.rebirths > 0 ? ` · 👑${me.rebirths}` : ''}`
    fill.style.width = `${((me.xp - lo) / (hi - lo)) * 100}%`
    const it = me.items
    const rows: [IconName, string, number][] = [
      ['boots', T.buff.boots, it.bootsLeft],
      ['totem', T.buff.totem, it.totemLeft],
      ['luck', T.buff.luck, it.luckLeft],
      ['gold2x', T.buff.gold2x, it.gold2xLeft],
    ]
    const shown = rows.filter(([, , left]) => left > 0).map(([ic, label, left]) => `<div>${icon(ic, 'bic')}${label} <b>${Math.ceil(left)}s</b></div>`)
    if (me.streakShield) shown.push(`<div>${icon('streakShield', 'bic')}${T.buff.shield}</div>`)
    buffs.innerHTML = shown.join('')
  }
}

/** The nest panel appears while you stand in your own nest. Rebuilt only when its content changes. */
function createNestPanel(ui: HTMLElement, onAction: (a: Action) => void): (state: GameState, player: number, layout: Layout) => void {
  const panel = el('div', 'nestpanel', ui)
  let key = ''
  let confirming = false
  return (state, player, layout) => {
    const me = state.actors[player]
    const nest = state.nests[me.nest]
    const home = layout.nests[me.nest]
    const atHome = Math.hypot(me.pos.x - home.x, me.pos.z - home.z) < CFG.guardRadius
    panel.style.display = atHome ? 'flex' : 'none'
    if (!atHome) {
      confirming = false
      return
    }
    const counts = ([0, 1, 2, 3] as const).map((r) => nest.babies.filter((b) => b.rarity === r).length)
    const cap = nestCapacity(nest.capacityLevel)
    const used = nest.babies.length + nest.hatching.filter((h) => !h.insurance).length
    const coinsBand = Math.floor(me.coins / 100)
    const next = `${counts.join()}|${cap}|${used}|${coinsBand}|${confirming}|${nest.capacityLevel}`
    if (next === key) return
    key = next
    panel.innerHTML = ''
    el('div', 'ptitle', panel).innerHTML = `${icon('nest', 'tic')}<span>${T.panel.title}</span><em>${T.panel.capacity(used, cap)}</em>`
    if (confirming) {
      el('div', 'pask', panel).textContent = T.panel.rebirthAsk
      button(panel, T.panel.yes, true, () => {
        confirming = false
        onAction({ type: 'rebirth' })
      })
      button(panel, T.panel.no, true, () => {
        confirming = false
        key = ''
      })
      return
    }
    counts.forEach((n, r) => {
      if (n >= CFG.mergeCount) button(panel, T.panel.merge(r as Rarity, n), true, () => onAction({ type: 'merge', rarity: r as Rarity }), 'recover')
    })
    if (nest.capacityLevel < 2) {
      const lvl = nest.capacityLevel as 0 | 1
      button(panel, T.panel.upgrade(nestCapacity((lvl + 1) as 1 | 2), upgradeCost(lvl)), me.coins >= upgradeCost(lvl), () => onAction({ type: 'upgradeNest' }), 'nest')
    }
    button(panel, T.panel.boots, me.coins >= CFG.bootsCost, () => onAction({ type: 'buy', item: 'boots' }), 'boots')
    button(panel, T.panel.totem, me.coins >= CFG.totemCost, () => onAction({ type: 'buy', item: 'totem' }), 'totem')
    if (me.coins >= CFG.rebirthCost) {
      button(
        panel,
        T.panel.rebirth,
        true,
        () => {
          confirming = true
          key = ''
        },
        'crown',
      )
    }
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
  let cardTimer = 0

  return {
    update: (state, player, layout) => {
      status(state, player)
      nestPanel(state, player, layout)
      const me = state.actors[player]
      act.style.display = me.items.pans > 0 ? 'block' : 'none'
      act.classList.toggle('cool', me.items.panCooldown > 0)
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
