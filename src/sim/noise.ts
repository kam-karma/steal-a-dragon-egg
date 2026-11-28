import { CFG } from './config'
import { quietFactor } from './progression'
import type { Actor, GameState } from './types'

/** Noise one actor makes for metres walked on gold. */
export function noiseFrom(a: Actor, walkedOnGold: number): number {
  if (a.items.cloakLeft > 0) return 0
  const load = a.carrying?.chest ? CFG.chestNoiseFactor : a.carrying?.rainbow ? CFG.rainbowNoiseFactor : a.carrying !== null || a.stolen !== null ? CFG.carryNoiseFactor : 1
  const boots = a.items.bootsLeft > 0 ? CFG.bootsNoiseFactor : 1
  const bot = a.isBot ? CFG.botNoiseFactor : 1
  return walkedOnGold * CFG.noisePerMetre * load * boots * bot * quietFactor(a.perks.quiet)
}

export interface NoiseStep {
  readonly noise: number
  readonly noiseShare: readonly number[]
}

/**
 * Adds this frame's noise per actor, or lets it fade when the cave is quiet.
 * Bots are not heard during the calm start (CFG.botQuietTime).
 * Shares are scaled with the total so "who made it" stays proportional.
 */
export function accumulate(state: GameState, added0: readonly number[], dt: number): NoiseStep {
  const calm = state.time < CFG.botQuietTime
  const added = calm ? added0.map((v, i) => (state.actors[i]?.isBot === true ? 0 : v)) : added0
  const sum = added.reduce((s, v) => s + v, 0)
  const shares = state.actors.map((_, i) => (state.noiseShare[i] ?? 0) + (added[i] ?? 0))
  const raw = sum > 0 ? state.noise + sum : state.noise - CFG.noiseDecay * dt
  const noise = Math.min(100, Math.max(0, raw))
  const total = shares.reduce((s, v) => s + v, 0)
  const scale = total > 0 ? Math.min(1, noise / total) : 0
  return { noise, noiseShare: shares.map((v) => v * scale) }
}

/** Who made the most of the current noise; null when nobody did. */
export function culprit(noiseShare: readonly number[]): number | null {
  let best: number | null = null
  let most = 0
  noiseShare.forEach((v, i) => {
    if (v > most) {
      most = v
      best = i
    }
  })
  return best
}
