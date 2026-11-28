import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export interface Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly keyLight: THREE.DirectionalLight
  readonly render: () => void
  readonly resize: () => void
  /** True on phones/tablets or after a slow start: no shadows, no bloom, fewer pixels. */
  readonly low: () => boolean
  /** Drops to the light mode (called when the frame rate stays low). */
  readonly goLow: () => void
}

/** Phones and tablets start in the light mode: fast, and no shadow-map artefacts on mobile GPUs. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

/** Renderer, camera, bright cave lighting and (on capable devices) shadows and a soft bloom. */
export function createStage(canvas: HTMLCanvasElement): Stage {
  let low = isMobileDevice()
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance', precision: 'highp' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.25 : 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.3
  renderer.shadowMap.enabled = !low
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const bg = new THREE.Color(0x2a1c44)
  scene.background = bg
  scene.fog = new THREE.Fog(bg, 42, 90)

  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 200)
  camera.position.set(0, 18, 36)

  // A bright, warm cave: strong sky/ground fill so nothing ever falls into pure black.
  scene.add(new THREE.HemisphereLight(0xc4b6ff, 0x5a3a26, 1.45))
  scene.add(new THREE.AmbientLight(0xffffff, 0.35))

  const keyLight = new THREE.DirectionalLight(0xfff0d6, 2.3)
  keyLight.position.set(12, 34, 16)
  keyLight.castShadow = !low
  keyLight.shadow.mapSize.set(2048, 2048)
  const sc = keyLight.shadow.camera
  sc.left = -34
  sc.right = 34
  sc.top = 34
  sc.bottom = -34
  sc.near = 5
  sc.far = 90
  keyLight.shadow.bias = -0.0006
  keyLight.shadow.normalBias = 0.04
  scene.add(keyLight)
  scene.add(keyLight.target)

  // The hoard lights the dragon from below.
  const hoardGlow = new THREE.PointLight(0xffa62b, 14, 26, 1.6)
  hoardGlow.position.set(0, 6, 0)
  scene.add(hoardGlow)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.4, 0.92)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  function resize(): void {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    bloom.resolution.set(w, h)
    camera.aspect = w / h
    // Portrait phones need a wider view to see the same arena.
    camera.fov = w < h ? 62 : 48
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  function goLow(): void {
    if (low) return
    low = true
    renderer.shadowMap.enabled = false
    keyLight.castShadow = false
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    resize()
    // Materials compiled with shadows must recompile without them.
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true))
      else if (m !== undefined) (m as THREE.Material).needsUpdate = true
    })
  }

  return {
    renderer,
    scene,
    camera,
    keyLight,
    render: () => (low ? renderer.render(scene, camera) : composer.render()),
    resize,
    low: () => low,
    goLow,
  }
}
