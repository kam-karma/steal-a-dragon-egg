import { botIntent } from './bots'
import { CFG } from './config'
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
  if (!state.dragon.fire || a.stunned > 0) return false
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
      ? { rarity: dropped.rarity, rainbow: dropped.rainbow, babyNest: null }
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

function pickupEgg(ctx: StepContext, f: Frame, a: Actor): Out | null {
  if (!handsFree(a) || a.stunned > 0) return null
  // In reach: the rainbow egg first, otherwise the nearest one.
  const egg = f.eggs
    .map((e) => ({ e, d: dist(eggPos(e, ctx.state, ctx.layout), a.pos) }))
    .filter((c) => c.d < CFG.pickupRange)
    .sort((p, q) => Number(q.e.rainbow) - Number(p.e.rainbow) || p.d - q.d)[0]?.e
  if (egg === undefined) return null
  return {
    frame: emit({ ...f, eggs: f.eggs.filter((e) => e.id !== egg.id) }, { type: 'pickup', actor: a.id, rarity: egg.rarity, rainbow: egg.rainbow }),
    actor: { ...a, carrying: egg },
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

function deliver(ctx: StepContext, f0: Frame, a0: Actor, prev: Actor): Out | null {
  const egg = a0.carrying
  if (egg === null || dist(a0.pos, ctx.layout.nests[a0.nest]) >= CFG.nestRadius) return null
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
      const arrived = dist(prev.pos, ctx.layout.nests[a.nest]) >= CFG.nestRadius
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
  const events: GameEvent[] = [{ type: 'deliver', actor: a.id, rarity: egg.rarity, rainbow: egg.rainbow }]
  if (asleep) events.push({ type: 'streak', actor: a.id, streak })
  return {
    frame: emit(frame, ...events),
    actor: { ...a, carrying: null, streak, xp: a.xp + CFG.xpDeliverBase + CFG.xpDeliverPerRarity * egg.rarity },
  }
}

function move(ctx: StepContext, f0: Frame, a0: Actor, roll: number): Out {
  const intent = a0.isBot ? botIntent(ctx.state, ctx.layout, a0, ctx.dt, roll) : { x: ctx.input.x, z: ctx.input.z, brain: null, usePan: false }
  const pace = a0.isBot ? CFG.botSpeed : 1
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
  return { frame: f, actor: a }
}

/** One actor's turn: move, then at most one of burn / steal / claim / pick up / deliver. */
export function stepActor(ctx: StepContext, f0: Frame, a0: Actor, roll: number): Out {
  const { frame: f, actor: a } = move(ctx, f0, a0, roll)
  if (inFire(ctx.state, ctx.layout, a)) return burn(ctx, f, a)
  return stealOrClaim(ctx, f, a) ?? pickupEgg(ctx, f, a) ?? deliver(ctx, f, a, a0) ?? { frame: f, actor: a }
}
