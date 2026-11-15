import {
  CanvasTexture,
  Color,
  DataTexture,
  LinearFilter,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
} from 'three'

/**
 * Mutable environment state shared by every scene component.
 * Scenes (intro / ambient) write to it each frame; components read it in
 * useFrame. Keeping it in a ref avoids React re-renders inside the render loop.
 */
export interface CoreState {
  distance: number
  movement: number
  thermal: number
  /** 0 = sensor elements apart, 1 = converged into the NightWatch identity. */
  converge: number
  /** Extra lens bloom used for the intro exit. */
  flare: number
}

export interface Env {
  /** Global fade-in (0 = black). */
  reveal: number
  /** Global animation speed multiplier (0 freezes time-based motion). */
  speed: number
  /** Shared animation clock in seconds (already multiplied by speed). */
  time: number
  dust: number
  embers: number
  /** Moon position on the sky plane (world x/y). */
  moon: Vector2
  /** Cloud coverage 0 (clear) … 1 (overcast). */
  clouds: number
  groundFog: number
  /** Overall sky brightness multiplier. */
  exposure: number
  /** Output: moonlight reaching the scene after cloud occlusion (0…1). Written by the sky. */
  moonlight: number
  core: CoreState
  corePos: Vector3
  coreScale: number
}

export const palette = {
  night: new Color('#05050b'),
  horizon: new Color('#1a1b2c'),
  moonlight: new Color('#b9c6e4'),
  moonWarm: new Color('#e8e4d6'),
  cyan: new Color('#00e5ff'),
  purple: new Color('#a855f7'),
  amber: new Color('#ff9f43'),
  ember: new Color('#ffb86b'),
  mote: new Color('#c9d3ee'),
  moteDim: new Color('#8e98b8'),
}

export function createEnv(): Env {
  return {
    reveal: 0,
    speed: 1,
    time: 0,
    dust: 0,
    embers: 0,
    moon: new Vector2(30, 24),
    clouds: 0.5,
    groundFog: 0.6,
    exposure: 1,
    moonlight: 1,
    core: { distance: 0, movement: 0, thermal: 0, converge: 0, flare: 0 },
    corePos: new Vector3(),
    coreScale: 1,
  }
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Frame-rate independent exponential approach. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt))

/** Deterministic PRNG so layouts are stable between renders. */
export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/* ───────────── Glow sprite texture ───────────── */

let glowTex: CanvasTexture | null = null
export function glowTexture() {
  if (glowTex) return glowTex
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.22, 'rgba(255,255,255,0.5)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.08)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  }
  glowTex = new CanvasTexture(canvas)
  glowTex.colorSpace = SRGBColorSpace
  return glowTex
}

/* ───────────── Tileable cloud noise (baked once, sampled on GPU and CPU) ───────────── */

export const NOISE_SIZE = 256

export interface CloudNoise {
  texture: DataTexture
  /** Same values as the texture, 0…1, for CPU sampling (moon occlusion). */
  data: Float32Array
}

let cloudNoise: CloudNoise | null = null

/** Tileable fBm value noise, 256², single channel. ~10 ms to build, ~64 KB on the GPU. */
export function getCloudNoise(): CloudNoise {
  if (cloudNoise) return cloudNoise
  const size = NOISE_SIZE
  const rand = seeded(1337)
  const values = new Float32Array(size * size)
  const octaves = [4, 8, 16, 32, 64]
  let amplitude = 1
  let total = 0

  for (const period of octaves) {
    const lattice = new Float32Array(period * period)
    for (let i = 0; i < lattice.length; i += 1) lattice[i] = rand()
    const cell = size / period
    for (let y = 0; y < size; y += 1) {
      const gy = y / cell
      const y0 = Math.floor(gy)
      const fy = gy - y0
      const sy = fy * fy * (3 - 2 * fy)
      const r0 = (y0 % period) * period
      const r1 = ((y0 + 1) % period) * period
      for (let x = 0; x < size; x += 1) {
        const gx = x / cell
        const x0 = Math.floor(gx)
        const fx = gx - x0
        const sx = fx * fx * (3 - 2 * fx)
        const c0 = x0 % period
        const c1 = (x0 + 1) % period
        const top = lerp(lattice[r0 + c0], lattice[r0 + c1], sx)
        const bottom = lerp(lattice[r1 + c0], lattice[r1 + c1], sx)
        values[y * size + x] += lerp(top, bottom, sy) * amplitude
      }
    }
    total += amplitude
    amplitude *= 0.52
  }

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i += 1) {
    values[i] /= total
    if (values[i] < min) min = values[i]
    if (values[i] > max) max = values[i]
  }
  const bytes = new Uint8Array(size * size)
  for (let i = 0; i < values.length; i += 1) {
    const v = (values[i] - min) / (max - min)
    bytes[i] = Math.round(v * 255)
    values[i] = bytes[i] / 255
  }

  const texture = new DataTexture(bytes, size, size, RedFormat, UnsignedByteType)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = texture.minFilter = LinearFilter
  texture.needsUpdate = true
  cloudNoise = { texture, data: values }
  return cloudNoise
}

/** Bilinear, wrapping sample of the baked noise — matches the GPU's LinearFilter sample. */
export function sampleNoise(noise: CloudNoise, u: number, v: number) {
  const size = NOISE_SIZE
  const x = (((u * size - 0.5) % size) + size) % size
  const y = (((v * size - 0.5) % size) + size) % size
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const x1 = (x0 + 1) % size
  const y1 = (y0 + 1) % size
  const d = noise.data
  const top = lerp(d[y0 * size + x0], d[y0 * size + x1], fx)
  const bottom = lerp(d[y1 * size + x0], d[y1 * size + x1], fx)
  return lerp(top, bottom, fy)
}

/* ───────────── Moon texture ───────────── */

let moonTex: CanvasTexture | null = null
/** Procedural moon: limb darkening, soft maria, a few craters. 256², drawn once. */
export function moonTexture() {
  if (moonTex) return moonTex
  const size = 256
  const r = size / 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const rand = seeded(42)
    ctx.save()
    ctx.beginPath()
    ctx.arc(r, r, r - 2, 0, Math.PI * 2)
    ctx.clip()
    const base = ctx.createRadialGradient(r * 0.85, r * 0.8, r * 0.1, r, r, r)
    base.addColorStop(0, '#f4f2ea')
    base.addColorStop(0.7, '#d9dbe0')
    base.addColorStop(1, '#9ea6b8')
    ctx.fillStyle = base
    ctx.fillRect(0, 0, size, size)
    // Maria: large soft darker regions.
    for (let i = 0; i < 9; i += 1) {
      const x = r + (rand() - 0.45) * r * 1.1
      const y = r + (rand() - 0.5) * r * 1.0
      const rr = r * (0.12 + rand() * 0.28)
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr)
      g.addColorStop(0, `rgba(96,104,124,${0.28 + rand() * 0.2})`)
      g.addColorStop(1, 'rgba(96,104,124,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, size, size)
    }
    // Craters: small rings with a lit rim.
    for (let i = 0; i < 26; i += 1) {
      const x = rand() * size
      const y = rand() * size
      const cr = 1.5 + rand() * 7
      ctx.beginPath()
      ctx.arc(x, y, cr, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(110,116,132,${0.18 + rand() * 0.2})`
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x - cr * 0.2, y - cr * 0.2, cr, Math.PI * 0.9, Math.PI * 1.7)
      ctx.strokeStyle = 'rgba(255,255,250,0.18)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.restore()
  }
  moonTex = new CanvasTexture(canvas)
  moonTex.colorSpace = SRGBColorSpace
  return moonTex
}

/* ───────────── Dead tree silhouettes ───────────── */

const treeTextures = new Map<number, CanvasTexture>()
/** Bare, wind-bent tree silhouette drawn with recursive branches. 128×256, cached per seed. */
export function treeTexture(seed: number) {
  const cached = treeTextures.get(seed)
  if (cached) return cached
  const w = 128
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const rand = seeded(seed)
    const lean = (rand() - 0.5) * 0.35
    ctx.strokeStyle = '#ffffff'
    ctx.lineCap = 'round'
    const branch = (x: number, y: number, length: number, angle: number, width: number, depth: number) => {
      const bend = (rand() - 0.5) * 0.3
      const x2 = x + Math.sin(angle) * length
      const y2 = y - Math.cos(angle) * length
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + Math.sin(angle + bend) * length * 0.5, y - Math.cos(angle + bend) * length * 0.5, x2, y2)
      ctx.stroke()
      if (depth <= 0 || width < 0.6) return
      const forks = rand() > 0.7 ? 3 : 2
      for (let i = 0; i < forks; i += 1) {
        const spread = (0.35 + rand() * 0.45) * (i % 2 ? 1 : -1)
        if (rand() > 0.12) branch(x2, y2, length * (0.62 + rand() * 0.16), angle + spread + lean * 0.4, width * 0.66, depth - 1)
      }
    }
    branch(w / 2, h - 2, h * 0.3, lean, 7, 7)
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  treeTextures.set(seed, tex)
  return tex
}
