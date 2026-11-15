import { useEffect } from 'react'
import { sfx, type SfxName } from './sfx'

const INTERACTIVE = 'button, [role="button"], [role="tab"], [role="switch"], summary, input[type="checkbox"], input[type="radio"]'

/**
 * One global listener gives every button a click sound, so components don't each
 * carry audio code. An element (or an ancestor) can override with
 * `data-sfx="<name>"`, or opt out with `data-sfx="none"`.
 * Sidebar nav links are anchors, not buttons, so they keep their dedicated 'nav' sound.
 */
export function SfxBridge() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const control = target?.closest(INTERACTIVE)
      if (!control || control.matches(':disabled, [aria-disabled="true"]')) return
      const override = control.closest('[data-sfx]')?.getAttribute('data-sfx')
      if (override === 'none') return
      sfx.play((override as SfxName | null | undefined) ?? 'click')
    }
    // Capture phase: the click sound starts before the handler, so a handler that
    // plays a more specific sound replaces it (see the engine's click cut).
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
