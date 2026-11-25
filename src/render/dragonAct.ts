import { CFG } from '../sim/config'
import type { DragonMode } from '../sim/types'

/**
 * What the dragon is acting out, as 0..1 dials the rig turns into bone angles:
 * asleep it lies in the gold with its eyes shut; stirring, it lifts its head and peeks with
 * one eye; waking, it stands and roars; hunting, it lunges and breathes fire; settling, it
 * yawns and lies back down.
 */
export interface DragonAct {
  /** 0 lying in the gold .. 1 standing. */
  readonly stand: number
  /** Head lifted and looking round. */
  readonly alert: number
  /** Eyelids, 0 open .. 1 shut. */
  readonly lidL: number
  readonly lidR: number
  /** 0 mouth shut .. 1 wide open. */
  readonly jaw: number
  /** Head and neck thrust forward to breathe fire. */
  readonly lunge: number
  /** Reared up for the roar. */
  readonly rear: number
}

export interface ActInput {
  readonly mode: DragonMode
  readonly t: number
  readonly fire: boolean
}

export const RESTING: DragonAct = { stand: 0, alert: 0, lidL: 1, lidR: 1, jaw: 0, lunge: 0, rear: 0 }

/** A 0 → 1 → 0 bump across [a, b]. */
function bell(x: number, a: number, b: number): number {
  if (x <= a || x >= b) return 0
  return Math.sin(((x - a) / (b - a)) * Math.PI)
}

function approach(from: number, to: number, rateUp: number, rateDown: number, dt: number): number {
  const rate = to > from ? rateUp : rateDown
  const v = from + (to - from) * (1 - Math.exp(-dt * rate))
  return Math.min(1, Math.max(0, v))
}

function targets(v: ActInput, time: number): DragonAct {
  // A quick blink every few seconds while the eyes are open.
  const blink = (time % 3.4) < 0.14 ? 1 : 0
  switch (v.mode) {
    case 'sleep':
      return RESTING
    case 'stir':
      // One eye cracks open, the other stays shut.
      return { stand: 0, alert: 0.5, lidL: 0.35 + blink * 0.6, lidR: 1, jaw: 0, lunge: 0, rear: 0 }
    case 'wake': {
      const roar = bell(v.t, 0.15, CFG.wakeTime)
      return { stand: 1, alert: 1, lidL: 0, lidR: 0, jaw: roar, lunge: 0, rear: roar }
    }
    case 'hunt': {
      // Before the fire: a deep breath in, head back. Then the lunge.
      const inhale = v.fire ? 0 : bell(v.t, 0, CFG.fireDelay + 0.1)
      return { stand: 1, alert: 1, lidL: blink, lidR: blink, jaw: v.fire ? 0.85 : 0.05, lunge: v.fire ? 1 : 0, rear: inhale * 0.6 }
    }
    case 'settle': {
      const k = v.t / CFG.settleTime
      const yawn = bell(k, 0.1, 0.65)
      const lid = k > 0.55 ? 1 : 0.4
      return { stand: 0, alert: 0, lidL: lid, lidR: lid, jaw: yawn * 0.9, lunge: 0, rear: yawn * 0.4 }
    }
  }
}

/** One render step: every dial eases toward what the current mode wants. */
export function stepAct(a: DragonAct, v: ActInput, dt: number, time: number): DragonAct {
  const g = targets(v, time)
  return {
    stand: approach(a.stand, g.stand, 4.5, 1.6, dt),
    alert: approach(a.alert, g.alert, 4, 2, dt),
    lidL: approach(a.lidL, g.lidL, 22, 14, dt),
    lidR: approach(a.lidR, g.lidR, 22, 14, dt),
    jaw: approach(a.jaw, g.jaw, 14, 7, dt),
    lunge: approach(a.lunge, g.lunge, 10, 4, dt),
    rear: approach(a.rear, g.rear, 9, 5, dt),
  }
}
