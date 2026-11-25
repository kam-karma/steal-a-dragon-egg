// Print a GLB's node hierarchy with world-space positions (rest pose), for wiring procedural rigs.
import fs from 'node:fs'
import * as THREE from 'three'
const b = fs.readFileSync(process.argv[2])
const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString())
const local = j.nodes.map((n) => {
  const m = new THREE.Matrix4()
  if (n.matrix) m.fromArray(n.matrix)
  else m.compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])))
  return m
})
const parent = new Map()
j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)))
const world = (i) => (parent.has(i) ? world(parent.get(i)).clone().multiply(local[i]) : local[i].clone())
const depth = (i) => (parent.has(i) ? depth(parent.get(i)) + 1 : 0)
const roots = j.nodes.map((_, i) => i).filter((i) => !parent.has(i))
const walk = (i) => {
  const p = new THREE.Vector3().setFromMatrixPosition(world(i))
  console.log(' '.repeat(depth(i)) + (j.nodes[i].name ?? i), p.toArray().map((v) => v.toFixed(2)).join(','))
  ;(j.nodes[i].children ?? []).forEach(walk)
}
roots.forEach(walk)
