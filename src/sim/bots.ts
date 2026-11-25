import { CFG } from './config'
import { handsFree } from './movement'
import { eggPos } from './happenings'
import { isGuarded, recentlyRobbed } from './raid'
import { canAccept } from './nests'
import { hasTriple } from './economy'
import { PLAYER_ID } from './ids'
import { rainbowTarget, shouldBangPan, stepOops, updateGrudge, wantsRainbow } from './botPersonality'
import { dist, nestAngle, polar } from './world'
import type { Actor, BotBrain, GameState, Layout, Vec } from './types'

export interface BotIntent {
  readonly x: number
  readonly z: number
  readonly brain: BotBrain
  /** Bang the pan this step. */
  readonly usePan: boolean
}

export { assignPersonality } from './botPersonality'

export function newBrain(clumsy: number): BotBrain {
  return { goal: 'egg', targetEgg: null, target: null, clumsy, think: 0, raidNest: null, raidCooldown: 20 + clumsy * 10, raidTime: 0, grudge: 0, oopsIn: 20 + clumsy * 20, oopsLeft: 0, oopsDir: { x: 0, z: 0 } }
}

function hidingSpot(layout: Layout, p: Vec): Vec {
  let best = layout.pillars[0]
  let bestD = Infinity
  for (const c of layout.pillars) {
    const d = Math.hypot(c.x - p.x, c.z - p.z)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  const len = Math.hypot(best.x, best.z) || 1
  return { x: best.x + (best.x / len) * (best.r + 0.9), z: best.z + (best.z / len) * (best.r + 0.9) }
}

function pickEgg(state: GameState, layout: Layout, a: Actor, roll: number): number | null {
  const taken = new Set(state.actors.filter((o) => o.id !== a.id && o.bot?.targetEgg != null).map((o) => o.bot?.targetEgg))
  const free = state.eggs.filter((e) => !taken.has(e.id))
  if (free.length === 0) return null
  const greedy = a.bot?.clumsy ?? 0.5
  const scored = free.map((e) => ({
    e,
    s: e.rarity * (0.6 + greedy) - dist(a.pos, eggPos(e, state, layout)) * 0.08 + roll * ((e.id * 7919) % 13) * 0.08,
  }))
  scored.sort((p, q) => q.s - p.s)
  return scored[0].e.id
}

/**
 * Steers toward a point while sliding around rocks and the dragon. Slows down on arrival
 * and stops at the point, so a bot never overshoots and turns back every frame. The side it
 * passes an obstacle on comes from the straight line to the target, so it does not flip.
 */
function steer(layout: Layout, from: Vec, to: Vec): { x: number; z: number } {
  const ox = to.x - from.x
  const oz = to.z - from.z
  const len = Math.hypot(ox, oz)
  if (len < ARRIVE) return { x: 0, z: 0 }
  const ux = ox / len
  const uz = oz / len
  let x = ux
  let z = uz
  const obstacles = [...layout.pillars, { x: 0, z: 0, r: CFG.dragonRadius }]
  for (const c of obstacles) {
    const dx = from.x - c.x
    const dz = from.z - c.z
    const d = Math.hypot(dx, dz)
    const reach = c.r + 1.8
    if (d < reach && d > 1e-6) {
      const push = (reach - d) / reach
      // Slide sideways (tangent) rather than straight back, so bots go around.
      const side = Math.sign(dx * uz - dz * ux) || 1
      x += (dx / d) * push * 0.8 + (-dz / d) * side * push * 1.2
      z += (dz / d) * push * 0.8 + (dx / d) * side * push * 1.2
    }
  }
  const l2 = Math.hypot(x, z) || 1
  const ease = Math.min(1, (len - ARRIVE) / 1.2 + 0.25)
  return { x: (x / l2) * ease, z: (z / l2) * ease }
}

/** Close enough to a steering target to stop. */
const ARRIVE = 0.35

/** Every so often a bot picks the richest unguarded rival nest and goes for a baby. */
function planRaid(state: GameState, a: Actor, brain: BotBrain, dt: number, roll: number): BotBrain {
  const cooldown = brain.raidCooldown - dt
  if (brain.raidNest !== null) {
    const still = state.nests[brain.raidNest].babies.length > 0 && brain.raidTime < CFG.raidPatience
    return still ? { ...brain, raidCooldown: cooldown, raidTime: brain.raidTime + dt } : { ...brain, raidNest: null, raidCooldown: cooldown }
  }
  if (cooldown > 0) return { ...brain, raidCooldown: cooldown }
  const next = CFG.raidCooldown * (0.7 + roll * 0.6)
  if (roll > 0.6 + brain.clumsy * 0.3) return { ...brain, raidCooldown: next }
  const options = state.nests
    .map((n, i) => ({ i, worth: n.babies.reduce((s, b) => s + 1 + b.rarity * 2, 0) }))
    .filter((o) => o.i !== a.nest && o.worth >= 2 && !recentlyRobbed(state.nests[o.i], state.time))
    .sort((p, q) => q.worth - p.worth)
  return { ...brain, raidNest: options[0]?.i ?? null, raidCooldown: next, raidTime: 0 }
}

/** Where the bot walks and whether it bangs a pan; personality decides the details. */
export function botIntent(state: GameState, layout: Layout, a: Actor, dt: number, roll: number): BotIntent {
  const usePan = shouldBangPan(state, a)
  const go = decide(state, layout, a, dt, roll)
  return { ...go, usePan }
}

function decide(state: GameState, layout: Layout, a: Actor, dt: number, roll: number): Omit<BotIntent, 'usePan'> {
  const brain = stepOops(updateGrudge(state, a, a.bot ?? newBrain(0.5), dt), dt, roll)
  const home = layout.nests[a.nest]
  const mode = state.dragon.mode
  const nearHoard = Math.hypot(a.pos.x, a.pos.z) < CFG.hoardRadius + 3

  const awake = mode === 'wake' || mode === 'hunt'
  // A bot that started hiding stays hidden until the dragon sleeps (no flip-flop at the edge).
  if (awake && (nearHoard || brain.goal === 'hide')) {
    const spot = brain.goal === 'hide' && brain.target !== null ? brain.target : hidingSpot(layout, a.pos)
    return { ...steer(layout, a.pos, spot), brain: { ...brain, goal: 'hide', target: spot } }
  }
  if (brain.oopsLeft > 0) return { x: brain.oopsDir.x, z: brain.oopsDir.z, brain }
  const thief = state.actors.find((o) => o.stolen?.from === a.nest && dist(o.pos, a.pos) < CFG.chaseRange)
  if (thief !== undefined && a.stunned <= 0) {
    return { ...steer(layout, a.pos, thief.pos), brain: { ...brain, goal: 'chase', target: thief.pos } }
  }
  if (mode === 'stir' && a.onGold && brain.clumsy < 0.55) {
    return { x: 0, z: 0, brain: { ...brain, goal: 'wait' } }
  }
  if (!handsFree(a)) {
    return { ...steer(layout, a.pos, home), brain: { ...brain, goal: 'home', target: home, targetEgg: null, raidNest: null } }
  }
  const pan = a.personality === 'troll' && a.items.pans < 1 ? state.pickups.find((p) => p.kind === 'pan' && dist(p.pos, a.pos) < 25) : undefined
  if (pan !== undefined) return { ...steer(layout, a.pos, pan.pos), brain: { ...brain, goal: 'egg', target: pan.pos } }
  // A bot with no room at home leaves eggs (and the rainbow egg) alone and goes raiding.
  const room = canAccept(state.nests[a.nest]) || hasTriple(state.nests[a.nest])
  const rainbow = room && wantsRainbow(a) ? rainbowTarget(state) : null
  if (rainbow !== null) return { ...steer(layout, a.pos, rainbow), brain: { ...brain, goal: 'egg', target: rainbow } }
  const raid = brain.grudge > 0 && state.nests[PLAYER_ID].babies.length > 0 ? { ...brain, raidNest: PLAYER_ID } : planRaid(state, a, brain, dt, roll)
  if (raid.raidNest !== null) {
    const nest = layout.nests[raid.raidNest]
    // Lurk just outside a guarded nest and wait for the owner to walk away.
    const lurk = isGuarded(layout, state.actors, raid.raidNest) && dist(a.pos, nest) < CFG.guardRadius + 2.5
    const go = lurk ? { x: 0, z: 0 } : steer(layout, a.pos, nest)
    return { ...go, brain: { ...raid, goal: 'raid', target: nest } }
  }

  if (!room) return { ...steer(layout, a.pos, home), brain: { ...raid, goal: 'wait', target: home } }
  const think = brain.think - dt
  const base = raid
  const stillThere = brain.targetEgg !== null && state.eggs.some((e) => e.id === brain.targetEgg)
  const targetEgg = stillThere && think > 0 ? brain.targetEgg : pickEgg(state, layout, a, roll)
  const nextBrain: BotBrain = { ...base, goal: 'egg', targetEgg, think: think > 0 ? think : 3 + roll * 3 }
  if (targetEgg === null) return { x: 0, z: 0, brain: { ...nextBrain, goal: 'wait' } }

  const egg = state.eggs.find((e) => e.id === targetEgg)
  const goalPos = egg === undefined ? home : eggPos(egg, state, layout)
  // While the dragon is awake nobody walks into its hoard: wait outside for it to settle.
  if (awake && Math.hypot(goalPos.x, goalPos.z) < CFG.hoardRadius + 3) return { x: 0, z: 0, brain: { ...nextBrain, goal: 'wait' } }
  // Careful bots use the quiet stone corridor from their nest until they are close to the hoard.
  const r = Math.hypot(a.pos.x, a.pos.z)
  const corridor = polar(8.2, nestAngle(a.nest))
  // Only while the corridor is still ahead (closer to the egg than we are): no flicker after passing it.
  const via = brain.clumsy < 0.5 && r > 9 && dist(a.pos, corridor) > 1 && dist(corridor, goalPos) < dist(a.pos, goalPos) ? corridor : goalPos
  return { ...steer(layout, a.pos, via), brain: { ...nextBrain, target: via } }
}
