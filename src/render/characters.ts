import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { CharacterId } from '../meta/wardrobe'
import { applyFx, fitHeight, matteCopy, prepareMeshes } from './materialFx'

/** The clips every thief model carries (Tripo Mixamo rig; the sneak comes from Pati's file). */
export type Clip = 'idle' | 'walk' | 'run' | 'sneak' | 'cheer' | 'afraid'

/** A wearable, animated 3D body for a thief. */
export interface CharacterBody {
  readonly root: THREE.Object3D
  readonly mixer: THREE.AnimationMixer
  readonly actions: ReadonlyMap<Clip, THREE.AnimationAction>
  /** Height of the top of the head, for placing what it carries. */
  readonly height: number
}

/** Taller than life so kids can read them from the high camera. */
const HEIGHT = 2.2

const CLIP_NAMES: Record<string, Clip> = { idle: 'idle', walk: 'walk', run: 'run', cheer: 'cheer', afraid: 'afraid' }

/** Clip names from Tripo are prompts or library names; map them onto ours. */
function clipName(raw: string): Clip | null {
  if (CLIP_NAMES[raw] !== undefined) return CLIP_NAMES[raw]
  if (/sneak|tiptoe/i.test(raw)) return 'sneak'
  return null
}

/** Root motion off: the simulation moves the thief, the clip only animates the body. */
function inPlace(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone()
  for (const t of c.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue
    for (let i = 0; i < t.values.length; i += 3) {
      t.values[i] = t.values[0]
      t.values[i + 2] = t.values[2]
    }
  }
  return c
}

/**
 * Builds a thief from a Tripo model: own skeleton (SkeletonUtils clone), matte materials,
 * the wardrobe colour painted over the light cloth, and one action per clip.
 */
export function buildBody(_id: CharacterId, gltf: GLTF, tint: number | null, extraClips: readonly THREE.AnimationClip[] = []): CharacterBody {
  const holder = new THREE.Group()
  const model = cloneSkinned(gltf.scene)
  prepareMeshes(model)
  model.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mat = matteCopy(m.material as THREE.Material)
    if (tint !== null) {
      applyFx(mat, { tint, tintAmount: 0.85, ...(tint === 0xffd700 ? { rim: 0xffb000, rimStrength: 0.6 } : {}) })
    }
    m.material = mat
  })
  fitHeight(model, HEIGHT)
  // Tripo models face +z like the game's thieves.
  holder.add(model)
  const mixer = new THREE.AnimationMixer(model)
  const actions = new Map<Clip, THREE.AnimationAction>()
  for (const raw of [...gltf.animations, ...extraClips]) {
    const name = clipName(raw.name)
    if (name === null || actions.has(name)) continue
    const action = mixer.clipAction(inPlace(raw))
    if (name === 'cheer' || name === 'afraid') action.setLoop(THREE.LoopRepeat, Infinity)
    actions.set(name, action)
  }
  return { root: holder, mixer, actions, height: HEIGHT }
}
