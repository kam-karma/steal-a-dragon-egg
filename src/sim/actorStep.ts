import { botIntent } from './bots'
import { CFG, INCOME } from './config'
import { nestReach } from './progression'
import { hasTriple, mergeBabies } from './economy'
import { eggPos } from './happenings'
import { stepItems, tryPickupPan } from './items'
import { handsFree, moveActor, resolveCollisions } from './movement'
import { addEgg, canAccept } from './nests'
import { noiseFrom } from './noise'
import { giveBaby, nemesisOf, tryClaim, trySteal } from './raid'
import { angleDiff, blocked, dist, onGold } from './world'
import type { Actor, Egg, GameEvent, GameState, Layout, Nest, Pickup, PlayerInput, Vec } from './types'

export { PLAYER_ID } from './ids'
import { PLAYER_ID } from './ids'

/** What one simulation step is building up while it walks over the actors. */
export interface Frame {
  readonly eggs: readonly Egg[]
  readonly regrow: readonly number[]
  readonly nests: readonly Nest[]
  readonly nextId: number
  readonly pickups: readonly Pickup[]
  readonly nemesisCounts: readonly number[]
  readonly rainbowPos: Vec | null
  readonly events: readonly GameEvent[]
  /** Noise each actor made this step. */
  readonly added: readonly number[]
}

export interface StepContext {
  readonly state: GameState
  readonly layout: Layout
  readonly input: PlayerInput
  readonly dt: number
}

interface Out {
  readonly frame: Frame
  readonly actor: Actor
}

const emit = (f: Frame, ...e: GameEvent[]): Frame => ({ ...f, events: [...f.events, ...e] })

function inFire(state: GameState, layout: Layout, a: Actor): boolean {
  if (!state.dragon.fire || a.stunned > 0 || a.items.cloakLeft > 0) return false
  const d = Math.hypot(a.pos.x, a.pos.z)
  if (d > CFG.fireRange) return false
  const ang = Math.atan2(a.pos.x, a.pos.z)
  if (Math.abs(angleDiff(ang, state.dragon.yaw)) > CFG.fireHalfAngle + 0.5 / Math.max(d, 1)) return false
  return !blocked(layout, { x: 0, z: 0 }, a.pos)
}

function burn(ctx: StepContext, f: Frame, a: Actor): Out {
  const dropped = a.carrying
  const baby = a.stolen
  const out = Math.hypot(a.pos.x, a.pos.z) || 1
  const pos = resolveCollisions(ctx.layout, { x: a.pos.x + (a.pos.x / out) * CFG.burnPush, z: a.pos.z + (a.pos.z / out) * CFG.burnPush })
  const lastDrop =
    dropped !== null
      ? { rarity: dropped.rarity, rainbow: dropped.rainbow, babyNest: null, eggId: dropped.id }
      : baby !== null
        ? { rarity: baby.rarity, rainbow: false, babyNest: baby.from }
        : a.lastDrop
  const frame: Frame = {
    ...f,
    eggs: dropped !== null ? [...f.eggs, dropped] : f.eggs,
    nests: baby !== null ? giveBaby(f.nests, baby.from, baby, f.nextId) : f.nests,
    nextId: baby !== null ? f.nextId + 1 : f.nextId,
  }
  return {
    frame: emit(frame, { type: 'burned', actor: a.id, dropped: dropped?.rarity ?? baby?.rarity ?? null }),
    actor: { ...a, carrying: null, stolen: null, stunned: CFG.stunTime, pos, lastDrop },
  }
}

function stealOrClaim(ctx: StepContext, f: Frame, a: Actor): Out | null {
  const steal = trySteal(ctx.layout, ctx.state.actors, f.nests, a, ctx.state.time)
  if (steal.events.length > 0) {
    const from = steal.actor.stolen?.from ?? -1
    const nemesisCounts = from === PLAYER_ID ? f.nemesisCounts.map((c, i) => (i === a.id ? c + 1 : c)) : f.nemesisCounts
    const revenge = a.id === PLAYER_ID && nemesisOf(nemesisCounts) === from
    const extra: GameEvent[] = revenge ? [{ type: 'revenge', actor: a.id, victim: from }] : []
    return {
      frame: emit({ ...f, nests: steal.nests, nemesisCounts }, ...steal.events, ...extra),
      actor: { ...steal.actor, xp: a.xp + CFG.xpSteal * (revenge ? CFG.xpRevengeFactor : 1) },
    }
  }
  const claim = tryClaim(ctx.layout, f.nests, a, f.nextId)
  if (claim.events.length === 0) return null
  return { frame: emit({ ...f, nests: claim.nests, nextId: f.nextId + 1 }, ...claim.events), actor: claim.actor }
}

function pickupEgg(ctx: StepContext, f: Frame, a0: Actor): Out | null {
  if (!handsFree(a0) || a0.stunned > 0) return null
  // In reach: the rainbow egg first, otherwise the nearest one.
  const near = f.eggs.map((e) => ({ e, d: dist(eggPos(e, ctx.state, ctx.layout), a0.pos) })).filter((c) => c.d < CFG.pickupRange)
  // The egg you just put back stays put until you have walked away from it.
  const stillNear = a0.ignoreEgg !== null && near.some((c) => c.e.id === a0.ignoreEgg)
  const a = stillNear || a0.ignoreEgg === null ? a0 : { ...a0, ignoreEgg: null }
  const egg = near
    .filter((c) => c.e.id !== a.ignoreEgg)
    .sort((p, q) => Number(q.e.rainbow) - Number(p.e.rainbow) || p.d - q.d)[0]?.e
  if (egg === undefined) return a === a0 ? null : { frame: f, actor: a }
  return {
    frame: emit(
      { ...f, eggs: f.eggs.filter((e) => e.id !== egg.id) },
      { type: 'pickup', actor: a.id, rarity: egg.rarity, rainbow: egg.rainbow, ...(egg.chest === true ? { chest: true } : {}) },
    ),
    // Once in someone's hands a rain egg or chest no longer runs out: put down again, it stays.
    actor: { ...a, carrying: egg.expires === undefined ? egg : { ...egg, expires: undefined } },
  }
}

/** Bots tidy up a full nest themselves: merge if they can, else put the egg back. */
function botMakeRoom(f: Frame, a: Actor, egg: Egg): Out | null {
  const merged = ([0, 1, 2, 3] as const).map((r) => mergeBabies(f.nests[a.nest], r, f.nextId)).find((m) => m !== null)
  if (merged) {
    const nests = f.nests.map((n, i) => (i === a.nest ? merged.nest : n))
    return { frame: emit({ ...f, nests, nextId: f.nextId + 1 }, { type: 'merge', nest: a.nest, rarity: merged.made.rarity }), actor: a }
  }
  return { frame: { ...f, eggs: [...f.eggs, egg] }, actor: { ...a, carrying: null } }
}

const CHEST_REWARDS = ['luck', 'gold2x', 'boots', 'totem'] as const

/** A treasure chest brought home: a pile of gold and one free reward; no nest spot used. */
function openChest(f: Frame, a: Actor, chest: Egg): Out {
  const coins = Math.round(INCOME[3] * CFG.chestSeconds * CFG.rebirthBonus ** a.rebirths)
  const reward = CHEST_REWARDS[chest.id % CHEST_REWARDS.length]
  const it = a.items
  const items =
    reward === 'luck'
      ? { ...it, luckLeft: it.luckLeft + CFG.luckTime }
      : reward === 'gold2x'
        ? { ...it, gold2xLeft: Math.min(CFG.gold2xMax, it.gold2xLeft + CFG.gold2xTime) }
        : reward === 'boots'
          ? { ...it, bootsLeft: it.bootsLeft + CFG.bootsTime }
          : { ...it, totemLeft: it.totemLeft + CFG.totemTime }
  return {
    frame: emit(f, { type: 'chest', actor: a.id, coins, reward }),
    actor: { ...a, carrying: null, coins: a.coins + coins, items, xp: a.xp + CFG.xpDeliverBase * 4 },
  }
}

function deliver(ctx: StepContext, f0: Frame, a0: Actor, prev: Actor): Out | null {
  const egg = a0.carrying
  const reach = nestReach(f0.nests[a0.nest].capacityLevel)
  if (egg === null || dist(a0.pos, ctx.layout.nests[a0.nest]) >= reach) return null
  if (egg.chest === true) return openChest(f0, a0, egg)
  let f = f0
  let a = a0
  if (!canAccept(f.nests[a.nest]) && a.isBot) {
    const room = botMakeRoom(f, a, egg)
    if (room === null || room.actor.carrying === null) return room
    f = room.frame
    a = room.actor
  }
  if (!canAccept(f.nests[a.nest])) {
    // Full nest. If a merge would make room, keep the egg so one tap fixes it;
    // otherwise put the egg back on its spot so the child is never stuck holding it.
    if (hasTriple(f.nests[a.nest])) {
      const arrived = dist(prev.pos, ctx.layout.nests[a.nest]) >= reach
      return { frame: arrived ? emit(f, { type: 'nestFull', actor: a.id, canMerge: true }) : f, actor: a }
    }
    return { frame: emit({ ...f, eggs: [...f.eggs, egg] }, { type: 'nestFull', actor: a.id, canMerge: false }), actor: { ...a, carrying: null } }
  }
  const asleep = ctx.state.dragon.mode === 'sleep' || ctx.state.dragon.mode === 'stir'
  const streak = asleep ? a.streak + 1 : a.streak
  const frame: Frame = {
    ...f,
    nests: f.nests.map((n, i) => (i === a.nest ? addEgg(n, { rarity: egg.rarity, rainbow: egg.rainbow, insurance: false }) : n)),
    regrow: f.regrow.map((r, i) => (i === egg.spot ? CFG.regrowTime : r)),
    rainbowPos: egg.rainbow ? null : f.rainbowPos,
  }
  const events: GameEvent[] = [
    { type: 'deliver', actor: a.id, rarity: egg.rarity, rainbow: egg.rainbow, ...(egg.golden === true ? { golden: true } : {}), ...(egg.rain === true ? { rain: true } : {}) },
  ]
  if (asleep) events.push({ type: 'streak', actor: a.id, streak })
  const bonus = egg.golden === true ? Math.round(INCOME[egg.rarity] * CFG.goldenSeconds * CFG.rebirthBonus ** a.rebirths) : 0
  if (bonus > 0) events.push({ type: 'golden', actor: a.id, coins: bonus })
  return {
    frame: emit(frame, ...events),
    actor: { ...a, carrying: null, streak, coins: a.coins + bonus, xp: a.xp + CFG.xpDeliverBase + CFG.xpDeliverPerRarity * egg.rarity },
  }
}

function move(ctx: StepContext, f0: Frame, a0: Actor, roll: number): Out {
  const intent = a0.isBot ? botIntent(ctx.state, ctx.layout, a0, ctx.dt, roll) : { x: ctx.input.x, z: ctx.input.z, brain: null, usePan: false }
  const peeking = ctx.state.happenings.peekLeft > 0
  // Bots know the rule: they freeze while the dragon's eye is open.
  const pace = a0.isBot ? (peeking ? 0 : CFG.botSpeed) : 1
  const moved = moveActor(ctx.layout, a0, intent.x * pace, intent.z * pace, ctx.dt)
  let a: Actor = { ...moved.actor, bot: intent.brain ?? moved.actor.bot, items: stepItems(moved.actor.items, ctx.dt) }
  let f = f0
  const pan = tryPickupPan(a, f.pickups)
  if (pan.picked) {
    f = emit({ ...f, pickups: pan.pickups }, { type: 'panPickup', actor: a.id })
    a = pan.actor
  }
  if (intent.usePan && a.items.pans > 0 && a.items.panCooldown <= 0) {
    // Bots bang the pan inside the step: same +40 noise, credited to the troll.
    f = emit({ ...f, added: f.added.map((v, i) => (i === a.id ? v + CFG.panNoise : v)) }, { type: 'pan', actor: a.id })
    a = { ...a, items: { ...a.items, pans: a.items.pans - 1, panCooldown: CFG.panCooldown } }
  }
  a = { ...a, onGold: onGold(ctx.layout, a.pos) }
  if (a.onGold && moved.walked > 0) {
    const added = f.added.map((v, i) => (i === a.id ? v + noiseFrom(a, moved.walked) : v))
    f = emit({ ...f, added }, { type: 'jingle', actor: a.id, pos: a.pos })
  }
  if (peeking && moved.walked > 0) {
    // While it peeks every step counts, gold or stone: as loud as factor × a step on gold.
    const loud = noiseFrom(a, moved.walked) * (a.onGold ? CFG.peekNoiseFactor - 1 : CFG.peekNoiseFactor)
    f = { ...f, added: f.added.map((v, i) => (i === a.id ? v + loud : v)) }
  }
  return { frame: f, actor: a }
}

/** One actor's turn: move, then at most one of burn / steal / claim / pick up / deliver. */
export function stepActor(ctx: StepContext, f0: Frame, a0: Actor, roll: number): Out {
  const { frame: f, actor: a } = move(ctx, f0, a0, roll)
  if (inFire(ctx.state, ctx.layout, a)) return burn(ctx, f, a)
  return stealOrClaim(ctx, f, a) ?? pickupEgg(ctx, f, a) ?? deliver(ctx, f, a, a0) ?? { frame: f, actor: a }
}
