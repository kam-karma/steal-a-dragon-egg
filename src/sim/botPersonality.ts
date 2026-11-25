import { CFG } from './config'
import { PLAYER_ID } from './ids'
import { handsFree } from './movement'
import type { Actor, BotBrain, GameState, Personality, Vec } from './types'

const ORDER: readonly Personality[] = ['careful', 'greedy', 'troll', 'avenger', 'careful', 'greedy', 'troll']

/** Bot index 0..6 → personality, always in the same order. */
export function assignPersonality(index: number): Personality {
  return ORDER[index % ORDER.length]
}

/** How readily a personality steps on gold and goes for deep, rare eggs. */
export const CLUMSY: Record<Personality, number> = { careful: 0.1, greedy: 0.6, troll: 0.45, avenger: 0.3 }

/** Greedy bots always run for the rainbow egg; the others only half of them. */
export function wantsRainbow(a: Actor): boolean {
  return a.personality === 'greedy' || a.id % 2 === 0
}

/** Where the rainbow egg is, or where it is about to appear; null when there is none. */
export function rainbowTarget(state: GameState): Vec | null {
  if (state.happenings.rainbowPos !== null && state.eggs.some((e) => e.rainbow)) return state.happenings.rainbowPos
  if (!state.happenings.rainbowWarned) return null
  const r = CFG.dragonRadius + 1.4
  return { x: Math.sin(state.dragon.yaw) * r, z: Math.cos(state.dragon.yaw) * r }
}

/** A troll bangs its pan when the player is deep in the hoard with something in hand. */
export function shouldBangPan(state: GameState, a: Actor): boolean {
  if (a.personality !== 'troll' || a.items.pans < 1 || a.items.panCooldown > 0) return false
  if (state.dragon.mode !== 'sleep' && state.dragon.mode !== 'stir') return false
  const player = state.actors.find((o) => o.id === PLAYER_ID)
  return player !== undefined && !handsFree(player) && Math.hypot(player.pos.x, player.pos.z) < 9.5
}

/** An avenger whose baby the player is carrying holds a grudge and goes for the player's nest. */
export function updateGrudge(state: GameState, a: Actor, brain: BotBrain, dt: number): BotBrain {
  const player = state.actors.find((o) => o.id === PLAYER_ID)
  const robbed = a.personality === 'avenger' && player?.stolen?.from === a.nest
  if (robbed) return { ...brain, grudge: CFG.grudgeTime, raidNest: PLAYER_ID, raidTime: 0 }
  return { ...brain, grudge: Math.max(0, brain.grudge - dt) }
}

/** Every 20-40 s a bot wanders off in a random direction for 0.6 s, like a distracted kid. */
export function stepOops(brain: BotBrain, dt: number, roll: number): BotBrain {
  if (brain.oopsLeft > 0) return { ...brain, oopsLeft: Math.max(0, brain.oopsLeft - dt) }
  const oopsIn = brain.oopsIn - dt
  if (oopsIn > 0) return { ...brain, oopsIn }
  const a = roll * Math.PI * 2 * 7
  return { ...brain, oopsIn: 20 + roll * 20, oopsLeft: 0.6, oopsDir: { x: Math.sin(a), z: Math.cos(a) } }
}
