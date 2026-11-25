import { CFG } from './config'
import { angleDiff } from './world'
import type { Dragon, GameEvent } from './types'

export const SLEEPING: Dragon = { mode: 'sleep', t: 0, yaw: 0, fire: false, wakes: 0, lullaby: 0 }

export interface DragonStep {
  readonly dragon: Dragon
  readonly noise: number
  readonly events: readonly GameEvent[]
}

function turnToward(yaw: number, target: number | null, dt: number): number {
  if (target === null) return yaw
  const d = angleDiff(target, yaw)
  const maxTurn = CFG.headTurnSpeed * dt
  return yaw + Math.max(-maxTurn, Math.min(maxTurn, d))
}

/**
 * Sleep → stir (eye peeks) → wake (roar) → hunt (fire) → settle → sleep.
 * `targetYaw` is where the dragon wants to look (the juiciest thief), or null.
 */
export function stepDragon(d0: Dragon, noise: number, dt: number, targetYaw: number | null, culprit: number | null = null): DragonStep {
  const dragon = { ...d0, lullaby: Math.max(0, d0.lullaby - dt) }
  const t = dragon.t + dt
  switch (dragon.mode) {
    case 'sleep':
      if (noise >= CFG.stirAt) return { dragon: { ...dragon, mode: 'stir', t: 0 }, noise, events: [{ type: 'stir' }] }
      return { dragon: { ...dragon, t }, noise, events: [] }
    case 'stir':
      if (noise >= 100 && d0.lullaby <= 0) {
        return {
          dragon: { ...dragon, mode: 'wake', t: 0, wakes: dragon.wakes + 1 },
          noise: 100,
          events: [{ type: 'wake', culprit }],
        }
      }
      if (noise < CFG.calmBelow) return { dragon: { ...dragon, mode: 'sleep', t: 0 }, noise, events: [{ type: 'calm' }] }
      return { dragon: { ...dragon, t }, noise, events: [] }
    case 'wake': {
      const yaw = turnToward(dragon.yaw, targetYaw, dt)
      if (t >= CFG.wakeTime) return { dragon: { ...dragon, mode: 'hunt', t: 0, yaw }, noise: 100, events: [] }
      return { dragon: { ...dragon, t, yaw }, noise: 100, events: [] }
    }
    case 'hunt': {
      const yaw = turnToward(dragon.yaw, targetYaw, dt)
      const fire = t >= CFG.fireDelay
      const events: GameEvent[] = fire && !dragon.fire ? [{ type: 'fire' }] : []
      if (t >= CFG.huntTime) return { dragon: { ...dragon, mode: 'settle', t: 0, yaw, fire: false }, noise: 100, events }
      return { dragon: { ...dragon, t, yaw, fire }, noise: 100, events }
    }
    case 'settle': {
      const remaining = Math.max(0, 1 - t / CFG.settleTime)
      if (t >= CFG.settleTime) return { dragon: { ...dragon, mode: 'sleep', t: 0, fire: false }, noise: 0, events: [{ type: 'sleep' }] }
      return { dragon: { ...dragon, t }, noise: 100 * remaining, events: [] }
    }
  }
}

/** Noise only builds and fades while the dragon is asleep or stirring. */
export function acceptsNoise(d: Dragon): boolean {
  return d.mode === 'sleep' || d.mode === 'stir'
}
