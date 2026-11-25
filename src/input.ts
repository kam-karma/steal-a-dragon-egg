import type { PlayerInput } from './sim/types'

export interface MoveInput {
  readonly read: () => PlayerInput
}

const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

/**
 * One way to move, three ways to ask for it:
 * keys (WASD / arrows), a thumb joystick that appears where you touch,
 * or holding the mouse button (walk toward the cursor).
 * The camera looks north, so screen-up is world -z and screen-right is +x.
 */
export function createMoveInput(
  surface: HTMLElement,
  playerOnScreen: () => { x: number; y: number },
  onFirst: () => void,
  onAction: () => void = () => undefined,
): MoveInput {
  const held = new Set<string>()
  const pad = document.createElement('div')
  pad.className = 'joy'
  const knob = document.createElement('div')
  knob.className = 'joy-knob'
  pad.appendChild(knob)
  document.body.appendChild(pad)

  let touchId: number | null = null
  let origin = { x: 0, y: 0 }
  let touchVec = { x: 0, z: 0 }
  let mouseDown = false
  let mouse = { x: 0, y: 0 }
  let first = true
  const radius = 60

  const wake = (): void => {
    if (first) {
      first = false
      onFirst()
    }
  }

  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'KeyE') && !e.repeat) {
      e.preventDefault()
      wake()
      onAction()
      return
    }
    if (KEYS[e.code] !== undefined) {
      held.add(e.code)
      e.preventDefault()
      wake()
    }
  })
  window.addEventListener('keyup', (e) => held.delete(e.code))
  window.addEventListener('blur', () => held.clear())

  surface.addEventListener('pointerdown', (e) => {
    wake()
    if (e.pointerType === 'mouse') {
      mouseDown = true
      mouse = { x: e.clientX, y: e.clientY }
      return
    }
    if (touchId !== null) return
    touchId = e.pointerId
    origin = { x: e.clientX, y: e.clientY }
    touchVec = { x: 0, z: 0 }
    pad.style.left = `${origin.x}px`
    pad.style.top = `${origin.y}px`
    knob.style.transform = 'translate(-50%, -50%)'
    pad.classList.add('on')
  })
  surface.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      mouse = { x: e.clientX, y: e.clientY }
      return
    }
    if (e.pointerId !== touchId) return
    const dx = e.clientX - origin.x
    const dy = e.clientY - origin.y
    const len = Math.hypot(dx, dy)
    const k = len > radius ? radius / len : 1
    knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`
    touchVec = len < 8 ? { x: 0, z: 0 } : { x: (dx * k) / radius, z: (dy * k) / radius }
  })
  const end = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      mouseDown = false
      return
    }
    if (e.pointerId !== touchId) return
    touchId = null
    touchVec = { x: 0, z: 0 }
    pad.classList.remove('on')
  }
  surface.addEventListener('pointerup', end)
  surface.addEventListener('pointercancel', end)

  function read(): PlayerInput {
    let x = 0
    let z = 0
    for (const code of held) {
      const v = KEYS[code]
      if (v !== undefined) {
        x += v[0]
        z += v[1]
      }
    }
    if (x !== 0 || z !== 0) {
      const l = Math.hypot(x, z)
      return { x: x / l, z: z / l }
    }
    if (touchId !== null) return touchVec
    if (mouseDown) {
      const p = playerOnScreen()
      const dx = mouse.x - p.x
      const dy = mouse.y - p.y
      const l = Math.hypot(dx, dy)
      if (l < 18) return { x: 0, z: 0 }
      return { x: dx / l, z: dy / l }
    }
    return { x: 0, z: 0 }
  }

  return { read }
}
