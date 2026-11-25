/** Characters and colours the player can wear. Gold or rewarded ads unlock them. */

export type CharacterId = 'pati' | 'tilki' | 'jessie'

export interface CatalogItem {
  readonly id: string
  readonly name: string
  readonly gold: number
  /** Rewarded ads needed to unlock instead of gold (0 = free). */
  readonly ads: number
}

export interface CharacterItem extends CatalogItem {
  readonly id: CharacterId
  readonly emoji: string
}

export interface ColorItem extends CatalogItem {
  /** Tint colour; null = the model's own colours. */
  readonly hex: number | null
}

export const CHARACTERS: readonly CharacterItem[] = [
  { id: 'pati', name: 'Pati', emoji: '🐱', gold: 0, ads: 0 },
  { id: 'tilki', name: 'Tilki Hırsız', emoji: '🦊', gold: 300_000, ads: 3 },
  { id: 'jessie', name: 'Rakun Hırsız', emoji: '🦝', gold: 600_000, ads: 5 },
]

export const COLORS: readonly ColorItem[] = [
  { id: 'orijinal', name: 'Orijinal', hex: null, gold: 0, ads: 0 },
  { id: 'gece', name: 'Gece Mavisi', hex: 0x3d6bff, gold: 15_000, ads: 1 },
  { id: 'nane', name: 'Nane', hex: 0x3ddc9a, gold: 15_000, ads: 1 },
  { id: 'cilek', name: 'Çilek', hex: 0xff4f7a, gold: 25_000, ads: 1 },
  { id: 'gunes', name: 'Güneş', hex: 0xffc23d, gold: 40_000, ads: 2 },
  { id: 'golge', name: 'Gölge', hex: 0x3a3450, gold: 80_000, ads: 2 },
  { id: 'altin', name: 'Altın', hex: 0xffd700, gold: 150_000, ads: 3 },
]

export interface Wardrobe {
  readonly owned: readonly string[]
  readonly wearing: { readonly character: CharacterId; readonly color: string }
  readonly adProgress: Readonly<Record<string, number>>
}

export const NEW_WARDROBE: Wardrobe = { owned: ['pati', 'orijinal'], wearing: { character: 'pati', color: 'orijinal' }, adProgress: {} }

const ALL: readonly CatalogItem[] = [...CHARACTERS, ...COLORS]
const item = (id: string): CatalogItem | undefined => ALL.find((i) => i.id === id)

export function isOwned(w: Wardrobe, id: string): boolean {
  return w.owned.includes(id)
}

function unlock(w: Wardrobe, id: string): Wardrobe {
  return isOwned(w, id) ? w : { ...w, owned: [...w.owned, id] }
}

/** Returns the new wardrobe and the gold to spend, or null if it cannot be bought. */
export function buyWithGold(w: Wardrobe, id: string, coins: number): { wardrobe: Wardrobe; price: number } | null {
  const it = item(id)
  if (it === undefined || isOwned(w, id) || coins < it.gold) return null
  return { wardrobe: unlock(w, id), price: it.gold }
}

/** One rewarded ad watched for this item; unlocks it once enough are watched. */
export function watchedAd(w: Wardrobe, id: string): Wardrobe {
  const it = item(id)
  if (it === undefined || isOwned(w, id) || it.ads <= 0) return w
  const seen = (w.adProgress[id] ?? 0) + 1
  const next = { ...w, adProgress: { ...w.adProgress, [id]: seen } }
  return seen >= it.ads ? unlock(next, id) : next
}

export function select(w: Wardrobe, character: CharacterId, color: string): Wardrobe {
  if (!isOwned(w, character) || !isOwned(w, color)) return w
  return { ...w, wearing: { character, color } }
}

export function colorHex(id: string): number | null {
  return COLORS.find((c) => c.id === id)?.hex ?? null
}

/** Validates what storage gave us; anything odd falls back to a fresh wardrobe. */
export function fromStored(raw: unknown): Wardrobe {
  if (typeof raw !== 'object' || raw === null) return NEW_WARDROBE
  const r = raw as Record<string, unknown>
  const owned = Array.isArray(r.owned) ? r.owned.filter((x): x is string => typeof x === 'string' && item(x) !== undefined) : []
  const ownedAll = [...new Set([...NEW_WARDROBE.owned, ...owned])]
  const progress: Record<string, number> = {}
  if (typeof r.adProgress === 'object' && r.adProgress !== null) {
    for (const [k, v] of Object.entries(r.adProgress as Record<string, unknown>)) {
      if (item(k) !== undefined && typeof v === 'number' && Number.isFinite(v)) progress[k] = Math.max(0, Math.min(99, Math.floor(v)))
    }
  }
  const wardrobe: Wardrobe = { owned: ownedAll, wearing: NEW_WARDROBE.wearing, adProgress: progress }
  const wear = r.wearing as Record<string, unknown> | undefined
  const character = CHARACTERS.find((c) => c.id === wear?.character)?.id
  const color = typeof wear?.color === 'string' ? wear.color : ''
  return character === undefined ? wardrobe : select(wardrobe, character, color)
}
