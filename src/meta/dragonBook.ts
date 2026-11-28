import { PLAYER_ID } from '../sim/ids'
import type { GameEvent } from '../sim/types'

/**
 * The Dragon Book: one page for every kind of baby the player hatches (each rarity, normal and
 * shiny) and for the special finds. A first find pays out; filling the whole book gives a crown.
 */
export type BookEntry = string

const BABIES = [0, 1, 2, 3, 4].flatMap((r) => [`baby${r}`, `baby${r}s`])
export const BOOK_ENTRIES: readonly BookEntry[] = [...BABIES, 'adult', 'golden', 'rainbow', 'chest']

export interface DragonBook {
  readonly found: readonly BookEntry[]
}

export const NEW_BOOK: DragonBook = { found: [] }

function entriesOf(e: GameEvent): BookEntry[] {
  switch (e.type) {
    case 'hatch':
      return e.nest === PLAYER_ID ? [`baby${e.rarity}${e.shiny ? 's' : ''}`] : []
    case 'grow':
      return e.nest === PLAYER_ID && e.stage === 2 ? ['adult'] : []
    case 'deliver':
      if (e.actor !== PLAYER_ID) return []
      return [...(e.rainbow ? ['rainbow'] : []), ...(e.golden === true ? ['golden'] : [])]
    case 'chest':
      return e.actor === PLAYER_ID ? ['chest'] : []
    default:
      return []
  }
}

/** Gold for a first find: rarer babies pay much more, shiny ones triple. */
export function entryReward(entry: BookEntry): number {
  const m = /^baby(\d)(s?)$/.exec(entry)
  if (m === null) return 2_500
  const rarity = Number(m[1])
  return 200 * 3 ** rarity * (m[2] === 's' ? 3 : 1)
}

export interface Discovery {
  readonly book: DragonBook
  /** Entries found for the first time by these events. */
  readonly found: readonly BookEntry[]
  /** True when these finds filled the last page. */
  readonly completed: boolean
}

export function discover(book: DragonBook, events: readonly GameEvent[]): Discovery {
  const have = new Set(book.found)
  const found: BookEntry[] = []
  for (const e of events) {
    for (const entry of entriesOf(e)) {
      if (have.has(entry)) continue
      have.add(entry)
      found.push(entry)
    }
  }
  if (found.length === 0) return { book, found, completed: false }
  const next = { found: BOOK_ENTRIES.filter((x) => have.has(x)) }
  return { book: next, found, completed: next.found.length === BOOK_ENTRIES.length }
}

export function bookFrom(raw: unknown): DragonBook {
  const r = raw as { found?: unknown } | null
  if (r === null || typeof r !== 'object' || !Array.isArray(r.found)) return NEW_BOOK
  return { found: BOOK_ENTRIES.filter((x) => (r.found as unknown[]).includes(x)) }
}
