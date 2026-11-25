import { geminiKey } from './gemini-env.mjs'
const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': geminiKey() } })
const j = await r.json()
if (!r.ok) { console.log('HTTP', r.status, JSON.stringify(j).slice(0, 300)); process.exit(1) }
for (const m of j.models ?? []) if (/image|imagen|banana/i.test(m.name + m.displayName)) console.log(m.name, '|', m.displayName, '|', (m.supportedGenerationMethods || []).join(','))
