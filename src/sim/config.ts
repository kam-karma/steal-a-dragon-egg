import type { Rarity } from './types'

/** All tuning numbers in one place. Distances in metres, times in seconds. */
export const CFG = {
  arenaRadius: 27,
  dragonRadius: 4.3,
  hoardRadius: 13,
  nestRadius: 2.2,
  nestDistance: 23,

  walkSpeed: 6.2,
  carrySpeed: 4.4,
  actorRadius: 0.55,
  pickupRange: 1.25,

  /** Noise added per metre walked on gold (0..100 meter). */
  noisePerMetre: 5.5,
  carryNoiseFactor: 1.35,
  rainbowNoiseFactor: 2,
  bootsNoiseFactor: 0.5,
  noiseDecay: 9,
  stirAt: 55,
  calmBelow: 40,

  wakeTime: 1.3,
  huntTime: 6,
  settleTime: 2.2,
  fireDelay: 0.5,
  fireRange: 16,
  fireHalfAngle: 0.33,
  headTurnSpeed: 1.9,
  stunTime: 1.6,
  burnPush: 3.5,

  hatchTime: 2.5,
  insuranceHatchTime: 120,
  coinEvery: 2,
  regrowTime: 5,
  bots: 7,
  /** While the owner stands this close to their nest, nobody can steal from it. */
  guardRadius: 4.5,
  tagRange: 1.5,
  tagStun: 1.3,
  /** Seconds before the same nest can be robbed again. */
  stealGap: 20,
  /** Seconds between raid plans for one bot. */
  raidCooldown: 45,
  chaseRange: 15,
  /** A raiding bot lurks outside a guarded nest at most this long. */
  raidPatience: 18,
  /** Bots are a bit sneakier than kids, so the player is usually the one who wakes it. */
  botNoiseFactor: 0.65,
  /** Bots make no noise for this long after the game opens: the first egg run is calm. */
  botQuietTime: 40,
  botSpeed: 0.82,
  grudgeTime: 90,

  // Growth and income
  teenAge: 300,
  adultAge: 900,
  shinyOdds: 1 / 80,
  luckyShinyOdds: 1 / 25,
  rainbowShinyOdds: 1 / 5,
  shinyMultiplier: 3,
  multiplierCap: 12,
  rebirthBonus: 1.3,
  /** First rebirth; later ones cost more (progression.ts rebirthCost). */
  rebirthCost: 1_000_000,
  mergeCount: 3,
  /** Invisibility cloak you get with every crown. */
  cloakTime: 60,

  // Items and rewards
  panNoise: 40,
  panCooldown: 20,
  panEvery: 45,
  /** The first pan shows up once the kid knows the basics (about two egg runs in). */
  firstPanAt: 100,
  bootsTime: 180,
  bootsCost: 500,
  totemTime: 60,
  totemCost: 1_500,
  luckTime: 300,
  gold2xTime: 600,
  gold2xMax: 1_800,
  lullabyTime: 8,

  // Happenings: the first of each comes early so the opening minutes have surprises
  firstRainbowAt: 75,
  firstSneezeAt: 150,
  rainbowEvery: 240,
  rainbowWarn: 10,
  sneezeMin: 300,
  sneezeMax: 420,
  sneezeWarn: 2,
  sneezeCoins: 20,
  sneezeCoinValue: 30,
  coinTtl: 12,
  /** From player level 3 the dragon peeks: warn, then a few seconds where any step is loud. */
  peekLevel: 3,
  peekEvery: 65,
  peekWarn: 2,
  peekTime: 3,
  /** While it peeks, walking anywhere is this many times as loud as walking on gold. */
  peekNoiseFactor: 2,
  /** From player level 6 some regrown eggs are golden: delivering one pays this many seconds of the egg's income. */
  goldenLevel: 6,
  goldenOdds: 0.12,
  goldenSeconds: 240,
  /** Level 4: egg rain, quiet eggs on the stone ring for a short while. */
  rainLevel: 4,
  rainEvery: 150,
  rainWarn: 3,
  rainCount: 8,
  rainTtl: 20,
  /** Level 8: a heavy, noisy treasure chest on the hoard; home it for gold and a free reward. */
  chestLevel: 8,
  chestEvery: 200,
  chestTtl: 50,
  chestSeconds: 300,
  chestSpeedFactor: 0.7,
  chestNoiseFactor: 2.2,
  /** Bots leave a new chest alone this long, so the player gets the first go. */
  chestBotDelay: 15,
  /** Level 11: the rainbow egg comes twice as often. */
  showerLevel: 11,
  sneezeRadius: 7,
  sneezePush: 3,

  // XP
  xpDeliverBase: 10,
  xpDeliverPerRarity: 5,
  xpSteal: 25,
  xpRecover: 20,
  xpRevengeFactor: 3,
} as const

/** Coins per second of one baby. */
export const INCOME: Record<Rarity, number> = { 0: 1, 1: 3, 2: 8, 3: 20, 4: 60 }

export const RARITY_NAME: Record<Rarity, string> = {
  0: 'Yaygın',
  1: 'Nadir',
  2: 'Epik',
  3: 'Efsanevi',
  4: 'İlahi',
}
