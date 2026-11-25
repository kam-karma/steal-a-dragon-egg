import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Dev-only: POST /__art?name=foo.png stores the body in art/raw/.
 * Used to pull images generated in AI Studio (browser) straight into the project.
 * Only AI Studio may call it, names are sanitised, and it never exists in a build.
 */
function artInbox(): Plugin {
  const allowed = 'https://aistudio.google.com'
  return {
    name: 'art-inbox',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__art', (req, res) => {
        const origin = req.headers.origin ?? ''
        if (origin !== allowed) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }
        res.setHeader('Access-Control-Allow-Origin', allowed)
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'content-type')
        res.setHeader('Access-Control-Allow-Private-Network', 'true')
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? ''
        if (req.method !== 'POST' || !/^[a-z0-9_-]{1,60}\.(png|jpg|webp)$/.test(name)) {
          res.statusCode = 400
          res.end('bad request')
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (c: Buffer) => {
          size += c.length
          if (size < 20_000_000) chunks.push(c)
        })
        req.on('end', () => {
          const dir = resolve(__dirname, 'art/raw')
          mkdirSync(dir, { recursive: true })
          writeFileSync(resolve(dir, name), Buffer.concat(chunks))
          res.end(`saved ${name} ${size}`)
        })
      })
    },
  }
}


/**
 * Dev-only: GET /__concept/<name> serves art/concept images to Tripo Studio, so a
 * concept made in AI Studio can be handed to Tripo without a file picker.
 */
function conceptOutbox(): Plugin {
  const allowed = 'https://studio.tripo3d.ai'
  return {
    name: 'concept-outbox',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__concept', (req, res) => {
        const origin = req.headers.origin ?? ''
        if (origin !== allowed) {
          res.statusCode = 403
          res.end('forbidden')
          return
        }
        res.setHeader('Access-Control-Allow-Origin', allowed)
        res.setHeader('Access-Control-Allow-Private-Network', 'true')
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'GET')
          res.statusCode = 204
          res.end()
          return
        }
        const name = (req.url ?? '').replace(/^\//, '')
        const file = resolve(__dirname, 'art/concept', name)
        if (!/^[a-z0-9_-]{1,60}\.(png|jpg)$/.test(name) || !existsSync(file)) {
          res.statusCode = 404
          res.end('not found')
          return
        }
        res.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : 'image/jpeg')
        res.end(readFileSync(file))
      })
    },
  }
}

// Poki serves a game from a sub-path, so every asset URL must be relative.
export default defineConfig({
  base: './',
  plugins: [artInbox(), conceptOutbox()],
  // Our art inbox answers its own CORS; Vite's default CORS would swallow the preflight.
  server: { cors: false },
  build: {
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/sim/**'],
      exclude: ['src/sim/**/*.test.ts', 'src/sim/types.ts', 'src/sim/testUtil.ts'],
    },
  },
})
