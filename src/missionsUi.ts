import { T } from './i18n'
import { type Mission, type MissionKind, missionReward, missionsFrom, type Missions, stepMissions } from './meta/missions'
import type { GameEvent } from './sim/types'

const KEY = 'ue.missions'
const ICON: Record<MissionKind, string> = { deliver: '🥚', rare: '💎', streak: '🤫', steal: '🦝', rainbow: '🌈', merge: '✨', coins: '🪙' }
const XP_PER_MISSION = 25

function load(): Missions {
  try {
    const raw = window.localStorage.getItem(KEY)
    return missionsFrom(raw === null ? null : JSON.parse(raw), Date.now() >>> 0)
  } catch {
    return missionsFrom(null, Date.now() >>> 0)
  }
}

function save(m: Missions): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    // Storage unavailable: missions just start over next time.
  }
}

export interface MissionsUi {
  /** Feeds one frame's simulation events; finished missions pay out through `pay`. */
  readonly events: (events: readonly GameEvent[]) => void
}

interface Deps {
  readonly pay: (coins: number, xp: number) => void
  readonly celebrate: (text: string) => void
}

/** The mission card under the level bar: three goals with progress, always visible. */
export function createMissionsUi(parent: HTMLElement, deps: Deps): MissionsUi {
  let missions = load()
  const box = document.createElement('div')
  box.className = 'missions'
  parent.appendChild(box)

  function row(m: Mission): string {
    const pct = Math.round((m.done / m.goal) * 100)
    return `<div class="mrow"><b>${ICON[m.kind]}</b><span>${T.missions.text(m)}</span><em>${m.done}/${m.goal}</em><i style="width:${pct}%"></i></div>`
  }

  function draw(): void {
    box.innerHTML = `<div class="mhead">${T.missions.title}</div>${missions.list.map(row).join('')}`
  }
  draw()

  return {
    events: (events) => {
      if (events.length === 0) return
      const before = missions
      const r = stepMissions(missions, events)
      if (r.missions === before) return
      r.finished.forEach((m, k) => {
        const coins = missionReward(m, before.completed + k)
        deps.pay(coins, XP_PER_MISSION)
        deps.celebrate(T.missions.done(coins))
      })
      missions = r.missions
      save(missions)
      draw()
      if (r.finished.length > 0) {
        box.classList.remove('flash')
        void box.offsetWidth
        box.classList.add('flash')
      }
    },
  }
}
