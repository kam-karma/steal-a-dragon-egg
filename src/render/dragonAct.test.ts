import { describe, expect, it } from 'vitest'
import { CFG } from '../sim/config'
import type { DragonMode } from '../sim/types'
import { RESTING, stepAct, type DragonAct } from './dragonAct'

const STEP = 1 / 60

/** Runs the act for `secs` in one mode, with `t` counting up like the sim's. */
function run(from: DragonAct, mode: DragonMode, secs: number, fire = false, time0 = 0): DragonAct {
  let a = from
  for (let t = 0; t < secs; t += STEP) a = stepAct(a, { mode, t, fire }, STEP, time0 + t)
  return a
}

describe('dragon act', () => {
  it('lies down with both eyes shut while asleep', () => {
    const a = run(RESTING, 'sleep', 5)
    expect(a.stand).toBeLessThan(0.05)
    expect(a.lidL).toBeGreaterThan(0.95)
    expect(a.lidR).toBeGreaterThan(0.95)
    expect(a.jaw).toBeLessThan(0.15)
  })

  it('peeks with one eye and lifts its head when stirring, but stays lying', () => {
    const a = run(run(RESTING, 'sleep', 3), 'stir', 1.5)
    expect(a.stand).toBeLessThan(0.1)
    expect(a.alert).toBeGreaterThan(0.3)
    expect(Math.min(a.lidL, a.lidR)).toBeLessThan(0.6)
    expect(Math.max(a.lidL, a.lidR)).toBeGreaterThan(0.9)
  })

  it('stands up and roars within the wake time', () => {
    const asleep = run(RESTING, 'sleep', 3)
    const mid = run(asleep, 'wake', CFG.wakeTime * 0.5)
    expect(mid.jaw).toBeGreaterThan(0.6)
    expect(mid.rear).toBeGreaterThan(0.4)
    const woke = run(asleep, 'wake', CFG.wakeTime)
    expect(woke.stand).toBeGreaterThan(0.9)
    expect(woke.lidL).toBeLessThan(0.1)
  })

  it('thrusts its head forward with the jaw open while breathing fire', () => {
    const awake = run(run(RESTING, 'sleep', 1), 'wake', CFG.wakeTime)
    const firing = run(awake, 'hunt', 1, true)
    expect(firing.lunge).toBeGreaterThan(0.9)
    expect(firing.jaw).toBeGreaterThan(0.6)
    expect(firing.stand).toBeGreaterThan(0.9)
  })

  it('lies back down and closes its eyes by the end of settling', () => {
    const awake = run(run(RESTING, 'sleep', 1), 'wake', CFG.wakeTime)
    const settled = run(awake, 'settle', CFG.settleTime)
    expect(settled.stand).toBeLessThan(0.2)
    expect(settled.lidL).toBeGreaterThan(0.8)
    expect(settled.lunge).toBeLessThan(0.1)
  })

  it('blinks now and then while awake', () => {
    const awake = run(run(RESTING, 'sleep', 1), 'wake', CFG.wakeTime)
    let a = awake
    let shut = 0
    for (let t = 0; t < 8; t += STEP) {
      a = stepAct(a, { mode: 'hunt', t, fire: false }, STEP, 10 + t)
      if (a.lidL > 0.7) shut++
    }
    expect(shut).toBeGreaterThan(0)
    expect(shut * STEP).toBeLessThan(1.5)
  })

  it('never leaves the 0..1 range', () => {
    let a = RESTING
    const modes: DragonMode[] = ['sleep', 'stir', 'wake', 'hunt', 'settle', 'sleep']
    for (const m of modes) {
      for (let t = 0; t < 3; t += STEP) {
        a = stepAct(a, { mode: m, t, fire: m === 'hunt' && t > 0.5 }, STEP, t)
        for (const v of Object.values(a)) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})
