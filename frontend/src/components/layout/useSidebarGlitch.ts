import { useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { useReducedMotion } from 'motion/react'
import { whenPaintable } from '../../experience/whenPaintable'

/**
 * Signal-disruption glitch on the sidebar.
 *
 *  - "open"  (~650ms): whenever the sidebar becomes visible. Desktop: the sidebar is
 *    always shown, so that's application entry (after the launch intro). Mobile
 *    drawer (≤760px): every closed → open transition. Collapsing/expanding the rail
 *    does not change visibility, so it never triggers this.
 *  - "nav"   (~600ms): on every navigation click — returned as `triggerNavGlitch`.
 *    The clicked item takes the hardest hit.
 *  - "micro" (~180ms): every 5–12s while visible, randomly hitting the logo, one nav
 *    item, the sidebar edge, or a horizontal static line.
 *
 * The effect is CSS keyframes keyed off data attributes on the <aside>; this hook only
 * toggles those attributes on the DOM node, so it never re-renders React.
 *
 * Reliability:
 *  - Each run gets a token; starting a run stops any run in flight first, and a run
 *    only clears attributes it still owns. Rapid clicks restart cleanly, and a stale
 *    fallback timer can't cut a newer glitch short.
 *  - Runs end on the `.sidebar-glitch` clock animation's `animationend`, so a glitch
 *    can't expire before it's drawn.
 *  - The start-up "open" waits for whenPaintable(); user-driven runs start at once.
 *
 * Disabled entirely under prefers-reduced-motion.
 */

const DRAWER_QUERY = '(max-width: 760px)'
const DURATION = { open: 650, nav: 600, micro: 180 } as const
const MICRO_MIN_MS = 5000
const MICRO_MAX_MS = 12000
const MICRO_KINDS = ['logo', 'nav', 'edge', 'static'] as const
const NAV_ITEMS = 4

type GlitchKind = keyof typeof DURATION

const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]
const between = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DRAWER_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const isDrawer = () => window.matchMedia(DRAWER_QUERY).matches

export function useSidebarGlitch(target: RefObject<HTMLElement | null>, isOpen: boolean, suppressed: boolean) {
  const reduced = useReducedMotion() ?? false
  const drawer = useSyncExternalStore(subscribe, isDrawer, () => false)
  const visible = !suppressed && (drawer ? isOpen : true)
  const hasEntered = useRef(false)

  // Opening sequence on every hidden → visible transition.
  useEffect(() => {
    const el = target.current
    if (!visible || reduced || !el) return
    // First appearance happens during app start-up: wait until the page can paint.
    // Later openings (drawer taps) are user-driven, so the page is already idle.
    if (!hasEntered.current) {
      hasEntered.current = true
      const cancel = whenPaintable(() => play(el, 'open'))
      return () => {
        cancel()
        stopCurrent(el, 'open')
      }
    }
    play(el, 'open')
    // Hiding the drawer stops an opening glitch, but not a navigation glitch: tapping a
    // link in the mobile drawer closes it, and that glitch should play as it slides away.
    return () => stopCurrent(el, 'open')
  }, [visible, reduced, target])

  // Unpredictable micro-glitches while visible.
  useEffect(() => {
    const el = target.current
    if (!visible || reduced || !el) return
    let timer: number
    const schedule = () => {
      timer = window.setTimeout(() => {
        // Skip if the tab is hidden or a glitch is already playing.
        if (!document.hidden && !el.dataset.glitch) play(el, 'micro')
        schedule()
      }, MICRO_MIN_MS + Math.random() * (MICRO_MAX_MS - MICRO_MIN_MS))
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [visible, reduced, target])

  /** Call from a nav item's click handler; `index` is the item's 1-based position. */
  const triggerNavGlitch = useCallback(
    (index: number) => {
      const el = target.current
      if (reduced || !el) return
      play(el, 'nav', index)
    },
    [reduced, target],
  )

  return { triggerNavGlitch }
}

/* ───────────── Run control ───────────── */

const active = new WeakMap<HTMLElement, () => void>()
let runCounter = 0

function stopCurrent(el: HTMLElement, onlyKind?: GlitchKind) {
  if (onlyKind && el.dataset.glitch !== onlyKind) return
  active.get(el)?.()
  active.delete(el)
}

function play(el: HTMLElement, kind: GlitchKind, hitIndex?: number) {
  stopCurrent(el)
  const clock = el.querySelector<HTMLElement>('.sidebar-glitch')
  const token = String(++runCounter)

  const clear = () => {
    clock?.removeEventListener('animationend', onEnd)
    window.clearTimeout(fallback)
    // Only remove state this run still owns.
    if (el.dataset.glitchRun === token) {
      delete el.dataset.glitch
      delete el.dataset.glitchMicro
      delete el.dataset.glitchRun
    }
    if (active.get(el) === clear) active.delete(el)
  }
  const onEnd = (event: AnimationEvent) => {
    if (event.target === clock) clear()
  }

  // Restart from a clean state: drop the attributes, force a style flush, re-apply.
  delete el.dataset.glitch
  delete el.dataset.glitchMicro
  void el.offsetWidth

  el.dataset.glitchVariant = String(between(1, 3))
  el.dataset.glitchTarget = String(hitIndex ?? between(1, NAV_ITEMS))
  if (kind === 'micro') el.dataset.glitchMicro = pick(MICRO_KINDS)
  el.dataset.glitchRun = token
  el.dataset.glitch = kind
  clock?.addEventListener('animationend', onEnd)
  // Only if animationend never arrives (e.g. element hidden mid-glitch).
  const fallback = window.setTimeout(clear, DURATION[kind] + 1000)
  active.set(el, clear)
}
