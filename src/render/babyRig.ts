import * as THREE from 'three'

/** Life for the Tripo baby dragon: its idle clip, a happy jump now and then, wing flutter when grown. */
export interface BabyMood {
  /** 0 baby, 1 teen, 2 adult (adults hover). */
  readonly stage: 0 | 1 | 2
  /** Per-baby phase so a nest full of babies does not move in lockstep. */
  readonly phase: number
}

interface BabyState {
  last: number
  nextJump: number
  jumping: boolean
}

export function animateBaby(root: THREE.Object3D, time: number, mood: BabyMood): void {
  const mixer = root.userData.mixer as THREE.AnimationMixer | undefined
  const actions = root.userData.actions as Map<string, THREE.AnimationAction> | undefined
  if (mixer === undefined || actions === undefined) return
  const st: BabyState = (root.userData.babyState as BabyState | undefined) ?? { last: time, nextJump: time + 2 + (mood.phase % 5), jumping: false }
  root.userData.babyState = st
  const dt = Math.min(0.1, Math.max(0, time - st.last))
  st.last = time
  const idle = actions.get('idle')
  const jump = actions.get('jump')
  if (jump !== undefined && idle !== undefined && mood.stage < 2) {
    if (!st.jumping && time >= st.nextJump) {
      st.jumping = true
      jump.reset().setLoop(THREE.LoopOnce, 1).play()
      idle.crossFadeTo(jump, 0.15, false)
    } else if (st.jumping && jump.time >= jump.getClip().duration - 0.2) {
      st.jumping = false
      st.nextJump = time + 4 + ((mood.phase * 2.3) % 5)
      idle.reset().play()
      jump.crossFadeTo(idle, 0.25, false)
    }
  }
  mixer.update(dt)
}
