// Print a short summary of a GLB: meshes, triangles, skins, bones, animations, images.
const fs = require('fs')
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f)
  if (b.toString('ascii', 0, 4) !== 'glTF') { console.log(f, 'not a GLB'); continue }
  const len = b.readUInt32LE(12)
  const j = JSON.parse(b.slice(20, 20 + len).toString())
  const tris = (j.meshes || []).map((m) => m.primitives.reduce((s, p) => s + (j.accessors[p.indices]?.count ?? 0) / 3, 0))
  console.log(f, (b.length / 1e6).toFixed(2) + 'MB', 'tris', tris, 'skins', (j.skins || []).length,
    'bones', j.skins?.[0]?.joints.length ?? 0, 'anims', (j.animations || []).map((a) => a.name), 'images', (j.images || []).length)
}
