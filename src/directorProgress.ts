import type { FeelDeps } from './directorEvents'
import { T } from './i18n'
import { PLAYER_ID } from './sim/ids'
import type { GameEvent } from './sim/types'

/** Feel for long-term progress: upgrades, perks, golden eggs, egg drops and the dragon peeking. */
export function progressFeel(e: GameEvent, d: FeelDeps): boolean {
  switch (e.type) {
    case 'upgraded':
      if (e.actor !== PLAYER_ID) return true
      d.sfx.levelUp()
      d.hud.toast(T.toast.upgraded(T.panel.trackName[e.track], e.level), 'good')
      return true
    case 'perk':
      if (e.actor !== PLAYER_ID) return true
      d.sfx.fanfare()
      d.hud.toast(T.toast.perk(T.crownShop.name[e.perk]), 'good')
      return true
    case 'bought':
      if (e.actor !== PLAYER_ID) return true
      d.sfx.coin()
      d.hud.toast(e.item === 'drop' ? `🥚 +1 ${T.offer.dropTitle}` : T.toast.reward(e.item), 'good')
      return true
    case 'eggDropped':
      if (e.actor === PLAYER_ID) d.hud.toast(T.toast.eggDropped, 'info')
      return true
    case 'golden':
      if (e.actor !== PLAYER_ID) return true
      d.sfx.shiny()
      d.hud.toast(T.toast.golden(e.coins), 'good')
      return true
    case 'rainWarn':
      d.hud.toast(T.toast.rainWarn, 'info')
      return true
    case 'rain':
      d.sfx.fanfare()
      d.hud.toast(T.toast.rain, 'good')
      return true
    case 'chestSpawn':
      d.sfx.shiny()
      d.hud.toast(T.toast.chestSpawn, 'info')
      return true
    case 'chest':
      if (e.actor !== PLAYER_ID) return true
      d.sfx.fanfare()
      d.hud.toast(`${T.toast.chest(e.coins)} · ${T.reward[e.reward]}`, 'good')
      return true
    case 'peekWarn':
      d.sfx.stir()
      d.hud.hint(T.toast.peekWarn)
      return true
    case 'peek':
      d.sfx.alarm()
      d.shake(0.3)
      d.hud.hint(T.toast.peek)
      return true
    case 'peekEnd':
      d.hud.hint(null)
      return true
    default:
      return false
  }
}
