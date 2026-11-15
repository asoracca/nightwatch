import { BrandMark } from './BrandMark'

/**
 * Branded loading state: the NightWatch mark inside a scanning ring, with a
 * technical status line. Used while heavier experience chunks load.
 */

interface BrandLoaderProps {
  label?: string
  detail?: string
  size?: number
}

export function BrandLoader({ label = 'Initializing', detail, size = 64 }: BrandLoaderProps) {
  return (
    <div className="nw-loader" role="status" aria-live="polite">
      <span className="nw-loader-emblem" style={{ width: size * 1.75, height: size * 1.75 }} aria-hidden="true">
        <span className="nw-loader-scan" />
        <BrandMark size={size} animated />
      </span>
      <span className="nw-loader-label">
        {label}
        <span className="nw-loader-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
      </span>
      {detail && <span className="nw-loader-detail">{detail}</span>}
    </div>
  )
}
