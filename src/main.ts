import * as THREE from 'three'
import { CFG } from './sim/config'
import './style.css'
import { createSessionLog, exportLog } from './analytics'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createAds } from './ads'
import { createSfx } from './audio'
import { type CharacterId, colorHex } from './meta/wardrobe'
import { buildBody } from './render/characters'
import { setBabyTemplate, setEggTemplate } from './render/eggMesh'
import { createOffersUi } from './offersUi'
import { createWardrobeUi } from './wardrobeUi'
import { createDirector } from './director'
import { createBookUi } from './bookUi'
import { createCrownShopUi } from './crownShopUi'
import { showDailyGift } from './dailyUi'
import { sideMenu } from './smallScreen'
import { createMissionsUi } from './missionsUi'
import { createMusic } from './music'
import { type ControlsHint, showControlsHint } from './controlsHint'
import { createHud } from './hud'
import { createPanels } from './hudPanels'
import { LANG, T } from './i18n'
import { createMoveInput } from './input'
import { buildCave, fadePillars } from './render/cave'
import { createDragon, type DragonRig } from './render/dragonMesh'
import { createDragonTripo } from './render/dragonTripo'
import { dressCave } from './render/caveModels'
import { loadModel } from './render/models'
import { tickRainbow } from './render/eggMesh'
import { createHoardView } from './render/hoardView'
import { createParticles } from './render/particles'
import { createPickupsView } from './render/pickupsView'
import { createStage } from './render/stage'
import { createThief } from './render/thiefMesh'
import { levelFromXp } from './sim/economy'
import { createGame, PLAYER_ID, stepGame } from './sim/game'
import { eggPos } from './sim/happenings'
import { nemesisOf } from './sim/raid'
import { applySave, toSave } from './sim/save'
import type { Action, GameState, Reward } from './sim/types'
import { dist, makeLayout } from './sim/world'
import { autoSave, loadSave, resetIfAsked } from './storage'

document.documentElement.lang = LANG
const canvas = document.getElementById('stage') as HTMLCanvasElement
const layout = makeLayout(7)
resetIfAsked()
const saved = loadSave()
let state: GameState = saved === null ? createGame(layout, Date.now() >>> 0) : applySave(createGame(layout, Date.now() >>> 0), saved)
autoSave(() => toSave(state, Date.now()))

const stage = createStage(canvas)
const cave = buildCave(stage.scene, layout)
// The hand-built dragon shows at once; the red dragon model replaces it once loaded.
let currentDragon: DragonRig = createDragon()
stage.scene.add(currentDragon.group)
const dragon: DragonRig = {
  get group() {
    return currentDragon.group
  },
  update: (dt, t, v) => currentDragon.update(dt, t, v),
  mouth: (p, d) => currentDragon.mouth(p, d),
  nostril: (p) => currentDragon.nostril(p),
  itch: () => currentDragon.itch(),
  sneeze: () => currentDragon.sneeze(),
  get tune() {
    return currentDragon.tune
  },
}
// Every crown brings a dragon of a new colour.
let dragonTheme = -1
function themeDragon(crowns: number): void {
  if (crowns === dragonTheme || currentDragon.theme === undefined) return
  dragonTheme = crowns
  currentDragon.theme(crowns)
}
loadModel('ejderha')
  .then((gltf) => {
    stage.scene.remove(currentDragon.group)
    currentDragon = createDragonTripo(gltf)
    stage.scene.add(currentDragon.group)
    dragonTheme = -1
  })
  .catch(() => undefined) // keep the hand-built dragon
// Tripo props replace the stand-in rocks, gold, braziers and crystals as soon as they arrive.
void Promise.all(['kaya', 'altin', 'mangal', 'kristal'].map((n) => loadModel(n)))
  .then(([rock, gold, brazier, crystal]) => dressCave(stage.scene, layout, cave, { rock: rock.scene, gold: gold.scene, brazier: brazier.scene, crystal: crystal.scene }))
  .catch(() => undefined)
const thieves = state.actors.map((a) => {
  const t = createThief(a)
  stage.scene.add(t.group)
  return t
})
const hoard = createHoardView(stage.scene, layout, state.actors.map((a) => a.color), PLAYER_ID)
void Promise.all([loadModel('yuva'), loadModel('bayrak')])
  .then(([nest, banner]) => hoard.dressNests(nest.scene, banner.scene))
  .catch(() => undefined)
const pickupsView = createPickupsView(stage.scene)
const fx = createParticles(stage.scene)
const hud = createHud(document.body)
const hideLoading = hud.showLoading()
const sfx = createSfx()
hud.onMute(sfx.toggleMute)
const music = createMusic(sfx.bus)

// Ads pause the game and mute it while they play (Poki rule).
let adPaused = false
const ads = createAds(
  () => {
    adPaused = true
    sfx.setPaused(true)
  },
  () => {
    adPaused = false
    sfx.setPaused(false)
  },
)

// Browsers only let sound start from a real gesture (on phones: when the finger lifts, not when
// it lands). With no PLAY button, keep asking on every gesture until the audio is running.
const AUDIO_GESTURES = ['pointerup', 'touchend', 'keydown'] as const
function unlockAudio(): void {
  if (adPaused || !sfx.unlock()) return
  AUDIO_GESTURES.forEach((t) => window.removeEventListener(t, unlockAudio, true))
}
AUDIO_GESTURES.forEach((t) => window.addEventListener(t, unlockAudio, { capture: true, passive: true }))

// Player actions (HUD buttons, keys) wait here for the next simulation step.
let pending: Action[] = []
const queue = (a: Action): void => {
  pending = [...pending, a]
}
const panels = createPanels(document.body, queue)

// Characters: the player's from the wardrobe; bots show off the premium looks kids can unlock.
const gltfs = new Map<CharacterId, GLTF>()
let sneakClips: THREE.AnimationClip[] = []
function wear(i: number, character: CharacterId, color: string): void {
  const g = gltfs.get(character) ?? gltfs.get('pati')
  if (g !== undefined) thieves[i].setBody(buildBody(gltfs.has(character) ? character : 'pati', g, colorHex(color), sneakClips))
}
const BOT_LOOKS: readonly [CharacterId, string][] = [
  ['pati', 'cilek'], ['tilki', 'orijinal'], ['pati', 'nane'], ['pati', 'golge'], ['jessie', 'orijinal'], ['pati', 'gunes'], ['tilki', 'gece'],
]
function dressEveryone(): void {
  const w = wardrobe.current()
  wear(PLAYER_ID, w.wearing.character, w.wearing.color)
  BOT_LOOKS.forEach(([c, col], k) => wear(k + 1, c, col))
}
const wardrobe = createWardrobeUi(document.body, {
  coins: () => state.actors[PLAYER_ID].coins,
  spend: (amount) => queue({ type: 'spend', amount }),
  ads,
  onWear: (w) => wear(PLAYER_ID, w.wearing.character, w.wearing.color),
})
// Tripo models (Mixamo rig). The sneak clip lives in its own file and fits every thief's skeleton.
const MODEL_FILES: readonly [CharacterId, string][] = [['pati', 'pati'], ['tilki', 'tilki'], ['jessie', 'rakun']]
void Promise.all([
  ...MODEL_FILES.map(([id, file]) =>
    loadModel(file)
      .then((g) => gltfs.set(id, g))
      .catch(() => undefined),
  ),
  loadModel('pati_sneak')
    .then((g) => (sneakClips = g.animations))
    .catch(() => undefined),
]).then(() => {
  dressEveryone()
  startGame()
})
loadModel('yavru')
  .then((g) => {
    setBabyTemplate(g.scene, g.animations)
    hoard.rebuildBabies()
  })
  .catch(() => undefined)
loadModel('yumurta')
  .then((g) => {
    setEggTemplate(g.scene)
    hoard.rebuildBabies()
  })
  .catch(() => undefined)
const log = createSessionLog()
const offers = createOffersUi(document.body, {
  ads,
  grant: (reward) => queue({ type: 'grant', reward }),
  buy: (item) => queue({ type: 'buyItem', item }),
  state: () => state,
})

// A bouncing arrow that shows a kid where to go next.
const guideMat = new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xffc400, emissiveIntensity: 1.4 })
const guide = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), guideMat)
guide.rotation.x = Math.PI
stage.scene.add(guide)

const projected = new THREE.Vector3()
function toScreen(v: THREE.Vector3): { x: number; y: number } {
  projected.copy(v).project(stage.camera)
  return { x: (projected.x * 0.5 + 0.5) * window.innerWidth, y: (-projected.y * 0.5 + 0.5) * window.innerHeight }
}

let started = false
let controls: ControlsHint | null = null
let shake = 0

/** No title screen: once the thieves are loaded the player is in the cave, with the controls shown. */
function startGame(): void {
  if (started) return
  started = true
  hideLoading()
  ads.gameplayStart()
  director.begin()
  // Today's gift, if one is waiting (a returning player's first sight of the day).
  showDailyGift(document.body, {
    give: (r) => {
      if (r.grant !== undefined) queue({ type: 'grant', reward: r.grant })
      else queue({ type: 'bonus', coins: r.coins ?? 0, xp: 0, crowns: r.crowns ?? 0, drops: r.drops ?? 0 })
      sfx.fanfare()
    },
  })
  controls = showControlsHint(document.body, window.matchMedia('(pointer: coarse)').matches)
}
const input = createMoveInput(
  canvas,
  () => toScreen(new THREE.Vector3(state.actors[PLAYER_ID].pos.x, 1, state.actors[PLAYER_ID].pos.z)),
  () => sfx.unlock(),
  () => queue({ type: 'usePan' }),
  () => queue({ type: 'dropEgg' }),
)
const book = createBookUi(document.body, {
  pay: (coins, crowns) => queue({ type: 'bonus', coins, xp: 0, crowns }),
  celebrate: (text) => {
    hud.toast(text, 'good')
    sfx.shiny()
  },
})
sideMenu(document.body)
const crownShop = createCrownShopUi(document.body, { state: () => state, buyPerk: (perk) => queue({ type: 'buyPerk', perk }) })
const missions = createMissionsUi(document.querySelector<HTMLElement>('.status') ?? document.body, {
  pay: (coins, xp) => queue({ type: 'bonus', coins, xp }),
  celebrate: (text) => {
    hud.toast(text, 'good')
    sfx.fanfare()
  },
})
const director = createDirector({ hud, panels, sfx, fx, hoard, dragon, toScreen, layout, shake: (s) => (shake = Math.max(shake, s)) })

const camPos = new THREE.Vector3(0, 18, 40)
const camLook = new THREE.Vector3()
/** Dev only: a fixed camera [x, y, z, lookX, lookY, lookZ] set from the console via __game.cam. */
let devCam: number[] | null = null

function updateCamera(dt: number, p: { x: number; z: number }): void {
  const awake = state.dragon.mode === 'wake' || state.dragon.mode === 'hunt'
  const target = new THREE.Vector3(p.x * 0.92, awake ? 23 : 19.5, p.z * 0.92 + (awake ? 16 : 13.5))
  camPos.lerp(target, 1 - Math.exp(-dt * 3))
  camLook.lerp(new THREE.Vector3(p.x * 0.92, 0.5, p.z * 0.92 - 2.5), 1 - Math.exp(-dt * 4))
  stage.camera.position.copy(camPos)
  if (shake > 0) {
    shake = Math.max(0, shake - dt)
    const s = shake * 0.5
    stage.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s))
  }
  stage.camera.lookAt(camLook)
  if (devCam !== null) {
    stage.camera.position.set(devCam[0], devCam[1], devCam[2])
    stage.camera.lookAt(devCam[3], devCam[4], devCam[5])
  }
  stage.keyLight.position.set(p.x + 12, 34, p.z + 16)
  stage.keyLight.target.position.set(p.x, 0, p.z)
}

function updateGuide(time: number): void {
  const me = state.actors[PLAYER_ID]
  let target: { x: number; z: number } | null = null
  const thief = director.thiefOfMine(state)
  guideMat.color.set(thief !== null ? 0xff3b30 : 0xffe14d)
  guideMat.emissive.set(thief !== null ? 0xff2010 : 0xffc400)
  if (thief !== null) target = state.actors[thief].pos
  else if (me.carrying !== null || me.stolen !== null) target = layout.nests[me.nest]
  else if (director.needsEggGuide()) {
    const nearest = [...state.eggs].sort((a, b) => dist(eggPos(a, state, layout), me.pos) - dist(eggPos(b, state, layout), me.pos))[0]
    if (nearest !== undefined) target = eggPos(nearest, state, layout)
  }
  guide.visible = target !== null && started
  if (target !== null) guide.position.set(target.x, (thief !== null ? 4.6 : 2.4) + Math.abs(Math.sin(time * 4)) * 0.6, target.z)
  guide.rotation.y = time * 2
}

const FIXED = 1 / 60
let acc = 0
/** Positions before the last fixed step: the renderer draws between them and the current ones. */
let prevPos: readonly { x: number; z: number }[] = []
let last = performance.now()
let time = 0
const fireFrom = new THREE.Vector3()
const fireDir = new THREE.Vector3()

function simulate(dt: number): void {
  if (adPaused) return
  // Nothing runs behind the loading screen: timers and playtest seconds start with the game.
  if (!started) return
  const move = input.read()
  acc += dt
  while (acc >= FIXED) {
    const action = pending[0]
    pending = pending.slice(1)
    prevPos = state.actors.map((a) => a.pos)
    const r = stepGame(state, layout, action === undefined ? move : { ...move, action }, FIXED)
    state = r.state
    missions.events(r.events, levelFromXp(state.actors[PLAYER_ID].xp))
    book.events(r.events)
    r.events.forEach((e) => {
      director.event(e, state)
      log(e, state.time)
      offers.event(e, state.time)
      // Rebirth is a natural break: the one place a commercial break may play.
      if (e.type === 'rebirth') void ads.commercialBreak()
    })
    acc -= FIXED
  }
}

// A device that cannot hold ~32 fps for 12 s drops to the light mode (no shadows / bloom).
let perfTime = 0
let perfFrames = 0
let slowWindows = 0
function watchFrameRate(rawDt: number): void {
  if (stage.low() || !started || document.hidden || rawDt > 0.5) return
  perfTime += rawDt
  perfFrames++
  if (perfTime < 4) return
  const fps = perfFrames / perfTime
  slowWindows = fps < 32 ? slowWindows + 1 : 0
  if (slowWindows >= 3) stage.goLow()
  perfTime = 0
  perfFrames = 0
}

function frame(now: number): void {
  const rawDt = (now - last) / 1000
  const dt = Math.min(0.1, rawDt)
  last = now
  watchFrameRate(rawDt)
  time += dt
  simulate(dt)
  // While it peeks the dragon shows it: eyes open, head up.
  const peeking = state.happenings.peekLeft > 0 && (state.dragon.mode === 'sleep' || state.dragon.mode === 'stir')
  dragon.update(dt, time, { ...state.dragon, mode: peeking ? 'stir' : state.dragon.mode, noise: state.noise })
  if (state.dragon.fire) {
    // Flames leave the snout but follow the burn cone the simulation uses: flat along the
    // dragon's yaw, dipping to the floor at CFG.fireRange. What burns you is what you see.
    dragon.mouth(fireFrom, fireDir)
    const yaw = state.dragon.yaw
    const flat = Math.max(1, CFG.fireRange - Math.hypot(fireFrom.x, fireFrom.z))
    fireDir.set(Math.sin(yaw) * flat, 0.8 - fireFrom.y, Math.cos(yaw) * flat).normalize()
    fx.fire(fireFrom, fireDir, flat)
  }
  director.tick(dt, time, state)
  themeDragon(state.actors[PLAYER_ID].rebirths)
  music.setMode(state.dragon.mode === 'wake' || state.dragon.mode === 'hunt' ? 'chase' : 'calm')
  if (started) offers.tick(state, layout, state.time)
  crownShop.tick(state)
  const nemesis = nemesisOf(state.nemesisCounts)
  // The simulation steps at 60 Hz; screens run at 60-144 Hz. Drawing between the last two
  // steps keeps every thief gliding instead of hitching (no step) and jumping (two steps).
  const alpha = Math.min(1, acc / FIXED)
  const drawn = state.actors.map((a, i) => {
    const p = prevPos[i]
    if (p === undefined || Math.hypot(a.pos.x - p.x, a.pos.z - p.z) > 3) return a
    return { ...a, pos: { x: p.x + (a.pos.x - p.x) * alpha, z: p.z + (a.pos.z - p.z) * alpha } }
  })
  drawn.forEach((a, i) => thieves[i].update(dt, time, a, a.id === nemesis))
  tickRainbow(time)
  hoard.sync(state, time)
  pickupsView.sync(state.pickups, time)
  fx.update(dt)
  updateGuide(time)
  updateCamera(dt, drawn[PLAYER_ID].pos)
  const me = drawn[PLAYER_ID].pos
  const home = layout.nests[state.actors[PLAYER_ID].nest]
  if (controls !== null) {
    const head = toScreen(new THREE.Vector3(me.x, 2.2, me.z))
    controls.follow(head.x, head.y)
    if (Math.hypot(me.x - home.x, me.z - home.z) > 4) {
      controls.hide()
      controls = null
    }
  }
  fadePillars(cave.pillars, stage.camera.position, new THREE.Vector3(me.x, 1, me.z), dt)
  cave.fx.update(time)
  hud.update(state, PLAYER_ID)
  panels.update(state, PLAYER_ID, layout)
  stage.render()
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
// If a model never arrives, play anyway with the stand-ins.
window.setTimeout(startGame, 12_000)

// Playtest mode (?test=1): a small button to download the event log.
if (new URLSearchParams(window.location.search).has('test')) {
  const b = document.createElement('button')
  b.className = 'testlog'
  b.textContent = T.test.download
  b.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    exportLog()
  })
  document.body.appendChild(b)
}

// Dev-only hook for browser checks.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__game = {
    get state() {
      return state
    },
    layout,
    scene: stage.scene,
    dragon,
    camera: stage.camera,
    THREE,
    set cam(c: number[] | null) {
      devCam = c
    },
    teleport: (x: number, z: number) => {
      state = { ...state, actors: state.actors.map((a) => (a.id === PLAYER_ID ? { ...a, pos: { x, z } } : a)) }
    },
    patch: (fn: (s: GameState) => GameState) => {
      state = fn(state)
    },
    act: queue,
    offers,
    grant: (reward: Reward) => queue({ type: 'grant', reward }),
    /** Renders one frame right now and returns it as a PNG (store covers come from real renders). */
    snap: (): string => {
      stage.render()
      return canvas.toDataURL('image/png')
    },
    resize: () => stage.resize(),
  }
}
