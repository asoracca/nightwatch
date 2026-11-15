import { useMemo } from 'react'
import { Boxes, Crosshair, Gauge, ListChecks, ScanSearch } from 'lucide-react'
import { SectionHeader } from '../common/SectionHeader'
import { StatusBadge, type StatusTone } from '../common/StatusBadge'
import { conditionLabels } from '../../lib/footage'
import type { Condition } from '../../lib/api'
import {
  decisionScore,
  detectionState,
  isSensorAssisted,
  flattenDetections,
  formatPreciseTime,
  trackLabel,
  type DetectionState,
  type EvidenceFrame,
  type RunStatus,
} from './analysis'

const statusTone: Record<DetectionState, StatusTone> = {
  Accepted: 'cyan',
  Review: 'amber',
  Hidden: 'muted',
}

const MAX_ROWS = 300

interface DetectionResultsProps {
  frames: EvidenceFrame[]
  condition: Condition
  minConfidence: number
  /** Run threshold (0–1); marks the accepted boundary on the strip. */
  threshold: number | null
  runStatus: RunStatus
  loading: boolean
  selectedKey: string | null
  onSelect: (key: string, frameIndex: number) => void
}

export function DetectionResults({
  frames,
  condition,
  minConfidence,
  threshold,
  runStatus,
  loading,
  selectedKey,
  onSelect,
}: DetectionResultsProps) {
  const rows = useMemo(() => flattenDetections(frames), [frames])
  const shown = rows.filter((row) => detectionState(row.detection, minConfidence) !== 'Hidden')
  const accepted = rows.filter((row) => row.detection.accepted)
  const sensorAssisted = rows.filter((row) => isSensorAssisted(row.detection)).length
  const classes = [...new Set(accepted.map((row) => row.detection.label))]
  const tracks = new Set(accepted.map((row) => row.detection.track_id).filter((id) => id !== null)).size
  const average = accepted.length
    ? accepted.reduce((sum, row) => sum + row.detection.confidence, 0) / accepted.length
    : null
  const framesWithDetections = frames.filter((frame) => frame.detections.some((d) => d.accepted)).length
  const reviewFrames = frames.filter((frame) => frame.reviewRequired).length
  const ordered = [...rows].sort(
    (a, b) => a.timestampSec - b.timestampSec || b.detection.confidence - a.detection.confidence,
  )
  const visibleRows = ordered.slice(0, MAX_ROWS)
  const thresholdPct = threshold === null ? null : Math.round(threshold * 100)
  const filterPct = Math.round(minConfidence * 100)

  const stats = [
    { label: 'Accepted observations', value: String(accepted.length).padStart(2, '0'), detail: `${tracks} track IDs · not unique people`, Icon: Boxes },
    { label: 'Object classes', value: String(classes.length).padStart(2, '0'), detail: classes.length ? classes.join(' · ') : '—', Icon: ListChecks },
    { label: 'Mean confidence', value: average === null ? '—' : `${(average * 100).toFixed(1)}%`, detail: 'Accepted observations only', Icon: Gauge },
    { label: 'Frames', value: `${framesWithDetections}/${frames.length}`, detail: `${reviewFrames} flagged for review`, Icon: Crosshair },
  ]

  return (
    <section className="cc-panel vs-panel vs-results-panel" aria-labelledby="vs-results-heading">
      <SectionHeader
        eyebrow={`Model output · ${conditionLabels[condition]}`}
        title="Detection results"
        titleId="vs-results-heading"
        action={
          runStatus === 'running' || runStatus === 'queued' ? (
            <StatusBadge tone="cyan" pulse>{runStatus === 'queued' ? 'Queued' : 'Processing'}</StatusBadge>
          ) : loading ? (
            <StatusBadge tone="muted" pulse>Loading frames</StatusBadge>
          ) : frames.length ? (
            <StatusBadge tone="purple">{rows.length} observations</StatusBadge>
          ) : (
            <StatusBadge tone="muted">No results</StatusBadge>
          )
        }
      />

      {rows.length === 0 ? (
        <div className="vs-empty vs-empty--compact">
          <span className="vs-empty-icon"><ScanSearch size={18} aria-hidden="true" /></span>
          <div>
            <strong>
              {runStatus === 'running' || runStatus === 'queued'
                ? 'Waiting for the worker'
                : frames.length
                  ? 'No detections in this condition'
                  : 'No detections yet'}
            </strong>
            <p>
              {runStatus === 'running' || runStatus === 'queued'
                ? 'Detections load when the job completes. Keep the worker running.'
                : frames.length
                  ? 'An all-empty result is valid and does not establish that nothing is present.'
                  : 'Run an analysis to detect and track objects in this footage.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="vs-result-stats">
            {stats.map(({ label, value, detail, Icon }) => (
              <div className="vs-result-stat" key={label}>
                <span className="vs-result-stat-label"><Icon size={12} aria-hidden="true" />{label}</span>
                <strong>{value}</strong>
                <span className="vs-result-stat-detail" title={detail}>{detail}</span>
              </div>
            ))}
          </div>

          <div className="vs-confidence-strip">
            <div className="vs-confidence-strip-head">
              <span>Confidence distribution</span>
              <span className="vs-legend">
                <i className="vs-legend-dot vs-legend-dot--confirmed" />Accepted
                <i className="vs-legend-dot vs-legend-dot--review" />Review band
                <i className="vs-legend-dot vs-legend-dot--filtered" />Hidden
              </span>
            </div>
            <div
              className="vs-strip-track"
              role="img"
              aria-label={`${rows.length} observations; display filter at ${filterPct}%${thresholdPct !== null ? `, accepted threshold ${thresholdPct}%` : ''}`}
            >
              <span className="vs-strip-filtered-zone" style={{ width: `${filterPct}%` }} />
              {thresholdPct !== null && <span className="vs-strip-confirm-line" style={{ left: `${thresholdPct}%` }} />}
              <span className="vs-strip-threshold" style={{ left: `${filterPct}%` }}>
                <span>{filterPct}%</span>
              </span>
              {rows.slice(0, 600).map((row, index) => {
                const status = detectionState(row.detection, minConfidence)
                return (
                  <button
                    key={row.key}
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    className={`vs-strip-tick vs-strip-tick--${status === 'Accepted' ? 'confirmed' : status === 'Review' ? 'review' : 'filtered'}${row.key === selectedKey ? ' is-selected' : ''}`}
                    style={{ left: `${decisionScore(row.detection) * 100}%`, top: `${18 + (index % 3) * 9}px` }}
                    onClick={() => onSelect(row.key, row.frameIndex)}
                  />
                )
              })}
            </div>
            <div className="vs-range-scale" aria-hidden="true">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          <div className="vs-det-table" role="list" aria-label="Observations, ordered by timestamp">
            <div className="vs-det-head" aria-hidden="true">
              <span>Object</span><span>Track</span><span>Timestamp</span><span>Confidence</span><span>Status</span>
            </div>
            {visibleRows.map((row) => {
              const status = detectionState(row.detection, minConfidence)
              const selected = row.key === selectedKey
              const confidence = Math.round(decisionScore(row.detection) * 100)
              const assisted = isSensorAssisted(row.detection)
              const modelPct = Math.round(row.detection.confidence * 100)
              return (
                <div role="listitem" key={row.key}>
                  <button
                    type="button"
                    className={`vs-det-row vs-det-row--${status === 'Accepted' ? 'confirmed' : status === 'Review' ? 'review' : 'filtered'}${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    aria-label={`${row.detection.label}, track ${trackLabel(row.detection.track_id)}, ${formatPreciseTime(row.timestampSec)}, ${confidence}% confidence${assisted ? `, sensor-assisted from ${modelPct}% model` : ''}, ${status}. Show in preview.`}
                    title={assisted ? [`Model ${modelPct}% → ${confidence}% with sensors:`, ...row.detection.sensor_reasons!].join(String.fromCharCode(10)) : undefined}
                    onClick={() => onSelect(row.key, row.frameIndex)}
                  >
                    <span className="vs-det-cell vs-det-cls">
                      <i className={`vs-legend-dot vs-legend-dot--${status === 'Accepted' ? 'confirmed' : status === 'Review' ? 'review' : 'filtered'}`} aria-hidden="true" />
                      {row.detection.label}
                    </span>
                    <span className="vs-det-cell vs-det-mono vs-det-track">{trackLabel(row.detection.track_id)}</span>
                    <span className="vs-det-cell vs-det-mono vs-det-time">{formatPreciseTime(row.timestampSec)}</span>
                    <span className="vs-det-cell vs-det-conf">
                      <span className="vs-det-conf-track"><span style={{ width: `${confidence}%` }} /></span>
                      <span className="vs-det-mono">
                        {confidence}%{assisted && <small className="vs-det-model"> ⚡ model {modelPct}%</small>}
                      </span>
                    </span>
                    <span className="vs-det-cell vs-det-status"><StatusBadge tone={statusTone[status]}>{status}</StatusBadge></span>
                  </button>
                </div>
              )
            })}
          </div>
          {ordered.length > MAX_ROWS && (
            <p className="cc-panel-footnote">
              Showing the first {MAX_ROWS} of {ordered.length} observations ({shown.length} above the display filter). Use the
              timeline to inspect later frames.
            </p>
          )}
          <p className="cc-panel-footnote">
            {sensorAssisted > 0 && `${sensorAssisted} observations were sensor-assisted (⚡): their fused score drove tracking and acceptance; the raw model score is kept. `}
            Counts are object observations per condition-frame, not unique people. Track IDs are scoped to this condition and
            job. Miss rate is unavailable without annotated ground truth.
          </p>
        </>
      )}
    </section>
  )
}
