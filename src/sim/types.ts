import type { NestTrack, Perk, StoreItem } from './progression'

/** Permanent crown-shop levels. */
export type Perks = Readonly<Record<Perk, number>>

export interface Vec {
  readonly x: number
  readonly z: number
}

/** 0 common, 1 rare, 2 epic, 3 legendary, 4 divine (merge or rainbow egg only). */
export type Rarity = 0 | 1 | 2 | 3 | 4

export interface Circle {
  readonly x: number
  readonly z: number
  readonly r: number
}

export interface EggSpot {
  readonly pos: Vec
  readonly rarity: Rarity
}

export interface Layout {
  /** Coin heaps: walking on them makes noise. */
  readonly gold: readonly Circle[]
  /** Rocks: block movement and dragon fire. */
  readonly pillars: readonly Circle[]
  readonly nests: readonly Vec[]
  readonly spots: readonly EggSpot[]
}

export interface Egg {
  readonly id: number
  /** Index into layout.spots, or -1 for the rainbow egg (lives at happenings.rainbowPos). */
  readonly spot: number
  readonly rarity: Rarity
  readonly rainbow: boolean
  /** Golden egg (from player level 6): pays a pile of gold on delivery. */
  readonly golden?: boolean
  /** Free eggs (rain, chest) lie at their own spot (spot = -2) and vanish at `expires` (state.time). */
  readonly pos?: Vec
  readonly expires?: number
  readonly rain?: boolean
  /** Treasure chest: heavy and noisy; delivered it pays gold and a free reward. */
  readonly chest?: boolean
}

export interface Baby {
  readonly id: number
  readonly rarity: Rarity
  readonly shiny: boolean
  /** Seconds of active play since hatching (drives baby → teen → adult). */
  readonly age: number
  /** Seconds until the next coin pop. */
  readonly nextCoin: number
}

export interface Hatching {
  readonly rarity: Rarity
  readonly left: number
  readonly rainbow: boolean
  /** Replacement egg after a theft; ignores nest capacity. */
  readonly insurance: boolean
}

/** Nest size level, 0..5 (see progression.ts). */
export type CapacityLevel = number

export interface Nest {
  readonly owner: number
  readonly hatching: readonly Hatching[]
  readonly babies: readonly Baby[]
  readonly capacityLevel: CapacityLevel
  /** Nursery level: babies grow up faster. */
  readonly nursery: number
  /** Vault level: +20% gold per level. */
  readonly vault: number
  /** Extra spots from the "Bigger Nest" crown perk (kept through rebirths). */
  readonly perkSlots: number
  /** state.time of the last theft from this nest (-Infinity = never). */
  readonly lastStolenAt: number
}

export type BotGoal = 'egg' | 'home' | 'hide' | 'wait' | 'raid' | 'chase'

export type Personality = 'careful' | 'greedy' | 'troll' | 'avenger'

/** A baby carried away from someone else's nest. */
export interface StolenBaby {
  readonly rarity: Rarity
  readonly shiny: boolean
  readonly age: number
  readonly from: number
}

export interface Items {
  readonly pans: number
  readonly panCooldown: number
  readonly bootsLeft: number
  readonly totemLeft: number
  readonly luckLeft: number
  readonly gold2xLeft: number
  /** Invisibility cloak: silent steps, fireproof, cannot be caught. */
  readonly cloakLeft: number
}

/** What an actor last lost to fire or a tag, for the "Geri Al" reward. */
export interface LastDrop {
  readonly rarity: Rarity
  readonly rainbow: boolean
  /** Nest the dropped baby went back to; null when it was an egg. */
  readonly babyNest: number | null
  /** The exact egg dropped (so "Get It Back" returns that egg, chest or golden one). */
  readonly eggId?: number
}

export interface Actor {
  readonly id: number
  readonly isBot: boolean
  readonly name: string
  readonly color: number
  readonly pos: Vec
  /** Facing angle in radians (atan2(x, z)). */
  readonly facing: number
  readonly speed: number
  readonly carrying: Egg | null
  readonly stolen: StolenBaby | null
  readonly stunned: number
  readonly coins: number
  readonly nest: number
  readonly onGold: boolean
  readonly bot: BotBrain | null
  readonly items: Items
  readonly xp: number
  readonly streak: number
  readonly streakShield: boolean
  readonly rebirths: number
  /** Crowns to spend in the crown shop (one per rebirth). */
  readonly crowns: number
  readonly perks: Perks
  /** Egg drops left: put the egg on your head back, refilled with every crown. */
  readonly drops: number
  /** Store purchases since the last crown (prices rise with each). */
  readonly bought: Readonly<Partial<Record<StoreItem, number>>>
  /** The egg this actor just put back: not picked up again until they walk away from it. */
  readonly ignoreEgg: number | null
  readonly personality: Personality | null
  readonly lastDrop: LastDrop | null
}

export interface BotBrain {
  readonly goal: BotGoal
  readonly targetEgg: number | null
  readonly target: Vec | null
  /** 0 = careful (avoids gold), 1 = clumsy. */
  readonly clumsy: number
  readonly think: number
  /** Nest this bot wants to raid, and seconds until it may plan another raid. */
  readonly raidNest: number | null
  readonly raidCooldown: number
  /** Seconds spent on the current raid (gives up after a while). */
  readonly raidTime: number
  /** Seconds left of a revenge hunt on the player's nest (avenger). */
  readonly grudge: number
  /** Seconds until the next "human mistake", and how long the current one lasts. */
  readonly oopsIn: number
  readonly oopsLeft: number
  readonly oopsDir: Vec
}

export type DragonMode = 'sleep' | 'stir' | 'wake' | 'hunt' | 'settle'

export interface Dragon {
  readonly mode: DragonMode
  /** Seconds spent in the current mode. */
  readonly t: number
  /** Head direction in radians (atan2(x, z)). */
  readonly yaw: number
  readonly fire: boolean
  /** How many times it woke up (drives difficulty a little). */
  readonly wakes: number
  /** Seconds of "Ninni": the dragon cannot wake. */
  readonly lullaby: number
}

export interface Pickup {
  readonly id: number
  readonly kind: 'pan' | 'coin'
  readonly pos: Vec
  readonly value: number
  readonly ttl: number
}

export interface Happenings {
  readonly rainbowIn: number
  readonly rainbowWarned: boolean
  /** Where the rainbow egg sits (and returns to when dropped); null when none is out. */
  readonly rainbowPos: Vec | null
  readonly sneezeIn: number
  readonly sneezeWarned: boolean
  readonly panIn: number
  /** Seconds until the dragon peeks (from player level 3), and how long the current peek lasts. */
  readonly peekIn: number
  readonly peekLeft: number
  readonly rainIn: number
  readonly chestIn: number
}

export interface GameState {
  readonly time: number
  readonly noise: number
  /** Per actor: how much of the current noise they made (decays with it). */
  readonly noiseShare: readonly number[]
  readonly dragon: Dragon
  readonly actors: readonly Actor[]
  readonly eggs: readonly Egg[]
  /** Per spot: seconds until an egg grows back (0 = has egg or ready). */
  readonly regrow: readonly number[]
  readonly nests: readonly Nest[]
  readonly pickups: readonly Pickup[]
  readonly happenings: Happenings
  /** Per actor: how many babies they stole from the player's nest. */
  readonly nemesisCounts: readonly number[]
  readonly nextId: number
  readonly seed: number
}

export type Reward = 'luck' | 'recover' | 'gold2x' | 'lullaby' | 'instantHatch' | 'grow' | 'totem' | 'boots' | 'streakShield'

export type Action =
  | { readonly type: 'usePan' }
  | { readonly type: 'merge'; readonly rarity: Rarity }
  | { readonly type: 'upgrade'; readonly track: NestTrack }
  | { readonly type: 'rebirth' }
  | { readonly type: 'grant'; readonly reward: Reward }
  /** Gold purchase in the store; the price rises with each buy. Works anywhere. */
  | { readonly type: 'buyItem'; readonly item: StoreItem }
  /** Crown shop. Works anywhere. */
  | { readonly type: 'buyPerk'; readonly perk: Perk }
  /** Put the carried egg back on its spot (costs one drop). */
  | { readonly type: 'dropEgg' }
  /** Gold spent outside the simulation (wardrobe). Works anywhere. */
  | { readonly type: 'spend'; readonly amount: number }
  /** Gold and XP paid for a finished mission. Works anywhere. */
  | { readonly type: 'bonus'; readonly coins: number; readonly xp: number; readonly crowns?: number; readonly drops?: number }

export type GameEvent =
  | { readonly type: 'jingle'; readonly actor: number; readonly pos: Vec }
  | { readonly type: 'pickup'; readonly actor: number; readonly rarity: Rarity; readonly rainbow: boolean; readonly chest?: boolean }
  | { readonly type: 'deliver'; readonly actor: number; readonly rarity: Rarity; readonly rainbow: boolean; readonly golden?: boolean; readonly rain?: boolean }
  | { readonly type: 'hatch'; readonly nest: number; readonly rarity: Rarity; readonly shiny: boolean }
  | { readonly type: 'coin'; readonly nest: number; readonly amount: number; readonly baby: number }
  | { readonly type: 'burned'; readonly actor: number; readonly dropped: Rarity | null }
  | { readonly type: 'steal'; readonly actor: number; readonly from: number; readonly rarity: Rarity }
  | { readonly type: 'claim'; readonly actor: number; readonly from: number; readonly rarity: Rarity }
  | { readonly type: 'recover'; readonly owner: number; readonly thief: number; readonly rarity: Rarity }
  | { readonly type: 'stir' }
  | { readonly type: 'calm' }
  | { readonly type: 'wake'; readonly culprit: number | null }
  | { readonly type: 'fire' }
  | { readonly type: 'sleep' }
  | { readonly type: 'panSpawn'; readonly pos: Vec }
  | { readonly type: 'panPickup'; readonly actor: number }
  | { readonly type: 'pan'; readonly actor: number }
  | { readonly type: 'rainbowWarn' }
  | { readonly type: 'rainbowSpawn'; readonly pos: Vec }
  | { readonly type: 'sneezeWarn' }
  | { readonly type: 'sneeze' }
  | { readonly type: 'coinPickup'; readonly actor: number; readonly value: number }
  | { readonly type: 'shiny'; readonly nest: number; readonly baby: number }
  | { readonly type: 'grow'; readonly nest: number; readonly baby: number; readonly stage: 0 | 1 | 2 }
  | { readonly type: 'merge'; readonly nest: number; readonly rarity: Rarity }
  | { readonly type: 'rebirth'; readonly actor: number; readonly rebirths: number }
  | { readonly type: 'nestFull'; readonly actor: number; readonly canMerge: boolean }
  | { readonly type: 'insurance'; readonly nest: number; readonly rarity: Rarity }
  | { readonly type: 'revenge'; readonly actor: number; readonly victim: number }
  | { readonly type: 'levelUp'; readonly actor: number; readonly level: number }
  | { readonly type: 'streak'; readonly actor: number; readonly streak: number }
  | { readonly type: 'reward'; readonly actor: number; readonly reward: Reward }
  | { readonly type: 'eggDropped'; readonly actor: number }
  /** A gold purchase in the store (rewarded-ad grants stay 'reward'). */
  | { readonly type: 'bought'; readonly actor: number; readonly item: StoreItem }
  | { readonly type: 'rainWarn' }
  | { readonly type: 'rain' }
  | { readonly type: 'chestSpawn'; readonly pos: Vec }
  | { readonly type: 'chest'; readonly actor: number; readonly coins: number; readonly reward: Reward }
  | { readonly type: 'peekWarn' }
  | { readonly type: 'peek' }
  | { readonly type: 'peekEnd' }
  | { readonly type: 'golden'; readonly actor: number; readonly coins: number }
  | { readonly type: 'upgraded'; readonly actor: number; readonly track: NestTrack; readonly level: number }
  | { readonly type: 'perk'; readonly actor: number; readonly perk: Perk; readonly level: number }

export interface PlayerInput {
  /** Desired move direction, length 0..1, in world x/z. */
  readonly x: number
  readonly z: number
  readonly action?: Action
}
