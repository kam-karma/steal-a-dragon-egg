import { CFG } from './config'
import { PLAYER_ID } from './ids'
import { dropsPerCrown, MAX_LEVEL, type Perk, PERK_MAX, STORE_ITEMS, type StoreItem } from './progression'
import type { CapacityLevel, GameState, Perks, Rarity } from './types'

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
  // Added later; older saves get the defaults.
  readonly nursery: number
  readonly vault: number
  readonly perkSlots: number
  readonly crowns: number
  readonly perks: Perks
  readonly drops: number
  readonly bought: Readonly<Partial<Record<StoreItem, number>>>
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
    nursery: nest.nursery,
    vault: nest.vault,
    perkSlots: nest.perkSlots,
    crowns: me.crowns,
    perks: me.perks,
    drops: me.drops,
    bought: me.bought,
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
  const capacityLevel = Math.round(num(raw.capacityLevel, 0, MAX_LEVEL.size)) as CapacityLevel
  const perksRaw = isRecord(raw.perks) ? raw.perks : {}
  const perks = Object.fromEntries((Object.keys(PERK_MAX) as Perk[]).map((k) => [k, Math.round(num(perksRaw[k], 0, PERK_MAX[k]))])) as Record<Perk, number>
  const boughtRaw = isRecord(raw.bought) ? raw.bought : {}
  const bought = Object.fromEntries(STORE_ITEMS.flatMap((k) => (typeof boughtRaw[k] === 'number' ? [[k, Math.round(num(boughtRaw[k], 0, 50))]] : [])))
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
    nursery: Math.round(num(raw.nursery, 0, MAX_LEVEL.nursery)),
    vault: Math.round(num(raw.vault, 0, MAX_LEVEL.vault)),
    perkSlots: 2 * perks.nest,
    // Saves from before crowns existed: every past rebirth was a crown.
    crowns: raw.crowns === undefined ? Math.round(num(raw.rebirths, 0, 100)) : Math.round(num(raw.crowns, 0, 1000)),
    perks,
    drops: raw.drops === undefined ? dropsPerCrown(perks.drop) : Math.round(num(raw.drops, 0, 99)),
    bought,
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
        ? {
            ...a,
            coins: save.coins,
            xp: save.xp,
            rebirths: save.rebirths,
            crowns: save.crowns,
            perks: save.perks,
            drops: save.drops,
            bought: save.bought,
            items: { ...a.items, ...save.items },
          }
        : a,
    ),
    nests: state.nests.map((n, i) =>
      i === PLAYER_ID
        ? { ...n, capacityLevel: save.capacityLevel, nursery: save.nursery, vault: save.vault, perkSlots: save.perkSlots, babies, hatching }
        : n,
    ),
  }
}
