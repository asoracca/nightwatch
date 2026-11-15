import { useState, type CSSProperties } from 'react'

/**
 * Faint dark clouds drifting IN FRONT of the whole interface (above sidebar, topbar
 * and panels; below the launch intro). Purely decorative: pointer-events: none,
 * aria-hidden.
 *
 * Cost: two small textures are baked once on a canvas (dark cloud body + pale
 * moonlit edges), tile horizontally, and are moved with transform-only CSS
 * animations — compositor work, no per-frame JS, no blur filters.
 *
 * Readability: opacity stays in the 8–16% range, and a mask thins the layer over
 * the central content area where most text sits.
 */

const TILE_W = 640
const TILE_H = 320

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Horizontally tileable soft cloud texture (blobs wrap around the left/right edges). */
function bakeCloudTexture(seed: number, rgb: string, density: number, lift = 0) {
  const canvas = document.createElement('canvas')
  canvas.width = TILE_W
  canvas.height = TILE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const rand = seeded(seed)
  // Clusters of blobs read as formations rather than uniform haze.
  const clusters = 5
  for (let c = 0; c < clusters; c += 1) {
    const cx = rand() * TILE_W
    const cy = TILE_H * (0.3 + rand() * 0.4) - lift
    const blobs = 9 + Math.floor(rand() * 7)
    for (let b = 0; b < blobs; b += 1) {
      const x = cx + (rand() - 0.5) * 260
      const y = cy + (rand() - 0.5) * 70
      const r = 40 + rand() * 90
      const alpha = density * (0.35 + rand() * 0.65)
      for (const dx of [-TILE_W, 0, TILE_W]) {
        const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r)
        g.addColorStop(0, `rgba(${rgb},${alpha})`)
        g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.45})`)
        g.addColorStop(1, `rgba(${rgb},0)`)
        ctx.fillStyle = g
        ctx.fillRect(x + dx - r, y - r, r * 2, r * 2)
      }
    }
  }
  // Feather top and bottom so the tile never shows a hard horizontal edge.
  ctx.globalCompositeOperation = 'destination-in'
  const fade = ctx.createLinearGradient(0, 0, 0, TILE_H)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(0.22, 'rgba(0,0,0,1)')
  fade.addColorStop(0.78, 'rgba(0,0,0,1)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, TILE_W, TILE_H)
  return canvas.toDataURL('image/png')
}

let cache: { body: string; body2: string; lit: string } | null = null
function textures() {
  if (!cache) {
    cache = {
      body: bakeCloudTexture(11, '8,9,16', 0.95),
      body2: bakeCloudTexture(29, '10,11,19', 0.9),
      lit: bakeCloudTexture(11, '178,192,224', 0.55, 18),
    }
  }
  return cache
}

export function ForegroundClouds() {
  const [tex] = useState(textures)
  const url = (value: string) => `url("${value}")`

  return (
    <div className="nw-fg-clouds" aria-hidden="true">
      <div className="nw-fg-layer nw-fg-layer--far" style={{ '--tex': url(tex.body2) } as CSSProperties} />
      <div className="nw-fg-layer nw-fg-layer--mid" style={{ '--tex': url(tex.body) } as CSSProperties} />
      <div className="nw-fg-layer nw-fg-layer--lit" style={{ '--tex': url(tex.lit) } as CSSProperties} />
      {/* A single nearer formation that occasionally drifts across, for depth. */}
      <div className="nw-fg-pass" style={{ '--tex': url(tex.body) } as CSSProperties} />
    </div>
  )
}
