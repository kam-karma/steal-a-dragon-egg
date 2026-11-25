import * as THREE from 'three'
import type { Sfx } from './audio'
import { feel, type FeelDeps } from './directorEvents'
import type { Hud } from './hud'
import type { Panels } from './hudPanels'
import { T } from './i18n'
import type { DragonRig } from './render/dragonMesh'
import type { HoardView } from './render/hoardView'
import type { Particles } from './render/particles'
import { PLAYER_ID } from './sim/ids'
import type { GameEvent, GameState, Layout } from './sim/types'

interface Deps {
  readonly hud: Hud
  readonly panels: Panels
  readonly sfx: Sfx
  readonly fx: Particles
  readonly hoard: HoardView
  readonly dragon: DragonRig
  readonly toScreen: (v: THREE.Vector3) => { x: number; y: number }
  readonly layout: Layout
  readonly shake: (seconds: number) => void
}

export interface Director {
  readonly begin: () => void
  readonly event: (e: GameEvent, state: GameState) => void
  readonly tick: (dt: number, time: number, state: GameState) => void
  readonly needsEggGuide: () => boolean
  /** Id of whoever is carrying off one of the player's babies, if anyone. */
  readonly thiefOfMine: (state: GameState) => number | null
}

/**
 * Game feel: turns simulation events into sounds, particles, toasts and
 * the few tutorial hints a child needs. No game rules live here.
 */
export function createDirector(d: Deps): Director {
  const shown = new Set<string>()
  let pickedOnce = false
  let hintUntil = 0
  let clock = 0
  let snoreT = 0
  let inhale = true
  let beatT = 0
  let lurkHintAt = -99
  const lastJingle = new Map<number, number>()
  const v = new THREE.Vector3()

  function hintFor(text: string, seconds: number): void {
    d.hud.hint(text)
    hintUntil = clock + seconds
  }

  const feelDeps: FeelDeps = {
    ...d,
    hintOnce: (key, text, seconds) => {
      if (shown.has(key)) return
      shown.add(key)
      hintFor(text, seconds)
    },
  }

  function jingle(e: Extract<GameEvent, { type: 'jingle' }>, state: GameState): void {
    const prev = lastJingle.get(e.actor) ?? 0
    if (clock - prev < (e.actor === PLAYER_ID ? 0.11 : 0.3)) return
    lastJingle.set(e.actor, clock)
    const me = state.actors[PLAYER_ID]
    const far = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z)
    d.sfx.jingle(e.actor === PLAYER_ID ? 1 : Math.max(0.15, 1 - far / 25))
    d.fx.glint(v.set(e.pos.x, 0.6, e.pos.z))
    if (e.actor === PLAYER_ID) feelDeps.hintOnce('gold', T.hint.gold, 4)
  }

  function event(e: GameEvent, state: GameState): void {
    if (e.type === 'jingle') return jingle(e, state)
    if (e.type === 'pickup' && e.actor === PLAYER_ID) pickedOnce = true
    feel(e, state, feelDeps)
  }

  function snore(dt: number, state: GameState): void {
    const m = state.dragon.mode
    if (m !== 'sleep' && m !== 'stir') return
    snoreT -= dt
    if (snoreT <= 0) {
      inhale = !inhale
      snoreT = 1.7
      d.sfx.snore(inhale)
      if (!inhale) {
        d.dragon.nostril(v)
        d.fx.zzz(v)
      }
    }
    if (state.noise > 30) {
      beatT -= dt
      if (beatT <= 0) {
        const s = state.noise / 100
        beatT = 1.1 - s * 0.7
        d.sfx.heartbeat(0.3 + s * 0.7)
      }
    }
  }

  function nudges(state: GameState): void {
    if (state.nests[PLAYER_ID].babies.length > 0) feelDeps.hintOnce('shield', T.hint.shield, 4)
    const lurker = state.actors.find((a) => a.bot?.raidNest === PLAYER_ID && a.bot.goal === 'raid')
    const p = d.layout.nests[PLAYER_ID]
    if (lurker !== undefined && clock - lurkHintAt > 25 && Math.hypot(lurker.pos.x - p.x, lurker.pos.z - p.z) < 10) {
      lurkHintAt = clock
      d.hud.toast(T.toast.lurker(lurker.name), 'info')
    }
    const h = state.happenings
    d.panels.banner(h.rainbowWarned && h.rainbowIn > 0 ? `🌈 ${Math.ceil(h.rainbowIn)}` : null)
  }

  function tick(dt: number, _time: number, state: GameState): void {
    clock += dt
    if (hintUntil > 0 && clock > hintUntil) {
      hintUntil = 0
      d.hud.hint(pickedOnce ? null : T.hint.firstEgg)
    }
    snore(dt, state)
    nudges(state)
  }

  return {
    begin: () => d.hud.hint(T.hint.firstEgg),
    event,
    tick,
    needsEggGuide: () => !pickedOnce,
    thiefOfMine: (state) => state.actors.find((a) => a.stolen?.from === PLAYER_ID)?.id ?? null,
  }
}
