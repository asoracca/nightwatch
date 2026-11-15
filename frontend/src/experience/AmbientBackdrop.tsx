import { lazy, Suspense, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useLocation } from 'react-router-dom'
import { atmosphereForPath, type AtmosphereId } from './atmospheres'
import { hasWebGL, isLowPower } from './capabilities'
import { SceneBoundary } from './SceneBoundary'

const AmbientScene = lazy(() => import('../three/AmbientScene'))

/** CSS-only moonlit environment: shown while the 3D chunk loads and as the no-WebGL fallback. */
function StaticBackdrop({ atmosphere }: { atmosphere: AtmosphereId }) {
  return (
    <div className={`nw-static-backdrop nw-static-backdrop--${atmosphere}`}>
      <div className="nw-static-sky" />
      <div className="nw-static-moon" />
      <div className="nw-static-clouds">
        <span /><span /><span />
      </div>
      <svg className="nw-static-land" viewBox="0 0 1600 360" preserveAspectRatio="none">
        <path className="nw-land-far" d="M0 360V170l90-28 110 22 120-46 140 34 90-20 160 40 130-58 150 44 120-18 150 30 140-26v266Z" />
        <path className="nw-land-mid" d="M0 360V232l70-14 60 16 40-30 30 22 120-6 100 26 140-30 80 18 60-24 40 20 130 4 120-30 90 18 80-8 120 22 80-12 120 18 40-8v178Z" />
        <path className="nw-land-near" d="M0 360V290l120-10 150 18 200-22 180 16 220-8 160 14 200-20 180 12 190-6v116Z" />
        <g className="nw-land-trees">
          <path d="M186 286V214m0 22-18-26m18 14 22-30m-22 48-26-10m26 0 14-16" />
          <path d="M1386 280V196m0 30 20-34m-20 52-30-22m30 4 28 -8m-28-26-14-22" />
          <path d="M1240 228v-38m0 14 12-16m-12 28-14-8" />
        </g>
      </svg>
      <div className="nw-static-fog" />
    </div>
  )
}

/**
 * @param deferScene While true (launch intro playing), only the CSS backdrop renders, so
 *   shader compilation and texture baking don't compete with the 1-second intro.
 */
export function AmbientBackdrop({ deferScene = false }: { deferScene?: boolean }) {
  const { pathname } = useLocation()
  const atmosphere = atmosphereForPath(pathname)
  const reducedMotion = useReducedMotion() ?? false
  const [failed, setFailed] = useState(false)
  const [lowPower] = useState(isLowPower)
  const useWebGL = hasWebGL() && !failed

  return (
    <div className="nw-backdrop" aria-hidden="true">
      <StaticBackdrop atmosphere={atmosphere} />
      {useWebGL && !deferScene && (
        <SceneBoundary onError={() => setFailed(true)}>
          <Suspense fallback={null}>
            <motion.div
              className="nw-backdrop-canvas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reducedMotion ? 0 : 1.2, ease: 'easeOut' }}
            >
              <AmbientScene atmosphere={atmosphere} reducedMotion={reducedMotion} lowPower={lowPower} />
            </motion.div>
          </Suspense>
        </SceneBoundary>
      )}
      <div className="nw-backdrop-scrim" />
    </div>
  )
}
