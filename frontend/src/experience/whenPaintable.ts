/**
 * Runs `callback` once the browser can actually paint the result: web fonts loaded,
 * the main thread idle (the app's first render is done), then two animation frames.
 * A cap guarantees it still runs on a page that never goes idle.
 *
 * Why: an animation started during the app's first render can play out entirely
 * while the main thread is busy, so nothing visible ever reaches the screen.
 * Returns a cancel function.
 */
export function whenPaintable(callback: () => void, capMs = 900): () => void {
  let cancelled = false
  let fired = false
  let raf1 = 0
  let raf2 = 0
  let idleId: number | undefined
  let capId: number | undefined

  const fire = () => {
    if (cancelled || fired) return
    fired = true
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) callback()
      })
    })
  }

  const idle = new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(() => resolve(), { timeout: capMs })
    else resolve()
  })
  const fonts = document.fonts?.ready.then(() => undefined) ?? Promise.resolve()
  void Promise.all([idle, fonts]).then(fire)
  capId = window.setTimeout(fire, capMs)

  return () => {
    cancelled = true
    cancelAnimationFrame(raf1)
    cancelAnimationFrame(raf2)
    if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
    window.clearTimeout(capId)
  }
}
