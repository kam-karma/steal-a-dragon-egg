import { LOOP_STEPS, type MusicMode, type Note, notesAt, TEMPO } from './musicScore'

/** Where the music plays: the game's audio context and its master bus (so mute and ads apply). */
export interface AudioBus {
  readonly ctx: AudioContext
  readonly out: AudioNode
}

export interface Music {
  readonly setMode: (mode: MusicMode) => void
}

const LOOKAHEAD = 0.25
const VOLUME = 0.45

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12)

/** A short stone-cave reverb: decaying stereo noise as the impulse response. */
function caveReverb(ctx: AudioContext): ConvolverNode {
  const len = Math.floor(ctx.sampleRate * 1.8)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6
  }
  const conv = ctx.createConvolver()
  conv.buffer = ir
  return conv
}

interface Rig {
  readonly ctx: AudioContext
  readonly dry: GainNode
  readonly wet: GainNode
  readonly noise: AudioBuffer
}

function envGain(r: Rig, at: number, attack: number, peak: number, decay: number, send: number): GainNode {
  const g = r.ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  g.connect(r.dry)
  if (send > 0) {
    const s = r.ctx.createGain()
    s.gain.value = send
    g.connect(s).connect(r.wet)
  }
  return g
}

function osc(r: Rig, type: OscillatorType, freq: number, at: number, dur: number, to: AudioNode, detune = 0): void {
  const o = r.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  o.detune.value = detune
  o.connect(to)
  o.start(at)
  o.stop(at + dur + 0.05)
}

function lowpass(r: Rig, freq: number, to: AudioNode, q = 0.8): BiquadFilterNode {
  const f = r.ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = freq
  f.Q.value = q
  f.connect(to)
  return f
}

function noiseHit(r: Rig, at: number, type: BiquadFilterType, freq: number, vol: number, decay: number): void {
  const src = r.ctx.createBufferSource()
  src.buffer = r.noise
  const f = r.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  src.connect(f).connect(envGain(r, at, 0.002, vol, decay, 0.15))
  src.start(at)
  src.stop(at + decay + 0.05)
}

/** One note of one instrument, built from oscillators and filters (no audio files to load). */
function play(r: Rig, n: Note, at: number, stepSec: number): void {
  const f = n.midi === null ? 0 : mtof(n.midi)
  const v = n.vel
  switch (n.voice) {
    case 'bass': // plucked double bass
      osc(r, 'triangle', f, at, 0.6, lowpass(r, 600, envGain(r, at, 0.005, 0.5 * v, 0.45, 0.1)))
      break
    case 'pluck': // pizzicato strings: two detuned saws through a closing filter
      ;[-6, 6].forEach((d) => osc(r, 'sawtooth', f, at, 0.35, lowpass(r, 1700, envGain(r, at, 0.004, 0.09 * v, 0.28, 0.35)), d))
      break
    case 'bell': // celesta: sine plus a bright inharmonic partial
      osc(r, 'sine', f, at, 1.3, envGain(r, at, 0.003, 0.12 * v, 1.2, 0.6))
      osc(r, 'sine', f * 3.5, at, 0.5, envGain(r, at, 0.002, 0.03 * v, 0.4, 0.6))
      break
    case 'tick': // brushed hi-hat
      noiseHit(r, at, 'highpass', 7000, 0.05 * v, 0.06)
      break
    case 'block': // woodblock
      osc(r, 'sine', 950, at, 0.08, envGain(r, at, 0.001, 0.12 * v, 0.06, 0.2))
      break
    case 'ostinato': // staccato strings
      ;[-8, 8].forEach((d) => osc(r, 'sawtooth', f, at, stepSec, lowpass(r, 2200, envGain(r, at, 0.005, 0.06 * v, stepSec * 0.8, 0.2)), d))
      break
    case 'stab': // brass stab
      osc(r, 'sawtooth', f, at, 0.3, lowpass(r, 1500, envGain(r, at, 0.02, 0.07 * v, 0.25, 0.3), 2))
      break
    case 'drum': {
      // timpani: a sine that drops in pitch plus a soft thud
      const g = envGain(r, at, 0.004, 0.45 * v, 0.5, 0.25)
      const o = r.ctx.createOscillator()
      o.frequency.setValueAtTime(95, at)
      o.frequency.exponentialRampToValueAtTime(55, at + 0.4)
      o.connect(g)
      o.start(at)
      o.stop(at + 0.6)
      noiseHit(r, at, 'lowpass', 300, 0.12 * v, 0.12)
      break
    }
    case 'xylo':
      osc(r, 'triangle', f, at, 0.25, envGain(r, at, 0.002, 0.14 * v, 0.2, 0.3))
      osc(r, 'sine', f * 4, at, 0.1, envGain(r, at, 0.001, 0.03 * v, 0.08, 0.3))
      break
  }
}

/**
 * Plays the score with a small look-ahead scheduler. Starts once the audio bus exists
 * (after the first gesture); switching mode takes effect on the next bar.
 */
/** Builds the instrument rig (volume, cave reverb, noise source) on an audio bus. */
function makeRig(b: AudioBus): Rig {
  const master = b.ctx.createGain()
  master.gain.value = VOLUME
  master.connect(b.out)
  const dry = b.ctx.createGain()
  dry.connect(master)
  const wet = b.ctx.createGain()
  wet.gain.value = 0.5
  wet.connect(caveReverb(b.ctx)).connect(master)
  const noise = b.ctx.createBuffer(1, b.ctx.sampleRate, b.ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return { ctx: b.ctx, dry, wet, noise }
}

/** Schedules a whole loop at once (used to check the mix offline with an OfflineAudioContext). */
export function scheduleLoop(b: AudioBus, mode: MusicMode, start = 0): number {
  const r = makeRig(b)
  const stepSec = 60 / TEMPO[mode] / 4
  for (let s = 0; s < LOOP_STEPS; s++) notesAt(mode, s).forEach((n) => play(r, n, start + s * stepSec, stepSec))
  return LOOP_STEPS * stepSec
}

export function createMusic(bus: () => AudioBus | null): Music {
  let rig: Rig | null = null
  let mode: MusicMode = 'calm'
  let wanted: MusicMode = 'calm'
  let step = 0
  let nextAt = 0

  function build(b: AudioBus): Rig {
    nextAt = b.ctx.currentTime + 0.1
    return makeRig(b)
  }

  function tick(): void {
    // A hidden tab freezes the game; the music waits too instead of playing in bursts.
    if (document.hidden) return
    if (rig === null) {
      const b = bus()
      if (b === null || b.ctx.state !== 'running') return
      rig = build(b)
    }
    if (rig.ctx.state !== 'running') return
    const now = rig.ctx.currentTime
    if (nextAt < now - 0.5) nextAt = now + 0.05 // came back from a pause: don't play the backlog
    while (nextAt < now + LOOKAHEAD) {
      if (step % 16 === 0 && wanted !== mode) mode = wanted
      const stepSec = 60 / TEMPO[mode] / 4
      const r = rig
      notesAt(mode, step).forEach((n) => play(r, n, nextAt, stepSec))
      nextAt += stepSec
      step = (step + 1) % LOOP_STEPS
    }
  }

  window.setInterval(tick, 60)
  return { setMode: (m) => (wanted = m) }
}
