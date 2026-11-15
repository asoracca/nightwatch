import { useState } from 'react'
import { CONDITIONS, type Condition, type Investigation } from '../../lib/api'
import { conditionLabels } from '../../lib/footage'

interface Totals {
  frames: number
  detections: number
  review: number
}

/** Accepted observations per visibility condition, summed over completed uploads that ran that condition. */
export function VisibilityImpact({ investigations }: { investigations: Investigation[] }) {
  const [hover, setHover] = useState<Condition | null>(null)
  const totals = CONDITIONS.reduce(
    (acc, condition) => {
      for (const investigation of investigations) {
        const stats = investigation.metrics_json?.by_condition?.[condition]
        if (!stats) continue
        acc[condition] ??= { frames: 0, detections: 0, review: 0 }
        acc[condition].frames += stats.frames
        acc[condition].detections += stats.detections
        acc[condition].review += stats.review_frames
      }
      return acc
    },
    {} as Partial<Record<Condition, Totals>>,
  )
  const rows = CONDITIONS.filter((condition) => totals[condition])
  const max = Math.max(1, ...rows.map((condition) => totals[condition]!.detections))
  const clear = totals.clear?.detections ?? 0

  if (rows.length === 0) {
    return (
      <div className="cc-impact-empty">
        <strong>No completed analyses yet</strong>
        <p>Run an analysis with all four visibility conditions to compare what the model still sees in low light, fog and blur.</p>
      </div>
    )
  }

  return (
    <figure className="cc-impact">
      <figcaption className="sr-only">Accepted observations by visibility condition across {investigations.length} completed analyses</figcaption>
      <ul className="cc-impact-bars" role="list">
        {rows.map((condition) => {
          const stats = totals[condition]!
          const delta = condition === 'clear' || clear === 0 ? null : (stats.detections - clear) / clear
          const perFrame = stats.frames ? stats.detections / stats.frames : 0
          return (
            <li
              key={condition}
              className={`cc-impact-row${hover === condition ? ' is-hover' : ''}`}
              onPointerEnter={() => setHover(condition)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(condition)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${conditionLabels[condition]}: ${stats.detections} accepted observations over ${stats.frames} frames${delta === null ? '' : `, ${Math.round(delta * 100)}% versus clear`}`}
            >
              <span className="cc-impact-label">{conditionLabels[condition]}</span>
              <span className="cc-impact-track">
                <span className="cc-impact-fill" style={{ width: `${(stats.detections / max) * 100}%` }} />
              </span>
              <span className="cc-impact-value">
                {stats.detections.toLocaleString()}
                {delta !== null && <small className={delta < 0 ? 'is-loss' : undefined}>{delta > 0 ? '+' : ''}{Math.round(delta * 100)}%</small>}
              </span>
              {hover === condition && (
                <span className="cc-impact-tooltip" role="tooltip">
                  <strong>{conditionLabels[condition]}</strong>
                  <span>{stats.detections.toLocaleString()} accepted observations</span>
                  <span>{stats.frames.toLocaleString()} frames · {perFrame.toFixed(2)} per frame</span>
                  <span>{stats.review.toLocaleString()} review-candidate frames</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="cc-panel-footnote">
        Across {investigations.length} completed {investigations.length === 1 ? 'analysis' : 'analyses'}. Change versus clear is
        descriptive detection loss, not measured recall or miss rate.
      </p>
    </figure>
  )
}
