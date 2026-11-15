let webgl: boolean | null = null

/** True when the browser can create a WebGL2 context (three.js r163+ requires it). */
export function hasWebGL() {
  if (webgl !== null) return webgl
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    webgl = context !== null
    context?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webgl = false
  }
  return webgl
}

/** Heuristic for modest hardware: fewer particles, lower resolution. */
export function isLowPower() {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
}

export const REPLAY_INTRO_EVENT = 'nightwatch:replay-intro'

/**
 * The launch intro plays on every full application load. In-app navigation never
 * replays it (the layout that owns it stays mounted across routes).
 *
 * Switches:
 *   VITE_DISABLE_INTRO=true   (e.g. in the repository-root .env) — never play it
 *   ?intro=off                 — skip it for this load
 *   Dev only: Alt+Shift+I, or `nightwatchReplayIntro()` in the console — replay it
 */
export function shouldPlayIntro() {
  if (import.meta.env.VITE_DISABLE_INTRO === 'true') return false
  try {
    const value = new URLSearchParams(window.location.search).get('intro')
    if (value === 'off' || value === '0') return false
  } catch {
    // Ignore malformed URLs.
  }
  return true
}

export function requestIntroReplay() {
  window.dispatchEvent(new Event(REPLAY_INTRO_EVENT))
}
