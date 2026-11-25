import { readFileSync } from 'node:fs'
/** Reads GEMINI_API_KEY from .env.local (never printed). */
export function geminiKey() {
  const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='))
  if (!line) throw new Error('GEMINI_API_KEY missing in .env.local')
  return line.slice('GEMINI_API_KEY='.length).trim()
}
