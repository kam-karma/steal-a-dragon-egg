import { describe, expect, it } from 'vitest'
import { CFG } from '../sim/config'
import { PLAYER_ID } from '../sim/ids'
import type { GameEvent } from '../sim/types'
import { FIRST_MISSIONS, missionReward, missionsFrom, newMissions, stepMissions, type Mission } from './missions'

const deliver = (rarity: 0 | 1 | 2 | 3 = 0, actor = PLAYER_ID, rainbow = false): GameEvent => ({ type: 'deliver', actor, rarity, rainbow })

describe('missions', () => {
  it('starts with three easy goals that teach the egg run', () => {
    const m = newMissions(1)
    expect(m.list).toHaveLength(3)
    expect(m.list.map((x) => x.kind)).toEqual(FIRST_MISSIONS.map((x) => x.kind))
  })

  it('counts only the player’s own deliveries', () => {
    const m = newMissions(1)
    const r = stepMissions(m, [deliver(0, 3), deliver(0)])
    expect(r.missions.list[0].done).toBe(1)
  })

  it('finishes a mission, pays it out once and replaces it with a different kind', () => {
    let m = newMissions(1)
    const goal = m.list[0].goal
    let finished: Mission[] = []
    for (let k = 0; k < goal; k++) {
      const r = stepMissions(m, [deliver(0)])
      m = r.missions
      finished = [...finished, ...r.finished]
    }
    expect(finished).toHaveLength(1)
    expect(m.completed).toBe(1)
    expect(m.list).toHaveLength(3)
    const kinds = m.list.map((x) => x.kind)
    expect(new Set(kinds).size).toBe(3)
  })

  it('a rare delivery only counts when the egg is rare enough', () => {
    const m: Mission = { kind: 'rare', goal: 1, done: 0, min: 2 }
    const state = { list: [m], seed: 1, completed: 0 }
    expect(stepMissions(state, [deliver(1)]).finished).toHaveLength(0)
    expect(stepMissions(state, [deliver(2)]).finished).toHaveLength(1)
  })

  it('a quiet-run mission counts quiet deliveries made after it appeared and resets when the dragon wakes', () => {
    const m: Mission = { kind: 'streak', goal: 3, done: 0, min: 0 }
    const quiet: GameEvent = { type: 'streak', actor: PLAYER_ID, streak: 6 }
    let s = stepMissions({ list: [m], seed: 1, completed: 0 }, [quiet]).missions
    expect(s.list[0].done).toBe(1)
    s = stepMissions(s, [quiet, { type: 'wake', culprit: PLAYER_ID }]).missions
    expect(s.list[0].done).toBe(0)
  })

  it('a sneeze-coin mission counts every coin, even several picked up at once', () => {
    const m: Mission = { kind: 'coins', goal: 5, done: 0, min: 0 }
    const r = stepMissions({ list: [m], seed: 1, completed: 0 }, [{ type: 'coinPickup', actor: PLAYER_ID, value: CFG.sneezeCoinValue * 3 }])
    expect(r.missions.list[0].done).toBe(3)
  })

  it('counts a stolen baby only when the player brings it home', () => {
    const m: Mission = { kind: 'steal', goal: 1, done: 0, min: 0 }
    const s = { list: [m], seed: 1, completed: 0 }
    expect(stepMissions(s, [{ type: 'steal', actor: PLAYER_ID, from: 2, rarity: 0 }]).finished).toHaveLength(0)
    expect(stepMissions(s, [{ type: 'claim', actor: PLAYER_ID, from: 2, rarity: 0 }]).finished).toHaveLength(1)
  })

  it('pays more for harder missions and more as the player completes more', () => {
    const easy: Mission = { kind: 'deliver', goal: 2, done: 2, min: 0 }
    const hard: Mission = { kind: 'deliver', goal: 6, done: 6, min: 0 }
    expect(missionReward(hard, 0)).toBeGreaterThan(missionReward(easy, 0))
    expect(missionReward(easy, 10)).toBeGreaterThan(missionReward(easy, 0))
  })

  it('rolls the same missions for the same seed', () => {
    const run = () => {
      let m = newMissions(7)
      for (let k = 0; k < 20; k++) m = stepMissions(m, [deliver(3), { type: 'streak', actor: PLAYER_ID, streak: 9 }]).missions
      return m
    }
    expect(run()).toEqual(run())
  })
})

describe('missionsFrom', () => {
  it('keeps a stored set and replaces anything malformed with a fresh one', () => {
    const stored = { list: FIRST_MISSIONS, seed: 5, completed: 4 }
    expect(missionsFrom(JSON.parse(JSON.stringify(stored)), 1)).toEqual(stored)
    expect(missionsFrom({ list: [{ kind: 'fly' }] }, 1)).toEqual(newMissions(1))
    expect(missionsFrom(null, 1)).toEqual(newMissions(1))
  })
})
