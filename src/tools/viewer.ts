import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { applyPose, AWAKE_POSE, findBones, SLEEP_POSE } from '../render/dragonPose'

/** Dev-only: /viewer.html?m=<url> shows a model in the game's own engine, with its clips and bones. */
const canvas = document.getElementById('c') as HTMLCanvasElement
const info = document.getElementById('info') as HTMLDivElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x2a2a33)
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2))
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 5, 4)
scene.add(sun)
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 10000)
const controls = new OrbitControls(camera, canvas)
const clock = new THREE.Clock()
let mixer: THREE.AnimationMixer | null = null

const url = new URLSearchParams(location.search).get('m') ?? ''
new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
  url,
  (gltf) => {
    const root = gltf.scene
    scene.add(root)
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const r = Math.max(size.x, size.y, size.z)
    camera.position.copy(center).add(new THREE.Vector3(0.8, 0.6, 1.2).multiplyScalar(r))
    controls.target.copy(center)
    controls.update()
    const helper = new THREE.SkeletonHelper(root)
    scene.add(helper)
    mixer = new THREE.AnimationMixer(root)
    const bones: string[] = []
    let tris = 0
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o.name)
      const m = o as THREE.Mesh
      if (m.isMesh) tris += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3
    })
    info.textContent = `${url}\nboyut ${size.toArray().map((v) => v.toFixed(2)).join(' × ')}\nüçgen ${tris}\nklipler:\n`
    gltf.animations.forEach((clip) => {
      const b = document.createElement('button')
      b.textContent = `${clip.name} (${clip.duration.toFixed(2)} sn)`
      b.onclick = () => {
        mixer?.stopAllAction()
        mixer?.clipAction(clip).play()
      }
      info.appendChild(b)
    })
    info.appendChild(document.createTextNode(`\nkemikler (${bones.length}): ${bones.join(', ')}`))
    const params = new URLSearchParams(location.search)
    const pose = params.get('pose')
    if (pose !== null) {
      const rig = findBones(root)
      applyPose(rig, pose === 'awake' ? AWAKE_POSE : SLEEP_POSE)
      helper.visible = false
      info.style.display = 'none'
      const view = params.get('view') ?? 'game'
      const dir = view === 'top' ? new THREE.Vector3(0, 1, 0.01) : view === 'side' ? new THREE.Vector3(1, 0.15, 0) : new THREE.Vector3(0, 0.75, -0.85)
      camera.position.copy(center).add(dir.normalize().multiplyScalar(r * 1.1))
      controls.update()
    }
    ;(window as unknown as Record<string, unknown>).__viewer = { root, gltf, mixer, camera, controls, helper, THREE }
  },
  undefined,
  (err) => (info.textContent = `Yüklenemedi: ${String(err)}`),
)

function loop(): void {
  mixer?.update(clock.getDelta())
  controls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(loop)
}
loop()
