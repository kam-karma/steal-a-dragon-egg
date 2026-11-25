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
  guardRadius: 5.5,
  tagRange: 1.5,
  tagStun: 1.3,
  /** Seconds before the same nest can be robbed again. */
  stealGap: 60,
  /** Seconds between raid plans for one bot. */
  raidCooldown: 45,
  chaseRange: 15,
  /** A raiding bot lurks outside a guarded nest at most this long. */
  raidPatience: 18,
  /** Bots are a bit sneakier than kids, so the player is usually the one who wakes it. */
  botNoiseFactor: 0.65,
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
  /** Tuned by balance/balance.sim.ts: first rebirth ≈ 28 min without ads, ≈ 22 min with ads. */
  rebirthCost: 1_000_000,
  capacity: [6, 10, 16] as readonly number[],
  upgradeCost: [10_000, 80_000] as readonly number[],
  mergeCount: 3,

  // Items and rewards
  panNoise: 40,
  panCooldown: 20,
  panEvery: 45,
  /** The first pan shows up at minute 3, once the kid knows the basics. */
  firstPanAt: 180,
  bootsTime: 180,
  bootsCost: 500,
  totemTime: 60,
  totemCost: 1_500,
  luckTime: 300,
  gold2xTime: 600,
  gold2xMax: 1_800,
  lullabyTime: 8,

  // Happenings
  rainbowEvery: 240,
  rainbowWarn: 10,
  sneezeMin: 300,
  sneezeMax: 420,
  sneezeWarn: 2,
  sneezeCoins: 20,
  sneezeCoinValue: 30,
  coinTtl: 12,
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
