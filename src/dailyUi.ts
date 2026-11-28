import { T } from './i18n'
import { canClaim, claim, DAILY_REWARDS, type Daily, dailyFrom, type DailyReward, nextDay } from './meta/daily'

const KEY = 'ue.daily'
/** Today's date on the player's own clock (the gift turns over at their midnight). */
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function load(): Daily {
  try {
    const raw = window.localStorage.getItem(KEY)
    return dailyFrom(raw === null ? null : JSON.parse(raw))
  } catch {
    return dailyFrom(null)
  }
}

function label(r: DailyReward): string {
  if (r.coins !== undefined) return T.daily.coins(r.coins)
  if (r.drops !== undefined) return T.daily.drops(r.drops)
  if (r.crowns !== undefined) return T.daily.crowns(r.crowns)
  return r.grant !== undefined ? `🎁 ${T.reward[r.grant]}` : ''
}

interface Deps {
  /** Pays one day's gift into the game. */
  readonly give: (r: DailyReward) => void
}

/**
 * The daily gift calendar: shown once when the game starts, if today's gift is waiting.
 * Seven days in a row end with a crown; a missed day starts the week over.
 */
export function showDailyGift(root: HTMLElement, d: Deps): void {
  const state = load()
  const now = today()
  if (!canClaim(state, now)) return
  const day = nextDay(state, now)
  const box = document.createElement('div')
  box.className = 'gifts open daily'
  const cells = DAILY_REWARDS.map(
    (r, i) => `<div class="wcard${i + 1 === day ? ' on' : i + 1 < day ? ' done' : ''}"><div class="oleft">${T.daily.day(i + 1)}</div><div class="otitle">${label(r)}</div></div>`,
  ).join('')
  box.innerHTML = `<div class="whead"><span class="bookic">🎁</span><b>${T.daily.title}</b></div><div class="wgrid dailygrid">${cells}</div>`
  const take = document.createElement('button')
  take.className = 'pbtn gold dailyclaim'
  take.textContent = `${T.daily.claim} ${label(DAILY_REWARDS[day - 1])}`
  take.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    try {
      window.localStorage.setItem(KEY, JSON.stringify(claim(state, now)))
    } catch {
      // Storage blocked: the gift is still given.
    }
    d.give(DAILY_REWARDS[day - 1])
    box.remove()
  })
  box.appendChild(take)
  box.insertAdjacentHTML('beforeend', `<div class="odesc">${T.daily.later}</div>`)
  root.appendChild(box)
}
