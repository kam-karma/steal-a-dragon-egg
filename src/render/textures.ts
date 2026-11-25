import * as THREE from 'three'
import { rngFrom } from '../sim/rng'

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  if (g === null) throw new Error('2D canvas is not available')
  draw(g, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Irregular flagstones with dark grout: reads as "stone = quiet" next to the gold. */
export function stoneTexture(): THREE.CanvasTexture {
  const rand = rngFrom(11)
  const t = canvasTexture(512, (g, s) => {
    g.fillStyle = '#2a2230'
    g.fillRect(0, 0, s, s)
    const cells = 7
    const cw = s / cells
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const shade = 62 + Math.floor(rand() * 26)
        g.fillStyle = `rgb(${shade + 8},${shade - 2},${shade + 14})`
        const j = () => (rand() - 0.5) * cw * 0.18
        g.beginPath()
        g.moveTo(x * cw + 4 + j(), y * cw + 4 + j())
        g.lineTo((x + 1) * cw - 4 + j(), y * cw + 4 + j())
        g.lineTo((x + 1) * cw - 4 + j(), (y + 1) * cw - 4 + j())
        g.lineTo(x * cw + 4 + j(), (y + 1) * cw - 4 + j())
        g.closePath()
        g.fill()
        for (let k = 0; k < 30; k++) {
          g.fillStyle = `rgba(0,0,0,${rand() * 0.12})`
          g.fillRect(x * cw + rand() * cw, y * cw + rand() * cw, 3 + rand() * 8, 2 + rand() * 5)
        }
      }
    }
  })
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(9, 9)
  t.anisotropy = 8
  return t
}

export function glowTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
  })
}

export function starTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (g, s) => {
    g.translate(s / 2, s / 2)
    g.fillStyle = '#fff'
    g.beginPath()
    for (let k = 0; k < 8; k++) {
      const r = k % 2 === 0 ? s * 0.48 : s * 0.12
      const a = (k / 8) * Math.PI * 2
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    g.closePath()
    g.fill()
  })
}

export function letterTexture(text: string, color: string): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    g.font = `900 ${s * 0.7}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineWidth = s * 0.08
    g.strokeStyle = 'rgba(20,10,40,0.85)'
    g.strokeText(text, s / 2, s / 2)
    g.fillStyle = color
    g.fillText(text, s / 2, s / 2)
  })
}

/** Name tag above a thief. */
export function labelSprite(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')
  if (g === null) throw new Error('2D canvas is not available')
  g.font = '800 38px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 8
  g.strokeStyle = 'rgba(15,8,30,0.9)'
  g.strokeText(text, 128, 34)
  g.fillStyle = color
  g.fillText(text, 128, 34)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }))
  s.scale.set(2.6, 0.65, 1)
  return s
}
