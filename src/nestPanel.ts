import { T } from './i18n'
import { foldable } from './smallScreen'
import { icon, type IconName } from './icons'
import { CFG } from './sim/config'
import { nestCapacity } from './sim/economy'
import { capacityOf, growthSpeed, guardReach, type NestTrack, nextUpgradeCost, rebirthCost } from './sim/progression'
import type { Action, Actor, GameState, Layout, Nest, Rarity } from './sim/types'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  parent.appendChild(e)
  return e
}

function button(parent: HTMLElement, label: string, enabled: boolean, onPress: () => void, ic?: IconName, cls = ''): void {
  const b = el('button', `pbtn${enabled ? '' : ' off'}${cls ? ` ${cls}` : ''}`, parent)
  b.innerHTML = `${ic ? icon(ic, 'bic') : ''}<span>${label}</span>`
  b.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    if (enabled) onPress()
  })
}

const TRACK_ICON: Record<NestTrack, IconName> = { size: 'nest', nursery: 'grow', vault: 'coin' }

function trackLabel(track: NestTrack, nest: Nest, cost: number): string {
  if (track === 'size') return T.panel.size(capacityOf(nest.capacityLevel + 1, 0) + nest.perkSlots, cost)
  if (track === 'nursery') return T.panel.nursery(growthSpeed(nest.nursery + 1), cost)
  return T.panel.vault(20 * (nest.vault + 1), cost)
}

function level(nest: Nest, track: NestTrack): number {
  return track === 'size' ? nest.capacityLevel : nest[track]
}

/** The crown question, spelled out: what goes, what stays, what you get. */
function crownAsk(panel: HTMLElement, me: Actor, yes: () => void, no: () => void): void {
  el('div', 'pask ptitle2', panel).textContent = T.panel.crownTitle
  el('div', 'pask lose', panel).textContent = T.panel.crownLose
  el('div', 'pask keep', panel).textContent = T.panel.crownKeep
  el('div', 'pask get', panel).textContent = T.panel.crownGet(me.crowns + 1)
  button(panel, T.panel.yes, true, yes, 'crown', 'gold')
  button(panel, T.panel.no, true, no)
}

/**
 * The nest panel shows while you stand at your own nest: merges, the three upgrade tracks
 * (size, nursery, vault) and the road to the next crown. Rebuilt only when its content changes.
 */
export function createNestPanel(ui: HTMLElement, onAction: (a: Action) => void): (state: GameState, player: number, layout: Layout) => void {
  const panel = el('div', 'nestpanel', ui)
  foldable(panel, () => panel.querySelector('.ptitle'))
  let key = ''
  let confirming = false
  return (state, player, layout) => {
    const me = state.actors[player]
    const nest = state.nests[me.nest]
    const home = layout.nests[me.nest]
    // Hidden until the first egg is home: a new player only needs to learn the egg run.
    const atHome = Math.hypot(me.pos.x - home.x, me.pos.z - home.z) < guardReach(nest.capacityLevel) && (nest.babies.length > 0 || nest.hatching.length > 0 || me.coins > 0)
    panel.style.display = atHome ? 'flex' : 'none'
    if (!atHome) {
      confirming = false
      return
    }
    const counts = ([0, 1, 2, 3] as const).map((r) => nest.babies.filter((b) => b.rarity === r).length)
    const cap = nestCapacity(nest)
    const used = nest.babies.length + nest.hatching.filter((h) => !h.insurance).length
    const crownCost = rebirthCost(me.rebirths)
    const next = [counts.join(), cap, used, Math.floor(me.coins / 100), confirming, nest.capacityLevel, nest.nursery, nest.vault, me.crowns].join('|')
    if (next === key) return
    key = next
    panel.innerHTML = ''
    const canBuy = (['size', 'nursery', 'vault'] as const).some((t) => {
      const c = nextUpgradeCost(t, level(nest, t))
      return c !== null && me.coins >= c
    })
    el('div', 'ptitle', panel).innerHTML = `${icon('nest', 'tic')}<span>${T.panel.title}</span><em>${T.panel.capacity(used, cap)}</em>${canBuy || me.coins >= crownCost ? '<b class="dot">!</b>' : ''}<span class="fold">▾</span>`
    if (confirming) {
      crownAsk(
        panel,
        me,
        () => {
          confirming = false
          onAction({ type: 'rebirth' })
        },
        () => {
          confirming = false
          key = ''
        },
      )
      return
    }
    counts.forEach((n, r) => {
      if (n >= CFG.mergeCount) button(panel, T.panel.merge(r as Rarity, n), true, () => onAction({ type: 'merge', rarity: r as Rarity }), 'recover')
    })
    for (const track of ['size', 'nursery', 'vault'] as const) {
      const cost = nextUpgradeCost(track, level(nest, track))
      if (cost === null) {
        el('div', 'pmax', panel).textContent = T.panel.maxed(T.panel.trackName[track])
        continue
      }
      button(panel, trackLabel(track, nest, cost), me.coins >= cost, () => onAction({ type: 'upgrade', track }), TRACK_ICON[track])
    }
    if (me.coins >= crownCost) {
      button(
        panel,
        T.panel.crown(crownCost),
        true,
        () => {
          confirming = true
          key = ''
        },
        'crown',
        'gold',
      )
    } else {
      const pct = Math.floor((me.coins / crownCost) * 100)
      const bar = el('div', 'crownbar', panel)
      bar.innerHTML = `<i style="width:${pct}%"></i><span>${T.panel.crownProgress(pct)}</span>`
    }
  }
}
