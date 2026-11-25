import type { Rarity } from './sim/types'

/** Every sound is synthesized: no files to download, tiny build. */
export interface Sfx {
  readonly unlock: () => void
  readonly jingle: (near: number) => void
  readonly snore: (inhale: boolean) => void
  readonly heartbeat: (strength: number) => void
  readonly pickup: (r: Rarity) => void
  readonly deliver: () => void
  readonly hatch: (r: Rarity) => void
  readonly coin: () => void
  readonly stir: () => void
  readonly roar: () => void
  readonly fire: () => void
  readonly burned: () => void
  readonly alarm: () => void
  readonly clang: () => void
  readonly fanfare: () => void
  readonly sneeze: () => void
  readonly shiny: () => void
  readonly levelUp: () => void
  readonly grab: () => void
  readonly toggleMute: () => boolean
  /** Silence everything while an ad plays. */
  readonly setPaused: (paused: boolean) => void
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = false
  let noiseBuf: AudioBuffer | null = null

  function now(): number {
    return ctx?.currentTime ?? 0
  }

  function tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (ctx === null || master === null) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, at)
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur)
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(g).connect(master)
    o.start(at)
    o.stop(at + dur + 0.05)
  }

  function noise(at: number, dur: number, type: BiquadFilterType, freq: number, vol: number, sweepTo?: number, attack = 0.3): void {
    if (ctx === null || master === null || noiseBuf === null) return
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, at)
    if (sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(vol, at + dur * attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    src.connect(f).connect(g).connect(master)
    src.start(at)
    src.stop(at + dur + 0.05)
  }

  function unlock(): void {
    if (ctx !== null) {
      void ctx.resume()
      return
    }
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.7
    master.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1
  }

  return {
    unlock,
    jingle: (near) => {
      const t = now()
      for (let k = 0; k < 3; k++) tone(2200 + Math.random() * 2200, t + k * 0.035, 0.12, 'sine', 0.05 * near)
    },
    snore: (inhale) => {
      const t = now()
      if (inhale) noise(t, 1.4, 'bandpass', 300, 0.05, 700, 0.6)
      else {
        noise(t, 1.6, 'lowpass', 220, 0.09, 120, 0.15)
        tone(62, t, 1.4, 'sawtooth', 0.03, 48)
      }
    },
    heartbeat: (s) => {
      const t = now()
      tone(55, t, 0.16, 'sine', 0.25 * s, 40)
      tone(52, t + 0.2, 0.16, 'sine', 0.18 * s, 38)
    },
    pickup: (r) => {
      const t = now()
      tone(520 + r * 120, t, 0.12, 'triangle', 0.18, 1100 + r * 200)
    },
    deliver: () => {
      const t = now()
      ;[784, 988, 1175].forEach((f, k) => tone(f, t + k * 0.08, 0.25, 'triangle', 0.16))
    },
    hatch: (r) => {
      const t = now()
      noise(t, 0.15, 'highpass', 2500, 0.18, undefined, 0.1)
      const notes = [523, 659, 784, 1047, 1319, 1568]
      for (let k = 0; k < 3 + r; k++) tone(notes[k % notes.length], t + 0.1 + k * 0.07, 0.3, 'sine', 0.13)
    },
    coin: () => {
      const t = now()
      tone(1319, t, 0.08, 'square', 0.04)
      tone(1760, t + 0.07, 0.14, 'square', 0.04)
    },
    stir: () => {
      const t = now()
      tone(70, t, 1.2, 'sawtooth', 0.09, 95)
      noise(t, 1.2, 'lowpass', 180, 0.1)
    },
    roar: () => {
      const t = now()
      tone(110, t, 1.6, 'sawtooth', 0.22, 45)
      tone(165, t, 1.4, 'square', 0.08, 60)
      noise(t, 1.8, 'lowpass', 900, 0.35, 200, 0.12)
    },
    fire: () => {
      const t = now()
      noise(t, 4.5, 'lowpass', 1400, 0.3, 600, 0.05)
      noise(t, 4.5, 'bandpass', 300, 0.2, 200, 0.05)
    },
    burned: () => {
      const t = now()
      tone(600, t, 0.5, 'triangle', 0.2, 120)
      noise(t, 0.3, 'bandpass', 800, 0.12)
    },
    alarm: () => {
      const t = now()
      for (let k = 0; k < 3; k++) {
        tone(880, t + k * 0.28, 0.13, 'square', 0.07)
        tone(660, t + k * 0.28 + 0.14, 0.13, 'square', 0.07)
      }
    },
    clang: () => {
      const t = now()
      ;[523, 740, 1046, 1480].forEach((f) => tone(f, t, 0.9, 'square', 0.06, f * 0.98))
      noise(t, 0.4, 'highpass', 3000, 0.25, undefined, 0.02)
    },
    fanfare: () => {
      const t = now()
      ;[523, 659, 784, 1047, 784, 1047].forEach((f, k) => tone(f, t + k * 0.11, 0.22, 'triangle', 0.14))
    },
    sneeze: () => {
      const t = now()
      noise(t, 0.5, 'bandpass', 900, 0.15, 2500, 0.8)
      noise(t + 0.5, 0.6, 'lowpass', 1800, 0.45, 300, 0.05)
      tone(220, t + 0.5, 0.4, 'sawtooth', 0.12, 90)
    },
    shiny: () => {
      const t = now()
      ;[1319, 1568, 1976, 2637, 3136].forEach((f, k) => tone(f, t + k * 0.06, 0.4, 'sine', 0.09))
    },
    levelUp: () => {
      const t = now()
      ;[392, 523, 659, 784].forEach((f, k) => tone(f, t + k * 0.08, 0.3, 'square', 0.06))
    },
    grab: () => {
      const t = now()
      tone(400, t, 0.1, 'square', 0.08, 900)
      tone(900, t + 0.1, 0.12, 'triangle', 0.1, 1400)
    },
    setPaused: (paused) => {
      if (ctx === null) return
      void (paused ? ctx.suspend() : ctx.resume())
    },
    toggleMute: () => {
      muted = !muted
      if (master !== null) master.gain.value = muted ? 0 : 0.7
      return muted
    },
  }
}
