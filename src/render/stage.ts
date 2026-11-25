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
}

/** Renderer, camera, cave lighting and a soft bloom so gold, eyes and fire glow. */
export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const bg = new THREE.Color(0x150d22)
  scene.background = bg
  scene.fog = new THREE.Fog(bg, 38, 80)

  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 200)
  camera.position.set(0, 18, 36)

  scene.add(new THREE.HemisphereLight(0x9d8cff, 0x2b1a12, 0.9))

  const keyLight = new THREE.DirectionalLight(0xffe2b8, 1.9)
  keyLight.position.set(12, 34, 16)
  keyLight.castShadow = true
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
  const hoardGlow = new THREE.PointLight(0xffa62b, 12, 24, 1.6)
  hoardGlow.position.set(0, 6, 0)
  scene.add(hoardGlow)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.4, 0.92)
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

  return { renderer, scene, camera, keyLight, render: () => composer.render(), resize }
}
