// Generate one image with a Gemini image model (Nano Banana family).
// node tools/gemini-image.mjs <model> <out.png> <aspect e.g. 1:1> <prompt...> [--ref path.png]...
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { geminiKey } from './gemini-env.mjs'

const args = process.argv.slice(2)
const refs = []
for (let i = args.indexOf('--ref'); i !== -1; i = args.indexOf('--ref')) {
  refs.push(args[i + 1])
  args.splice(i, 2)
}
const [model, out, aspect, ...words] = args
const prompt = words.join(' ')
if (!model || !out || !prompt) {
  console.error('usage: gemini-image.mjs <model> <out.png> <aspect> <prompt> [--ref img]')
  process.exit(2)
}

const parts = [
  ...refs.map((p) => ({ inlineData: { mimeType: 'image/png', data: readFileSync(p).toString('base64') } })),
  { text: prompt },
]
const body = {
  contents: [{ role: 'user', parts }],
  generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } },
}
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
const r = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': geminiKey(), 'content-type': 'application/json' }, body: JSON.stringify(body) })
const j = await r.json()
if (!r.ok) {
  console.error('HTTP', r.status, JSON.stringify(j.error ?? j).slice(0, 400))
  process.exit(1)
}
const img = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData
if (!img) {
  console.error('no image in response', JSON.stringify(j).slice(0, 400))
  process.exit(1)
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(img.data, 'base64'))
console.log('saved', out, img.mimeType, Math.round(img.data.length * 0.75 / 1024), 'KB')
