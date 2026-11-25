import { CFG } from './config'
import { PLAYER_ID } from './ids'
import type { CapacityLevel, GameState, Rarity } from './types'

export interface SavedBaby {
  readonly rarity: Rarity
  readonly shiny: boolean
  readonly age: number
}

export interface SavedHatching {
  readonly rarity: Rarity
  readonly left: number
  readonly insurance: boolean
}

export interface SaveV1 {
  readonly saveVersion: 1
  readonly coins: number
  readonly xp: number
  readonly rebirths: number
  readonly capacityLevel: CapacityLevel
  readonly babies: readonly SavedBaby[]
  readonly hatching: readonly SavedHatching[]
  readonly items: { readonly pans: number; readonly bootsLeft: number; readonly luckLeft: number }
  readonly lastSeen: number
}

/** The player's progress only; bots start fresh every session. */
export function toSave(state: GameState, now: number): SaveV1 {
  const me = state.actors[PLAYER_ID]
  const nest = state.nests[PLAYER_ID]
  return {
    saveVersion: 1,
    coins: me.coins,
    xp: me.xp,
    rebirths: me.rebirths,
    capacityLevel: nest.capacityLevel,
    babies: nest.babies.map((b) => ({ rarity: b.rarity, shiny: b.shiny, age: b.age })),
    hatching: [
      ...nest.hatching.map((h) => ({ rarity: h.rarity, left: h.left, insurance: h.insurance })),
      // A baby a thief is carrying off right now comes back as an insurance egg after reload.
      ...state.actors.flatMap((a) => (a.stolen?.from === PLAYER_ID ? [{ rarity: a.stolen.rarity, left: CFG.insuranceHatchTime, insurance: true }] : [])),
    ],
    items: { pans: me.items.pans, bootsLeft: me.items.bootsLeft, luckLeft: me.items.luckLeft },
    lastSeen: now,
  }
}

const MAX_SAVED_BABIES = 64

const num = (v: unknown, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo)
const rarity = (v: unknown): Rarity => Math.round(num(v, 0, 4)) as Rarity
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Validates anything read from storage. Wrong shape or version → null (start a new game). */
export function fromSave(raw: unknown): SaveV1 | null {
  if (!isRecord(raw) || raw.saveVersion !== 1) return null
  if (!Array.isArray(raw.babies) || !Array.isArray(raw.hatching) || !isRecord(raw.items)) return null
  const capacityLevel = Math.round(num(raw.capacityLevel, 0, 2)) as CapacityLevel
  const babies = raw.babies
    .filter(isRecord)
    // No capacity trim: insurance eggs, claims and returns may legally overfill a nest.
    .slice(0, MAX_SAVED_BABIES)
    .map((b) => ({ rarity: rarity(b.rarity), shiny: Boolean(b.shiny), age: num(b.age, 0, 1e7) }))
  const hatching = raw.hatching
    .filter(isRecord)
    .slice(0, MAX_SAVED_BABIES)
    .map((h) => ({ rarity: rarity(h.rarity), left: num(h.left, 0, CFG.insuranceHatchTime), insurance: Boolean(h.insurance) }))
  return {
    saveVersion: 1,
    coins: num(raw.coins, 0, 1e12),
    xp: num(raw.xp, 0, 1e9),
    rebirths: Math.round(num(raw.rebirths, 0, 100)),
    capacityLevel,
    babies,
    hatching,
    items: { pans: Math.round(num(raw.items.pans, 0, 1)), bootsLeft: num(raw.items.bootsLeft, 0, 3600), luckLeft: num(raw.items.luckLeft, 0, 3600) },
    lastSeen: num(raw.lastSeen, 0, 1e15),
  }
}

/** Puts a validated save into a fresh game. Loaded babies get new ids. */
export function applySave(state: GameState, save: SaveV1): GameState {
  let nextId = state.nextId
  const babies = save.babies.map((b) => ({ ...b, id: nextId++, nextCoin: CFG.coinEvery }))
  const hatching = save.hatching.map((h) => ({ ...h, rainbow: false }))
  return {
    ...state,
    nextId,
    actors: state.actors.map((a) =>
      a.id === PLAYER_ID
        ? { ...a, coins: save.coins, xp: save.xp, rebirths: save.rebirths, items: { ...a.items, ...save.items } }
        : a,
    ),
    nests: state.nests.map((n, i) => (i === PLAYER_ID ? { ...n, capacityLevel: save.capacityLevel, babies, hatching } : n)),
  }
}
