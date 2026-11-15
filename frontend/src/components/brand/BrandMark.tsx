import { useId } from 'react'

/**
 * The NightWatch symbol: three sensing forms converging on one point.
 *   Cyan ring     — distance sensing (segmented: it measures, it doesn't enclose)
 *   Purple orbit  — movement sensing (an ellipse passing through the ring's gaps)
 *   Amber lens    — thermal sensing (the warm centre the other two resolve into)
 *
 * Rendered inline so it stays crisp at any size and can animate. Animation is
 * CSS-only and switched off under prefers-reduced-motion.
 */

interface BrandMarkProps {
  size?: number
  /** Rounded tile behind the symbol (sidebar, favicon-style usage). */
  tile?: boolean
  /** Slow ring rotation and ripple pulse. */
  animated?: boolean
  /** One silver-blue light sweep across the symbol's strokes (masked to the mark). */
  sweep?: boolean
  className?: string
  title?: string
}

export function BrandMark({ size = 40, tile = false, animated = false, sweep = false, className = '', title }: BrandMarkProps) {
  const id = useId().replaceAll(':', '')
  const lens = `nw-lens-${id}`
  const halo = `nw-halo-${id}`
  const sweepMask = `nw-sweep-mask-${id}`
  const sweepFill = `nw-sweep-fill-${id}`

  return (
    <svg
      className={`nw-mark${animated ? ' nw-mark--animated' : ''}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={lens} cx="0.4" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#FFE6C4" />
          <stop offset="0.45" stopColor="#FF9F43" />
          <stop offset="1" stopColor="#8A3A12" />
        </radialGradient>
        <radialGradient id={halo}>
          <stop offset="0" stopColor="#FF9F43" stopOpacity="0.45" />
          <stop offset="1" stopColor="#FF9F43" stopOpacity="0" />
        </radialGradient>
        {sweep && (
          <>
            <linearGradient id={sweepFill} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#dfe8ff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#eef3ff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#dfe8ff" stopOpacity="0" />
            </linearGradient>
            <mask id={sweepMask} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
              <ellipse cx="24" cy="24" rx="19.5" ry="7.2" transform="rotate(-24 24 24)" stroke="#fff" strokeWidth="1.6" fill="none" />
              <circle cx="24" cy="24" r="13.5" stroke="#fff" strokeWidth="2" fill="none" />
              <circle cx="24" cy="24" r="5.4" fill="#fff" />
            </mask>
          </>
        )}
      </defs>

      {tile && <rect className="nw-mark-tile" width="48" height="48" rx="13" />}

      {/* Movement: orbit + echo ripple */}
      <g className="nw-mark-orbit">
        <ellipse cx="24" cy="24" rx="19.5" ry="7.2" transform="rotate(-24 24 24)" stroke="#A855F7" strokeWidth="1.5" strokeDasharray="44 6 14 6" strokeLinecap="round" />
        <ellipse className="nw-mark-ripple" cx="24" cy="24" rx="19.5" ry="7.2" transform="rotate(-24 24 24)" stroke="#A855F7" strokeWidth="1" strokeOpacity="0.5" />
      </g>

      {/* Distance: segmented ring + inner reference ring */}
      <g className="nw-mark-ring">
        <circle cx="24" cy="24" r="13.5" stroke="#00E5FF" strokeWidth="1.9" strokeDasharray="17 4.2" strokeLinecap="round" />
      </g>
      <circle cx="24" cy="24" r="9" stroke="#00E5FF" strokeOpacity="0.35" strokeWidth="1" />

      {/* Thermal: lens with halo and iris */}
      <circle cx="24" cy="24" r="9" fill={`url(#${halo})`} />
      <circle cx="24" cy="24" r="5.4" fill={`url(#${lens})`} />
      <circle cx="24" cy="24" r="3" stroke="#3A1606" strokeOpacity="0.55" strokeWidth="1.1" />
      <circle cx="22.4" cy="22.3" r="1" fill="#FFF4E2" fillOpacity="0.9" />

      {sweep && (
        <g mask={`url(#${sweepMask})`}>
          {/* Rotation lives on the group so the CSS translate on the rect doesn't override it. */}
          <g transform="rotate(18 24 24)">
            <rect className="nw-mark-sweep" x="-14" y="-6" width="14" height="60" fill={`url(#${sweepFill})`} />
          </g>
        </g>
      )}
    </svg>
  )
}

interface BrandWordmarkProps {
  caption?: string
  size?: 'sm' | 'md' | 'lg'
}

export function BrandWordmark({ caption, size = 'md' }: BrandWordmarkProps) {
  return (
    <span className={`nw-wordmark nw-wordmark--${size}`}>
      <span className="nw-wordmark-name">NIGHTWATCH</span>
      {caption && <span className="nw-wordmark-caption">{caption}</span>}
    </span>
  )
}
