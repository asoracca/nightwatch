import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, type Transition } from 'motion/react'
import { BrandMark } from '../components/brand/BrandMark'
import { whenPaintable } from './whenPaintable'

/**
 * NightWatch launch intro — ~1 second, decorative, never blocks the app.
 *
 *   0.00–0.20  emergence     moonlit glow rises from the centre; mist drifts across
 *   0.20–0.55  symbol        mark scales up from darkness (slight overshoot), silver sweep, motes disperse
 *   0.55–0.85  wordmark      NIGHTWATCH resolves from wide tracking with a cool glow
 *   0.85–1.00  transition    the dark veil dissolves into the live moonlit backdrop beneath
 *
 * The application and backdrop are already mounted underneath, so the hand-off
 * is a single opacity fade — no flash, no layout shift. The overlay ignores
 * pointer events and is hidden from assistive tech.
 *
 * Timing: the overlay covers the screen (black) from the first render, but the
 * 1-second sequence only starts once the browser can paint it (fonts loaded, the
 * app's first render finished — see whenPaintable). Starting on mount let the
 * whole sequence elapse while the main thread was still busy, so it was never seen.
 */

const DURATION = 1.0
const REDUCED_DURATION = 0.45
const ease = [0.22, 1, 0.36, 1] as const
/** Gentle overshoot for the symbol's scale (settles within ~0.35s). */
const overshoot = [0.34, 1.45, 0.5, 1] as const

const WORD = 'NIGHTWATCH'
const LETTERS = WORD.split('')
const MIDDLE = (LETTERS.length - 1) / 2
/** Extra tracking each letter starts with; it closes to the resting spacing. */
const SPREAD_EM = 0.3
/** Slightly uneven arrival: reads as something waking up, not a machine stagger. */
const LETTER_DELAY = [0.05, 0, 0.07, 0.02, 0.08, 0.01, 0.06, 0, 0.08, 0.03]

/** Ten motes on fixed angles so the burst is balanced, not random noise. */
const motes = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 + (i % 2 ? 0.22 : -0.12)
  const distance = 54 + (i % 3) * 22
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.8, size: 2 + (i % 3) }
})

interface LaunchIntroProps {
  onComplete: () => void
}

export function LaunchIntro({ onComplete }: LaunchIntroProps) {
  const reduced = useReducedMotion() ?? false
  const done = useRef(false)
  const total = reduced ? REDUCED_DURATION : DURATION
  const [started, setStarted] = useState(false)

  useEffect(() => whenPaintable(() => setStarted(true)), [])

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    onComplete()
  }, [onComplete])

  // Safety net, measured from the real start: complete even if the animation
  // callback never fires (e.g. a hidden tab).
  useEffect(() => {
    if (!started) return
    const id = window.setTimeout(finish, total * 1000 + 1500)
    return () => window.clearTimeout(id)
  }, [finish, started, total])

  /** Holds every element at its initial state until the sequence starts. */
  const go = <T,>(target: T) => (started ? target : undefined)

  const at = (start: number, duration: number, extra?: Partial<Transition>): Transition => ({
    delay: start,
    duration,
    ease,
    ...extra,
  })

  if (reduced) {
    return (
      <motion.div
        className="nw-launch"
        aria-hidden="true"
        data-started={started}
        initial={{ opacity: 1 }}
        animate={go({ opacity: 0 })}
        transition={{ delay: 0.15, duration: REDUCED_DURATION - 0.15, ease: 'easeOut' }}
        onAnimationComplete={finish}
      >
        <div className="nw-launch-glow nw-launch-glow--static" />
        <div className="nw-launch-lockup">
          <BrandMark size={96} className="nw-launch-mark" />
          <span className="nw-launch-word nw-launch-word--static">{WORD}</span>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="nw-launch"
      aria-hidden="true"
      data-started={started}
      initial={{ opacity: 1 }}
      animate={go({ opacity: [1, 1, 0] })}
      transition={{ duration: DURATION, times: [0, 0.85, 1], ease: 'easeInOut' }}
      onAnimationComplete={finish}
    >
      {/* 0.00–0.20 · emergence */}
      <motion.div
        className="nw-launch-glow"
        initial={{ opacity: 0, transform: 'scale(0.7)' }}
        animate={go({ opacity: [0, 0.75, 0.9], transform: ['scale(0.7)', 'scale(1)', 'scale(1.08)'] })}
        transition={{ duration: DURATION, times: [0, 0.2, 1], ease }}
      />
      <motion.div
        className="nw-launch-mist nw-launch-mist--a"
        initial={{ transform: 'translateX(-18%)', opacity: 0 }}
        animate={go({ transform: 'translateX(12%)', opacity: [0, 0.55, 0.4] })}
        transition={{ duration: DURATION, ease: 'linear' }}
      />
      <motion.div
        className="nw-launch-mist nw-launch-mist--b"
        initial={{ transform: 'translateX(16%)', opacity: 0 }}
        animate={go({ transform: 'translateX(-10%)', opacity: [0, 0.4, 0.3] })}
        transition={{ duration: DURATION, ease: 'linear' }}
      />

      <div className="nw-launch-lockup">
        {/* 0.20–0.55 · symbol */}
        <div className="nw-launch-symbol">
          <motion.div
            // Full transform strings (not scale/x/y) so Motion can run these on the compositor:
            // the intro stays smooth even if the app's first render briefly busies the main thread.
            initial={{ opacity: 0, transform: 'scale(0.78)', filter: 'blur(8px)' }}
            animate={go({ opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' })}
            transition={{
              opacity: at(0.2, 0.3),
              filter: at(0.2, 0.32),
              transform: at(0.2, 0.38, { ease: overshoot }),
            }}
          >
            {/* The sweep is a CSS animation; mounting it at start keeps it in sync with the sequence. */}
            <BrandMark size={104} sweep={started} className="nw-launch-mark" />
          </motion.div>
          {motes.map((mote, i) => (
            <motion.span
              key={i}
              className="nw-launch-mote"
              style={{ width: mote.size, height: mote.size }}
              initial={{ transform: 'translate(0px, 0px)', opacity: 0 }}
              animate={go({ transform: `translate(${mote.x}px, ${mote.y}px)`, opacity: [0, 0.9, 0] })}
              transition={at(0.3 + (i % 4) * 0.02, 0.55, { ease: [0.15, 0.7, 0.3, 1] })}
            />
          ))}
        </div>

        {/* 0.55–0.85 · wordmark */}
        {/* Letter spacing closes in per letter: each glyph slides toward the centre by the
            extra tracking it started with. Same result as animating letter-spacing, but on the
            compositor and without re-laying out the text every frame. */}
        <span className="nw-launch-word">
          {LETTERS.map((letter, i) => {
            const offset = (i - MIDDLE) * SPREAD_EM
            return (
              <motion.span
                key={i}
                className="nw-launch-letter"
                initial={{ opacity: 0, transform: `translate(${offset}em, 4px)`, filter: 'blur(5px)' }}
                animate={go({ opacity: [0, 0.55, 1], transform: 'translate(0em, 0px)', filter: 'blur(0px)' })}
                transition={{
                  ...at(0.52 + LETTER_DELAY[i], 0.3),
                  opacity: { delay: 0.52 + LETTER_DELAY[i], duration: 0.3, times: [0, 0.6, 1], ease: 'easeOut' },
                }}
              >
                {letter}
              </motion.span>
            )
          })}
        </span>
      </div>
    </motion.div>
  )
}
