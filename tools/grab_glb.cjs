// Wait for a new GLB (with or without skin) in Downloads newer than a reference file, then move it.
// node tools/grab_glb.cjs <refFile> <dest> <skin|static> [timeoutSec]
const fs = require('fs'), path = require('path'), os = require('os')
const [ref, dest, kind, tmo = '150'] = process.argv.slice(2)
const dl = path.join(os.homedir(), 'Downloads')
const since = fs.statSync(ref).mtimeMs
const seen = new Set()
const end = Date.now() + Number(tmo) * 1000
function check() {
  for (const f of fs.readdirSync(dl)) {
    if (!f.endsWith('.tmp') && !f.endsWith('.glb')) continue
    const p = path.join(dl, f)
    const st = fs.statSync(p)
    if (st.mtimeMs <= since || seen.has(p)) continue
    const b = fs.readFileSync(p)
    if (b.toString('ascii', 0, 4) !== 'glTF' || b.readUInt32LE(8) !== b.length) continue
    const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString())
    const skinned = (j.skins || []).length > 0
    if ((kind === 'skin') !== skinned) { seen.add(p); continue }
    fs.renameSync(p, dest)
    console.log('saved', dest, (b.length / 1e6).toFixed(2) + 'MB', 'anims', (j.animations || []).map((a) => a.name).join(','))
    return true
  }
  return false
}
const t = setInterval(() => { if (check()) { clearInterval(t) } else if (Date.now() > end) { clearInterval(t); console.log('timeout'); process.exitCode = 1 } }, 2000)
