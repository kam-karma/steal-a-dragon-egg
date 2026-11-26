import * as THREE from 'three'
import type { Sfx } from './audio'
import type { Hud } from './hud'
import type { Panels } from './hudPanels'
import { displayName, levelTitle, T } from './i18n'
import type { DragonRig } from './render/dragonMesh'
import type { HoardView } from './render/hoardView'
import type { Particles } from './render/particles'
import { PLAYER_ID } from './sim/ids'
import type { GameEvent, GameState, Layout } from './sim/types'

export interface FeelDeps {
  readonly hud: Hud
  readonly panels: Panels
  readonly sfx: Sfx
  readonly fx: Particles
  readonly hoard: HoardView
  readonly dragon: DragonRig
  readonly toScreen: (v: THREE.Vector3) => { x: number; y: number }
  readonly layout: Layout
  readonly shake: (seconds: number) => void
  /** One-time tutorial hints, keyed so each shows once. */
  readonly hintOnce: (key: string, text: string, seconds: number) => void
}

const v = new THREE.Vector3()
const nestAt = (d: FeelDeps, i: number): THREE.Vector3 => v.set(d.layout.nests[i].x, 1.2, d.layout.nests[i].z)

/** Things that happen to the player personally. */
function mine(e: GameEvent, d: FeelDeps): boolean {
  switch (e.type) {
    case 'pickup':
      if (e.actor !== PLAYER_ID) return true
      d.sfx.pickup(e.rarity)
      d.hud.toast(e.rainbow ? T.toast.rainbowEgg : T.toast.egg(e.rarity), 'good')
      d.hintOnce('toNest', T.hint.toNest, 5)
      return true
    case 'deliver':
      if (e.actor !== PLAYER_ID) return true
      d.sfx.deliver()
      d.hud.toast(T.toast.delivered, 'good')
      d.hintOnce('hatchSoon', T.hint.hatchSoon, 4)
      return true
    case 'nestFull':
      if (e.actor !== PLAYER_ID) return true
      if (e.canMerge) {
        d.hud.toast(T.toast.nestFull, 'bad')
        d.hintOnce('nestFull', T.hint.nestFull, 6)
      } else {
        d.hud.toast(T.toast.nestFullBack, 'bad')
        d.hintOnce('nestFullBack', T.hint.nestFullBack, 6)
      }
      return true
    case 'streak':
      if (e.actor === PLAYER_ID && e.streak === 2) d.hintOnce('streak', T.hint.streak, 4)
      return true
    case 'panPickup':
      if (e.actor === PLAYER_ID) d.hud.toast(T.toast.panPicked, 'info')
      return true
    case 'coinPickup':
      if (e.actor === PLAYER_ID) d.sfx.coin()
      return true
    case 'levelUp':
      if (e.actor !== PLAYER_ID) return true
      d.sfx.levelUp()
      d.hud.toast(T.toast.levelUp(e.level, levelTitle(e.level)), 'good')
      return true
    case 'rebirth':
      d.sfx.fanfare()
      d.fx.burst(nestAt(d, PLAYER_ID), 0xffd700, 80)
      d.hud.toast(T.toast.rebirth(e.rebirths), 'good')
      return true
    case 'reward':
      if (e.actor === PLAYER_ID) d.hud.toast(T.toast.reward(e.reward), 'good')
      return true
    default:
      return false
  }
}

/** Things in the player's nest. */
function nest(e: GameEvent, s: GameState, d: FeelDeps): boolean {
  switch (e.type) {
    case 'hatch':
      if (e.nest !== PLAYER_ID) return true
      d.sfx.hatch(e.rarity)
      d.fx.burst(nestAt(d, e.nest), 0xffe066, 40)
      if (!e.shiny) d.hud.toast(T.toast.hatched(e.rarity), 'good')
      return true
    case 'shiny':
      d.fx.burst(nestAt(d, e.nest), 0xfff3a0, 70)
      d.sfx.shiny()
      d.hud.toast(e.nest === PLAYER_ID ? T.toast.shiny : `${displayName(s.actors[e.nest])}: ${T.toast.shiny}`, 'good')
      return true
    case 'coin': {
      if (e.nest !== PLAYER_ID) return true
      d.sfx.coin()
      d.hoard.babyPos(e.nest, e.baby, v)
      v.y += 1.4
      const p = d.toScreen(v)
      d.hud.floater(p.x, p.y, `+${Math.round(e.amount)}`, '#ffe066')
      return true
    }
    case 'grow':
      if (e.nest === PLAYER_ID && e.stage > 0) d.hud.toast(T.toast.grow(e.stage as 1 | 2), 'good')
      return true
    case 'merge':
      if (e.nest !== PLAYER_ID) return true
      d.sfx.hatch(e.rarity)
      d.fx.burst(nestAt(d, e.nest), 0xb46bff, 50)
      d.hud.toast(T.toast.merge(e.rarity), 'good')
      return true
    case 'insurance':
      if (e.nest === PLAYER_ID) d.hud.toast(T.toast.insurance, 'info')
      return true
    default:
      return false
  }
}

/** Stealing, chasing, revenge. */
function raid(e: GameEvent, s: GameState, d: FeelDeps): boolean {
  switch (e.type) {
    case 'steal':
      if (e.from === PLAYER_ID) {
        d.sfx.alarm()
        d.hud.toast(T.toast.stolenFromMe(s.actors[e.actor].name), 'bad')
        d.hintOnce('stolenMine', T.hint.stolenMine, 4)
      } else if (e.actor === PLAYER_ID) {
        d.sfx.grab()
        d.hud.toast(T.toast.iStole(e.rarity), 'good')
        d.hintOnce('stoleOne', T.hint.stoleOne, 3)
      }
      return true
    case 'claim':
      if (e.actor === PLAYER_ID) {
        d.sfx.hatch(e.rarity)
        d.fx.burst(nestAt(d, PLAYER_ID), 0x7dffa0, 30)
        d.hud.toast(T.toast.claimed, 'good')
      } else if (e.from === PLAYER_ID) d.hud.toast(T.toast.lostBaby(s.actors[e.actor].name), 'bad')
      return true
    case 'recover':
      if (e.owner === PLAYER_ID) {
        d.sfx.deliver()
        d.hud.toast(T.toast.recovered, 'good')
      } else if (e.thief === PLAYER_ID) {
        d.sfx.burned()
        d.hud.toast(T.toast.caught, 'bad')
      }
      return true
    case 'revenge':
      d.sfx.fanfare()
      d.hud.toast(T.toast.revenge, 'good')
      return true
    default:
      return false
  }
}

/** The dragon, the pan, the rainbow egg, the sneeze. */
function world(e: GameEvent, s: GameState, d: FeelDeps): boolean {
  switch (e.type) {
    case 'burned':
      d.fx.smoke(v.set(s.actors[e.actor].pos.x, 1.5, s.actors[e.actor].pos.z))
      if (e.actor === PLAYER_ID) {
        d.sfx.burned()
        d.hud.toast(e.dropped === null ? T.toast.burned : T.toast.burnedEgg, 'bad')
      }
      return true
    case 'stir':
      d.sfx.stir()
      d.hintOnce('stir', T.hint.stir, 4)
      return true
    case 'wake':
      d.sfx.roar()
      d.shake(1.4)
      d.hud.toast(T.toast.wake, 'bad')
      if (e.culprit !== null) d.panels.culprit(displayName(s.actors[e.culprit]))
      d.hintOnce('wake', T.hint.wake, 4)
      return true
    case 'fire':
      d.sfx.fire()
      return true
    case 'sleep':
      d.hud.toast(T.toast.sleep, 'good')
      return true
    case 'pan':
      d.sfx.clang()
      d.shake(0.3)
      d.hud.toast(T.toast.pan(displayName(s.actors[e.actor])), 'info')
      return true
    case 'panSpawn':
      d.hintOnce('pan', T.hint.pan, 6)
      return true
    case 'rainbowWarn':
      d.sfx.fanfare()
      d.hud.toast(T.toast.rainbowWarn, 'info')
      d.hintOnce('rainbow', T.hint.rainbow, 5)
      return true
    case 'rainbowSpawn':
      d.fx.burst(v.set(e.pos.x, 1, e.pos.z), 0xffffff, 60)
      return true
    case 'sneezeWarn':
      d.dragon.itch()
      d.hud.toast(T.toast.sneezeWarn, 'info')
      return true
    case 'sneeze':
      d.dragon.sneeze()
      d.sfx.sneeze()
      d.shake(0.8)
      d.hud.toast(T.toast.sneeze, 'good')
      return true
    default:
      return false
  }
}

/** Turns one simulation event into sound, particles and text. No game rules here. */
export function feel(e: GameEvent, s: GameState, d: FeelDeps): void {
  void (mine(e, d) || nest(e, s, d) || raid(e, s, d) || world(e, s, d))
}
