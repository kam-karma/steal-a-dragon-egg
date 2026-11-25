import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const cache = new Map<string, Promise<GLTF>>()

/** Loads public/models/<name>.glb once (relative URL: Poki serves the game from a sub-path). */
export function loadModel(name: string): Promise<GLTF> {
  const hit = cache.get(name)
  if (hit !== undefined) return hit
  const p = loader.loadAsync(`./models/${name}.glb`)
  cache.set(name, p)
  return p
}
