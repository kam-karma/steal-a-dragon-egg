import * as THREE from 'three'
import { displayName } from '../i18n'
import type { Actor } from '../sim/types'
import { makeBaby, makeChest, makeEgg, makeGoldenEgg } from './eggMesh'
import { makePan } from './pickupsView'
import type { CharacterBody, Clip } from './characters'
import { glowTexture, labelSprite, letterTexture, starTexture } from './textures'

export interface ThiefRig {
  readonly group: THREE.Group
  readonly update: (dt: number, time: number, a: Actor, isNemesis: boolean) => void
  /** Swap the hand-built body for a 3D character model (null = back to hand-built). */
  readonly setBody: (body: CharacterBody | null) => void
}

const SKIN = new THREE.MeshStandardMaterial({ color: 0xffd2a8, roughness: 0.6 })
const MASK = new THREE.MeshStandardMaterial({ color: 0x1d1a2b, roughness: 0.5 })
const WHITE = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
const SACK = new THREE.MeshStandardMaterial({ color: 0xa8784a, roughness: 0.9, flatShading: true })
const star = starTexture()
const alertTex = letterTexture('!', '#ff3b30')
const SHADOW_GEO = new THREE.CircleGeometry(0.95, 24)
const SHADOW_MAT = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false })

function part(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  return m
}

/** A chubby masked egg thief. Arms go up when carrying. Stars spin when stunned. */
export function createThief(actor: Actor): ThiefRig {
  const cloth = new THREE.MeshStandardMaterial({ color: actor.color, roughness: 0.55 })
  const group = new THREE.Group()
  const rig = new THREE.Group()
  group.add(rig)

  const body = part(new THREE.CapsuleGeometry(0.42, 0.45, 6, 14), cloth)
  body.position.y = 0.78
  rig.add(body)
  const head = new THREE.Group()
  head.position.y = 1.55
  rig.add(head)
  head.add(part(new THREE.SphereGeometry(0.46, 18, 14), SKIN))
  const band = part(new THREE.CylinderGeometry(0.475, 0.475, 0.2, 18, 1, true), MASK)
  band.position.y = 0.06
  head.add(band)
  const beanie = part(new THREE.SphereGeometry(0.48, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cloth)
  beanie.position.y = 0.12
  head.add(beanie)
  const pom = part(new THREE.SphereGeometry(0.12, 10, 8), WHITE)
  pom.position.y = 0.62
  head.add(pom)
  for (const s of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.09, 10, 8), WHITE)
    eye.position.set(s * 0.17, 0.07, 0.42)
    head.add(eye)
    const pupil = part(new THREE.SphereGeometry(0.045, 8, 6), MASK)
    pupil.position.set(s * 0.17, 0.07, 0.5)
    head.add(pupil)
  }
  const sack = part(new THREE.SphereGeometry(0.34, 10, 8), SACK)
  sack.position.set(0, 0.95, -0.42)
  rig.add(sack)

  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group()
    pivot.position.set(s * 0.45, 1.05, 0)
    const arm = part(new THREE.CapsuleGeometry(0.11, 0.38, 4, 8), cloth)
    arm.position.y = -0.28
    pivot.add(arm)
    const hand = part(new THREE.SphereGeometry(0.13, 8, 6), SKIN)
    hand.position.y = -0.55
    pivot.add(hand)
    rig.add(pivot)
    return pivot
  })
  const legs = [-1, 1].map((s) => {
    const leg = part(new THREE.CapsuleGeometry(0.13, 0.22, 4, 8), MASK)
    leg.position.set(s * 0.2, 0.22, 0)
    rig.add(leg)
    return leg
  })

  const label = labelSprite(displayName(actor), actor.isBot ? '#ffffff' : '#ffe14d')
  label.position.y = 2.55
  group.add(label)

  // A soft contact shadow grounds every thief (no neon rings on the floor).
  const shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.03
  group.add(shadow)

  const held = new THREE.Group()
  held.position.y = 2.45
  rig.add(held)
  let heldKey = ''

  // Big red "!" over anyone carrying a stolen baby, so every kid sees who to chase.
  const alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTex, depthWrite: false, depthTest: false }))
  alert.scale.setScalar(1.3)
  alert.position.y = 3.9
  alert.visible = false
  group.add(alert)

  const stars = new THREE.Group()
  stars.position.y = 2.2
  for (let k = 0; k < 3; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, color: 0xffe066, depthWrite: false }))
    s.scale.setScalar(0.35)
    stars.add(s)
  }
  group.add(stars)

  // Red crown over your nemesis (the bot that robbed you most).
  const crown = new THREE.Group()
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 1.2, metalness: 0.4 })
  crown.add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 6, 16), crownMat).rotateX(Math.PI / 2))
  for (let k = 0; k < 5; k++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), crownMat)
    const a = (k / 5) * Math.PI * 2
    spike.position.set(Math.cos(a) * 0.32, 0.15, Math.sin(a) * 0.32)
    crown.add(spike)
  }
  crown.position.y = 3.05
  crown.visible = false
  group.add(crown)

  const pan = makePan()
  pan.scale.setScalar(0.55)
  pan.position.set(0.2, -0.6, 0.25)
  pan.rotation.set(0, Math.PI / 2, 1.2)
  pan.visible = false
  arms[1].add(pan)

  let walk = 0
  const baseColor = new THREE.Color(actor.color)
  const soot = new THREE.Color(0x2a2222)

  const handBuilt: THREE.Object3D[] = [body, head, sack, ...arms, ...legs]
  let model: CharacterBody | null = null

  function setBody(next: CharacterBody | null): void {
    if (model !== null) rig.remove(model.root)
    model = next
    handBuilt.forEach((o) => (o.visible = next === null))
    if (next !== null) rig.add(next.root)
    clip = null
    held.position.y = next === null ? 2.45 : next.height + 0.55
    label.position.y = next === null ? 2.55 : next.height + 1.25
    refreshCloak()
  }

  let clip: Clip | null = null
  let smoothSpeed = 0
  let movingState = false
  let cheerT = 0
  let wasCarrying = false

  /** Picks the clip for what the thief is doing and cross-fades to it. */
  function animateModel(m: CharacterBody, dt: number, a: Actor, moving: boolean, speed: number): void {
    const carrying = a.carrying !== null
    if (wasCarrying && !carrying && a.stunned <= 0) cheerT = 1.6
    wasCarrying = carrying
    cheerT = Math.max(0, cheerT - dt)
    const has = (c: Clip): boolean => m.actions.has(c)
    let next: Clip = 'idle'
    if (a.stunned > 0 && has('afraid')) next = 'afraid'
    else if (moving) next = a.stolen !== null ? 'run' : carrying ? 'walk' : has('sneak') ? 'sneak' : 'walk'
    else if (cheerT > 0 && has('cheer')) next = 'cheer'
    if (next !== clip) {
      const to = m.actions.get(next)
      if (to !== undefined) {
        to.reset().play()
        const from = clip === null ? undefined : m.actions.get(clip)
        if (from !== undefined) from.crossFadeTo(to, 0.2, false)
      }
      clip = next
    }
    const act = m.actions.get(next)
    if (act !== undefined) act.timeScale = next === 'run' ? speed / 6 : next === 'sneak' ? Math.min(1.8, Math.max(0.8, speed / 4)) : next === 'walk' ? speed / 3.6 : 1
    m.mixer.update(dt)
  }

  function update(dt: number, time: number, a: Actor, isNemesis: boolean): void {
    crown.visible = isNemesis
    if (isNemesis) crown.rotation.y = time * 1.5
    pan.visible = a.items.pans > 0
    group.position.set(a.pos.x, 0, a.pos.z)
    // Smoothed speed and facing, with a start/stop hysteresis: no flicker between clips,
    // no snapping when a bot changes its mind for one frame.
    smoothSpeed += (a.speed - smoothSpeed) * (1 - Math.exp(-dt * 10))
    if (movingState && smoothSpeed < 0.4) movingState = false
    else if (!movingState && smoothSpeed > 1.2) movingState = true
    const moving = model === null ? a.speed > 0.3 : movingState
    const turnBy = Math.atan2(Math.sin(a.facing - rig.rotation.y), Math.cos(a.facing - rig.rotation.y))
    rig.rotation.y += turnBy * (1 - Math.exp(-dt * 14))
    walk += dt * (moving ? 13 : 0)
    const step = moving ? Math.sin(walk) : 0
    legs[0].position.z = step * 0.14
    legs[1].position.z = -step * 0.14
    rig.position.y = moving ? Math.abs(Math.sin(walk)) * 0.08 : Math.sin(time * 2 + a.id) * 0.015
    rig.rotation.z = moving ? step * 0.05 : 0

    const carrying = a.carrying !== null || a.stolen !== null
    arms.forEach((arm, i) => {
      const s = i === 0 ? -1 : 1
      const target = carrying ? Math.PI * 0.95 : step * 0.6 * s
      arm.rotation.x += (-target - arm.rotation.x) * (1 - Math.exp(-dt * 14))
      arm.rotation.z = carrying ? s * 0.25 : 0
    })

    const key = a.carrying !== null ? `e${a.carrying.rarity}${a.carrying.rainbow ? 'r' : ''}${a.carrying.golden === true ? 'g' : ''}${a.carrying.chest === true ? 'c' : ''}` : a.stolen !== null ? `b${a.stolen.rarity}` : ''
    if (key !== heldKey) {
      held.clear()
      if (a.carrying !== null) {
        const c = a.carrying
        held.add(c.chest === true ? makeChest() : c.golden === true ? makeGoldenEgg(c.rarity) : makeEgg(c.rarity, c.rainbow))
      }
      if (a.stolen !== null) {
        const baby = makeBaby(a.stolen.rarity, a.stolen.shiny)
        baby.scale.setScalar(0.8)
        baby.position.y = -0.35
        held.add(baby)
      }
      heldKey = key
      refreshCloak()
    }
    held.rotation.y = a.stolen !== null ? Math.sin(time * 9) * 0.5 : a.carrying?.chest === true ? rig.rotation.y : time * 1.5
    alert.visible = a.stolen !== null
    if (alert.visible) alert.scale.setScalar(1.2 + Math.abs(Math.sin(time * 8)) * 0.35)

    stars.visible = a.stunned > 0
    if (stars.visible) {
      stars.children.forEach((s, k) => {
        const ang = time * 5 + (k / 3) * Math.PI * 2
        s.position.set(Math.cos(ang) * 0.6, Math.sin(time * 8 + k) * 0.08, Math.sin(ang) * 0.6)
      })
    }
    if (model !== null) {
      animateModel(model, dt, a, moving, smoothSpeed)
      rig.position.y = 0
      rig.rotation.z = 0
    }
    cloth.color.copy(baseColor).lerp(soot, Math.min(1, a.stunned * 0.9))
    head.rotation.z = a.stunned > 0 ? Math.sin(time * 9) * 0.25 : 0
    // Invisibility cloak: see-through, flickering in its last seconds.
    const cloak = a.items.cloakLeft > 0
    if (cloak !== cloaked) setCloak(cloak)
    if (cloak) ghostOpacity(a.items.cloakLeft < 5 ? 0.25 + Math.abs(Math.sin(time * 10)) * 0.4 : 0.28)
  }

  let cloaked = false
  let ghosts: THREE.Material[] = []
  const toGhost = (orig: THREE.Material): THREE.Material => {
    const ghost = orig.clone()
    ghost.transparent = true
    ghost.depthWrite = false
    ghost.userData.orig = orig
    ghosts.push(ghost)
    return ghost
  }
  const fromGhost = (m: THREE.Material): THREE.Material => (m.userData.orig as THREE.Material | undefined) ?? m
  /**
   * Swaps every mesh (body and the egg it holds) to see-through copies of its materials, and
   * back. Copies are never shared, so other thieves are untouched; old copies are disposed.
   */
  function setCloak(on: boolean): void {
    cloaked = on
    group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      const plain = mats.map(fromGhost)
      const next = on ? plain.map(toGhost) : plain
      m.material = Array.isArray(m.material) ? next : next[0]
    })
    for (const g of ghosts) if (!on || !isLive(g)) g.dispose()
    ghosts = on ? ghosts.filter(isLive) : []
  }
  function isLive(g: THREE.Material): boolean {
    let live = false
    group.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (m === g || (Array.isArray(m) && m.includes(g))) live = true
    })
    return live
  }
  /** After the body or the held egg changed: new meshes join the cloak too. */
  function refreshCloak(): void {
    if (cloaked) setCloak(true)
  }
  function ghostOpacity(o: number): void {
    for (const g of ghosts) g.opacity = o
  }

  return { group, update, setBody }
}
