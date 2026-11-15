/**
 * NightWatch sound effects — every sound is synthesised with the Web Audio API
 * (no audio files, no dependencies, nothing copyrighted).
 *
 * Character: shortwave static, corrupted transmissions, low synthetic clicks,
 * metallic electronic textures. Short and quiet by design.
 *
 *   sfx.play('click')      buttons (wired globally in SfxBridge)
 *   sfx.play('nav')        sidebar navigation — a burst of gated, band-hopping static
 *   sfx.play('collapse')   sidebar collapse/expand and drawer open/close
 *   sfx.play('create')     investigation created — a dark two-pulse confirmation
 *   sfx.play('alert')      warnings/errors — AM interference with a detuned wobble
 *   sfx.play('processing') work started — soft rising ticks
 *   sfx.play('complete')   work finished — a low, filtered resolve
 *
 * Behaviour:
 *  - Muted by default; the preference (enabled + volume) is saved locally.
 *  - The AudioContext is only created when sound is switched on, which happens in a
 *    click handler, so browser autoplay rules are satisfied.
 *  - Overlap control: retriggering a sound cuts its previous instance; a generic
 *    'click' is cut when a more specific sound follows it within 90ms (a button whose
 *    handler plays its own sound); at most MAX_VOICES play at once.
 */

export type SfxName = 'click' | 'nav' | 'collapse' | 'create' | 'alert' | 'processing' | 'complete'

export const SFX_NAMES: readonly SfxName[] = ['click', 'nav', 'collapse', 'create', 'alert', 'processing', 'complete']

export interface SfxPrefs {
  enabled: boolean
  volume: number
}

const PREFS_KEY = 'nightwatch.sfx'
const DEFAULT_PREFS: SfxPrefs = { enabled: false, volume: 0.6 }
const MAX_VOICES = 6
const CLICK_CUT_WINDOW = 0.09

/**
 * Per-sound loudness trim, set from offline measurements (RMS of each raw voice) so
 * the set sits at one consistent, restrained level. Clicks are deliberately the
 * quietest; alerts slightly forward so warnings register.
 *   raw RMS → target: click .25→.022, collapse .30→.032, nav .065→.038,
 *   create .027→.03, alert .023→.036, processing .015→.02, complete .031→.03
 */
const TRIM: Record<SfxName, number> = {
  click: 0.088,
  collapse: 0.107,
  nav: 0.58,
  create: 1.1,
  alert: 1.6,
  processing: 1.38,
  complete: 0.97,
}

/* ───────────── Synthesis helpers ───────────── */

type Ctx = BaseAudioContext

function noiseBuffer(ctx: Ctx) {
  const length = Math.floor(ctx.sampleRate * 1.5)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let seed = 1234567
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    data[i] = seed / 2147483648 - 1
  }
  return buffer
}

/** Soft-clip curve: adds grit without harsh digital clipping. */
function driveCurve(amount: number) {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  return curve
}

interface Kit {
  ctx: Ctx
  out: AudioNode
  t: number
  noise: AudioBuffer
}

function env(ctx: Ctx, t: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  return g
}

function noiseSource(k: Kit, start: number, duration: number, offset = Math.random()) {
  const src = k.ctx.createBufferSource()
  src.buffer = k.noise
  src.start(start, offset, duration + 0.05)
  return src
}

/* ───────────── Voices (each returns its length in seconds) ───────────── */

type Voice = (k: Kit) => number

const voices: Record<SfxName, Voice> = {
  // A low synthetic tick with a faint metallic glint.
  click: (k) => {
    const { ctx, out, t } = k
    const body = ctx.createOscillator()
    body.type = 'triangle'
    body.frequency.setValueAtTime(190, t)
    body.frequency.exponentialRampToValueAtTime(85, t + 0.045)
    const bodyEnv = env(ctx, t, 0.32, 0.002, 0.05)
    body.connect(bodyEnv).connect(out)
    body.start(t)
    body.stop(t + 0.07)

    const tick = noiseSource(k, t, 0.02)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3200
    const tickEnv = env(ctx, t, 0.12, 0.001, 0.012)
    tick.connect(hp).connect(tickEnv).connect(out)

    const glint = ctx.createOscillator()
    glint.type = 'sine'
    glint.frequency.value = 1380 + Math.random() * 120
    const glintEnv = env(ctx, t + 0.004, 0.025, 0.002, 0.03)
    glint.connect(glintEnv).connect(out)
    glint.start(t)
    glint.stop(t + 0.06)
    return 0.08
  },

  // Corrupted transmission: static that hops between bands and cuts in and out,
  // under a stepped, gritty square tone falling in pitch.
  nav: (k) => {
    const { ctx, out, t } = k
    const length = 0.27
    const src = noiseSource(k, t, length)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 2.2
    const hops = [1900, 650, 2800, 1200, 3400, 900]
    hops.forEach((f, i) => bp.frequency.setValueAtTime(f, t + i * 0.042))
    const gate = ctx.createGain()
    gate.gain.setValueAtTime(0, t)
    // Stutter: on/off segments, decaying.
    const segments: [number, number, number][] = [[0, 0.03, 0.55], [0.045, 0.085, 0.4], [0.1, 0.15, 0.5], [0.17, 0.2, 0.28], [0.22, 0.25, 0.14]]
    segments.forEach(([a, b, level]) => {
      gate.gain.setValueAtTime(level, t + a)
      gate.gain.setValueAtTime(0, t + b)
    })
    src.connect(bp).connect(gate).connect(out)

    const tone = ctx.createOscillator()
    tone.type = 'square'
    ;[440, 220, 330, 110, 165].forEach((f, i) => tone.frequency.setValueAtTime(f, t + i * 0.05))
    const crush = ctx.createWaveShaper()
    crush.curve = driveCurve(6)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1400
    const toneEnv = env(ctx, t, 0.07, 0.004, 0.24)
    tone.connect(crush).connect(lp).connect(toneEnv).connect(out)
    tone.start(t)
    tone.stop(t + length)
    return length + 0.03
  },

  // Mechanical-digital: a latch click, a filtered noise sweep, a low thunk.
  collapse: (k) => {
    const { ctx, out, t } = k
    const src = noiseSource(k, t, 0.2)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 6
    lp.frequency.setValueAtTime(4200, t)
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.18)
    const sweepEnv = env(ctx, t, 0.16, 0.01, 0.17)
    src.connect(lp).connect(sweepEnv).connect(out)

    const thunk = ctx.createOscillator()
    thunk.type = 'sine'
    thunk.frequency.setValueAtTime(120, t + 0.02)
    thunk.frequency.exponentialRampToValueAtTime(48, t + 0.16)
    const thunkEnv = env(ctx, t + 0.02, 0.35, 0.004, 0.15)
    thunk.connect(thunkEnv).connect(out)
    thunk.start(t)
    thunk.stop(t + 0.22)

    const latch = noiseSource(k, t, 0.015)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2400
    const latchEnv = env(ctx, t, 0.18, 0.001, 0.01)
    latch.connect(hp).connect(latchEnv).connect(out)
    return 0.24
  },

  // Dark confirmation: a crackle, then two low filtered pulses (minor, rising).
  create: (k) => {
    const { ctx, out, t } = k
    const crackle = noiseSource(k, t, 0.06)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2200
    bp.Q.value = 1.5
    const crackleEnv = env(ctx, t, 0.12, 0.002, 0.05)
    crackle.connect(bp).connect(crackleEnv).connect(out)

    const pulse = (start: number, freqs: number[], level: number, decay: number) => {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(1600, start)
      lp.frequency.exponentialRampToValueAtTime(420, start + decay)
      const g = env(ctx, start, level, 0.012, decay)
      lp.connect(g).connect(out)
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = f
        osc.detune.value = i % 2 ? 7 : -7
        osc.connect(lp)
        osc.start(start)
        osc.stop(start + decay + 0.05)
      })
    }
    pulse(t + 0.05, [110, 130.8], 0.11, 0.18)
    pulse(t + 0.24, [146.8, 174.6, 220], 0.12, 0.42)
    return 0.72
  },

  // Interference: amplitude-modulated static plus a detuned, wobbling square pair, in three swells.
  alert: (k) => {
    const { ctx, out, t } = k
    const length = 0.78
    const src = noiseSource(k, t, length)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1250
    bp.Q.value = 3.5
    const am = ctx.createGain()
    am.gain.value = 0
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = 23
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = 0.5
    lfo.connect(lfoDepth).connect(am.gain)
    const swell = ctx.createGain()
    swell.gain.setValueAtTime(0, t)
    ;[0, 0.26, 0.52].forEach((s, i) => {
      swell.gain.linearRampToValueAtTime(0.32 - i * 0.07, t + s + 0.03)
      swell.gain.linearRampToValueAtTime(0.02, t + s + 0.22)
    })
    swell.gain.linearRampToValueAtTime(0, t + length)
    src.connect(bp).connect(am).connect(swell).connect(out)
    lfo.start(t)
    lfo.stop(t + length)

    const crush = ctx.createWaveShaper()
    crush.curve = driveCurve(4)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1100
    const toneGain = ctx.createGain()
    toneGain.gain.setValueAtTime(0, t)
    ;[0, 0.26, 0.52].forEach((s, i) => {
      toneGain.gain.linearRampToValueAtTime(0.06 - i * 0.012, t + s + 0.02)
      toneGain.gain.linearRampToValueAtTime(0.004, t + s + 0.2)
    })
    toneGain.gain.linearRampToValueAtTime(0, t + length)
    crush.connect(lp).connect(toneGain).connect(out)
    ;[311, 318.5].forEach((f) => {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.setValueAtTime(f, t)
      osc.frequency.linearRampToValueAtTime(f * 0.94, t + length)
      osc.connect(crush)
      osc.start(t)
      osc.stop(t + length)
    })
    return length + 0.04
  },

  // Processing: four soft ticks rising in pitch over a faint hiss.
  processing: (k) => {
    const { ctx, out, t } = k
    ;[0, 0.07, 0.14, 0.21].forEach((s, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 560 + i * 110
      const g = env(ctx, t + s, 0.07, 0.002, 0.045)
      osc.connect(g).connect(out)
      osc.start(t + s)
      osc.stop(t + s + 0.07)
    })
    const hiss = noiseSource(k, t, 0.32)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 5000
    const hissEnv = env(ctx, t, 0.03, 0.05, 0.26)
    hiss.connect(hp).connect(hissEnv).connect(out)
    return 0.36
  },

  // Completion: a low, filtered resolve with a faint detuned shimmer.
  complete: (k) => {
    const { ctx, out, t } = k
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1200
    lp.connect(out)
    ;[[196, 0, 0.12], [293.7, 0.11, 0.13]].forEach(([f, s, level]) => {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = f
      const g = env(ctx, t + s, level, 0.01, 0.38)
      osc.connect(g).connect(lp)
      osc.start(t + s)
      osc.stop(t + s + 0.45)
    })
    ;[1174, 1181].forEach((f) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f
      const g = env(ctx, t + 0.13, 0.012, 0.02, 0.3)
      osc.connect(g).connect(out)
      osc.start(t + 0.13)
      osc.stop(t + 0.5)
    })
    return 0.56
  },
}

/* ───────────── Engine ───────────── */

interface ActiveVoice {
  name: SfxName
  gain: GainNode
  startedAt: number
  endsAt: number
}

function loadPrefs(): SfxPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<SfxPrefs>
    return {
      enabled: parsed.enabled === true,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_PREFS.volume,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

class SfxEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private active: ActiveVoice[] = []
  private prefs: SfxPrefs = loadPrefs()
  private listeners = new Set<() => void>()

  getPrefs = () => this.prefs

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Call from a user gesture (it may create/resume the AudioContext). */
  setEnabled(enabled: boolean) {
    this.update({ ...this.prefs, enabled })
    if (enabled) this.ensureContext()
    else this.stopAll()
  }

  setVolume(volume: number) {
    this.update({ ...this.prefs, volume: Math.min(1, Math.max(0, volume)) })
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.gainFor(volume), this.ctx.currentTime, 0.02)
  }

  /** Whether the AudioContext exists — for verification; false while muted from the start. */
  get initialised() {
    return this.ctx !== null
  }

  play(name: SfxName) {
    if (!this.prefs.enabled) return
    const ctx = this.ensureContext()
    if (!ctx || !this.master || !this.noise) return
    window.dispatchEvent(new CustomEvent('nightwatch:sfx', { detail: name }))
    const now = ctx.currentTime
    this.active = this.active.filter((v) => v.endsAt > now)

    // Retrigger cuts the previous instance of the same sound; a specific sound
    // replaces a generic click that started a moment ago.
    this.active
      .filter((v) => v.name === name || (name !== 'click' && v.name === 'click' && now - v.startedAt < CLICK_CUT_WINDOW))
      .forEach((v) => this.cut(v, now))
    this.active = this.active.filter((v) => v.endsAt > now)
    if (this.active.length >= MAX_VOICES) this.cut(this.active[0], now)

    const voiceGain = ctx.createGain()
    voiceGain.gain.value = TRIM[name]
    voiceGain.connect(this.master)
    const length = voices[name]({ ctx, out: voiceGain, t: now + 0.005, noise: this.noise })
    const voice: ActiveVoice = { name, gain: voiceGain, startedAt: now, endsAt: now + length }
    this.active.push(voice)
    window.setTimeout(() => voiceGain.disconnect(), (length + 0.2) * 1000)
  }

  /** Renders one sound offline (no speakers) and reports its level — used for verification. */
  async analyse(name: SfxName) {
    const sampleRate = 22050
    const ctx = new OfflineAudioContext(1, Math.ceil(sampleRate * 1.2), sampleRate)
    const trim = ctx.createGain()
    trim.gain.value = TRIM[name]
    trim.connect(ctx.destination)
    const length = voices[name]({ ctx, out: trim, t: 0, noise: noiseBuffer(ctx) })
    const data = (await ctx.startRendering()).getChannelData(0)
    let peak = 0
    let sum = 0
    let lastAudible = 0
    for (let i = 0; i < data.length; i += 1) {
      const a = Math.abs(data[i])
      if (a > peak) peak = a
      sum += a * a
      if (a > 0.002) lastAudible = i
    }
    return {
      name,
      declaredMs: Math.round(length * 1000),
      audibleMs: Math.round((lastAudible / sampleRate) * 1000),
      peak: Number(peak.toFixed(3)),
      rms: Number(Math.sqrt(sum / Math.max(1, lastAudible)).toFixed(4)),
    }
  }

  private gainFor(volume: number) {
    // Perceptual curve; full volume stays restrained.
    return volume * volume * 0.7
  }

  private ensureContext() {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return null
    if (!this.ctx) {
      this.ctx = new AudioContext()
      const limiter = this.ctx.createDynamicsCompressor()
      limiter.threshold.value = -14
      limiter.ratio.value = 8
      limiter.attack.value = 0.002
      limiter.release.value = 0.12
      this.master = this.ctx.createGain()
      this.master.gain.value = this.gainFor(this.prefs.volume)
      this.master.connect(limiter).connect(this.ctx.destination)
      this.noise = noiseBuffer(this.ctx)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private cut(voice: ActiveVoice, now: number) {
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now)
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.015)
    voice.endsAt = now + 0.015
  }

  private stopAll() {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    this.active.forEach((v) => this.cut(v, now))
    this.active = []
  }

  private update(prefs: SfxPrefs) {
    this.prefs = prefs
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // Storage unavailable: the preference lasts for this page only.
    }
    this.listeners.forEach((listener) => listener())
  }
}

export const sfx = new SfxEngine()
