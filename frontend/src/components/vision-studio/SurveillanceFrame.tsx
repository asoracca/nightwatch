import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, Crosshair, ImageOff, Radar } from 'lucide-react'
import { conditionLabels } from '../../lib/footage'
import {
  decisionScore,
  detectionState,
  isSensorAssisted,
  formatPreciseTime,
  formatTimecode,
  trackLabel,
  type EvidenceFrame,
  type RunStatus,
} from './analysis'

/** Overlay coordinate width; height follows the image's aspect ratio so CSS sizes stay legible. */
const VIEW_WIDTH = 960

interface SurveillanceFrameProps {
  frame: EvidenceFrame | null
  /** Fallback aspect ratio before the image loads (video metadata). */
  sourceWidth: number | null
  sourceHeight: number | null
  minConfidence: number
  showTracks: boolean
  selectedKey: string | null
  runStatus: RunStatus
  sourceLabel: string
  deviceLabel: string
  /** Epoch ms of the clip's first frame for the HUD clock, when known. */
  recordingStartMs: number | null
  emptyMessage: string
  onSelectDetection: (key: string) => void
}

function labelWidth(text: string) {
  return text.length * 6.4 + 14
}

const clockFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function SurveillanceFrame({
  frame,
  sourceWidth,
  sourceHeight,
  minConfidence,
  showTracks,
  selectedKey,
  runStatus,
  sourceLabel,
  deviceLabel,
  recordingStartMs,
  emptyMessage,
  onSelectDetection,
}: SurveillanceFrameProps) {
  const reduceMotion = useReducedMotion() ?? false
  const [natural, setNatural] = useState<{ key: string; w: number; h: number } | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const measured = natural && natural.key === frame?.key ? natural : null
  const w = measured?.w ?? sourceWidth ?? 16
  const h = measured?.h ?? sourceHeight ?? 9
  const viewHeight = Math.round((VIEW_WIDTH * h) / w)

  const visible = useMemo(
    () =>
      (frame?.detections ?? [])
        .map((detection, index) => ({ detection, key: `${frame?.key}#${index}` }))
        .filter(({ detection }) => detectionState(detection, minConfidence) !== 'Hidden'),
    [frame, minConfidence],
  )

  const clock =
    recordingStartMs !== null && frame
      ? clockFormatter.format(new Date(recordingStartMs + frame.timestampSec * 1_000)).replace(',', '')
      : null
  const imageFailed = frame?.imageUrl != null && failedUrl === frame.imageUrl

  return (
    <div className={`vs-frame vs-frame--real${runStatus === 'running' ? ' is-running' : ''}`}>
      {frame?.imageUrl && !imageFailed ? (
        <img
          className="vs-frame-image"
          src={frame.imageUrl}
          alt={`Sample ${frame.frameNumber}, ${conditionLabels[frame.condition]}, at ${formatPreciseTime(frame.timestampSec)}`}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget
            if (naturalWidth && naturalHeight) setNatural({ key: frame.key, w: naturalWidth, h: naturalHeight })
          }}
          onError={() => setFailedUrl(frame.imageUrl)}
        />
      ) : (
        <div className="vs-frame-placeholder">
          {imageFailed ? (
            <>
              <ImageOff size={20} aria-hidden="true" />
              <span>Frame image unavailable. Its signed link may have expired; it refreshes automatically.</span>
            </>
          ) : frame ? (
            <span>Loading frame image…</span>
          ) : (
            <span>{emptyMessage}</span>
          )}
        </div>
      )}

      {/* Same letterboxing as the image (contain/meet), so normalized boxes line up exactly. */}
      {frame && !frame.annotated && (
        <svg
          className="vs-frame-svg vs-frame-overlay"
          viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${visible.length} detections shown at or above ${Math.round(minConfidence * 100)}% confidence`}
        >
          <AnimatePresence>
            {visible.map(({ detection, key }) => {
              const status = detectionState(detection, minConfidence)
              const selected = key === selectedKey
              const [x1, y1, x2, y2] = detection.bbox
              const x = x1 * VIEW_WIDTH
              const y = y1 * viewHeight
              const bw = (x2 - x1) * VIEW_WIDTH
              const bh = (y2 - y1) * viewHeight
              const text = `${detection.label.toUpperCase()} ${Math.round(decisionScore(detection) * 100)}%${isSensorAssisted(detection) ? ' ⚡' : ''}`
              const tag = showTracks ? `${trackLabel(detection.track_id)} · ${text}` : text
              const tagW = labelWidth(tag)
              const tagY = y > 26 ? y - 22 : y + bh + 4
              const tagX = Math.min(Math.max(0, x), VIEW_WIDTH - tagW)
              const corner = Math.min(14, bw / 3, bh / 3)
              return (
                <motion.g
                  key={key}
                  className={`vs-det vs-det--${status === 'Accepted' ? 'confirmed' : 'review'}${selected ? ' vs-det--selected' : ''}`}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                  onClick={() => onSelectDetection(key)}
                >
                  <rect className="vs-det-box" x={x} y={y} width={bw} height={bh} rx={2} />
                  <path
                    className="vs-det-corners"
                    d={`M${x} ${y + corner}V${y}H${x + corner}M${x + bw - corner} ${y}H${x + bw}V${y + corner}M${x + bw} ${y + bh - corner}V${y + bh}H${x + bw - corner}M${x + corner} ${y + bh}H${x}V${y + bh - corner}`}
                  />
                  <g transform={`translate(${tagX} ${tagY})`}>
                    <rect className="vs-det-tag" width={tagW} height={18} rx={3} />
                    <text className="vs-det-tag-text" x={7} y={12.5}>{tag}</text>
                  </g>
                  {selected && <circle className="vs-det-focus" cx={x + bw / 2} cy={y + bh / 2} r={4} />}
                </motion.g>
              )
            })}
          </AnimatePresence>
        </svg>
      )}

      <span className="vs-frame-scanlines" aria-hidden="true" />
      {runStatus === 'running' && <span className="vs-frame-sweep" aria-hidden="true" />}

      <div className="vs-hud vs-hud--top-left" aria-hidden="true">
        <span className="vs-hud-cam">
          <i className={runStatus === 'running' ? 'vs-hud-dot vs-hud-dot--live' : 'vs-hud-dot'} />
          {deviceLabel}
        </span>
        <span>{sourceLabel}</span>
      </div>
      <div className="vs-hud vs-hud--top-right" aria-hidden="true">
        {clock && <span>{clock}</span>}
        {frame && <span>T+{formatPreciseTime(frame.timestampSec)}</span>}
      </div>
      <div className="vs-hud vs-hud--bottom-left" aria-hidden="true">
        {frame && (
          <span className="vs-hud-sim">
            {conditionLabels[frame.condition]} · sample {frame.frameNumber}
            {frame.annotated ? ' · boxes drawn by processor' : ''}
          </span>
        )}
      </div>
      <div className="vs-hud vs-hud--bottom-right" aria-hidden="true">
        {runStatus === 'running' || runStatus === 'queued' ? (
          <span className="vs-hud-scan"><Radar size={12} /> {runStatus === 'queued' ? 'Queued' : 'Processing'}</span>
        ) : frame ? (
          <span><Crosshair size={12} /> {visible.length} shown · ≥{Math.round(minConfidence * 100)}%</span>
        ) : (
          <span>Awaiting results</span>
        )}
      </div>
    </div>
  )
}

interface EvidenceTimelineProps {
  frames: EvidenceFrame[]
  durationSec: number
  frameIndex: number
  minConfidence: number
  onSelectFrame: (index: number) => void
}

const MAX_MARKERS = 160

export function EvidenceTimeline({ frames, durationSec, frameIndex, minConfidence, onSelectFrame }: EvidenceTimelineProps) {
  const frameCount = frames.length
  const current = frames[frameIndex]
  const span = Math.max(durationSec, frames.at(-1)?.timestampSec ?? 0, 1)

  // Mark frames with visible detections (and review flags) without flooding the track.
  const markers = useMemo(() => {
    const marked = frames
      .map((frame, index) => ({
        index,
        frame,
        count: frame.detections.filter((d) => detectionState(d, minConfidence) !== 'Hidden').length,
      }))
      .filter((item) => item.count > 0 || item.frame.reviewRequired)
    if (marked.length <= MAX_MARKERS) return marked
    const step = marked.length / MAX_MARKERS
    return Array.from({ length: MAX_MARKERS }, (_, i) => marked[Math.floor(i * step)])
  }, [frames, minConfidence])

  if (frameCount === 0) return null

  return (
    <div className="vs-timeline">
      <button
        className="vs-icon-button"
        type="button"
        aria-label="Previous frame"
        disabled={frameIndex === 0}
        onClick={() => onSelectFrame(frameIndex - 1)}
      >
        <ChevronLeft size={15} aria-hidden="true" />
      </button>

      <div className="vs-timeline-main">
        <div className="vs-timeline-caption">
          <span className="vs-timeline-index">
            Frame {String(frameIndex + 1).padStart(3, '0')}/{String(frameCount).padStart(3, '0')}
          </span>
          <span className="vs-timeline-time">{current ? formatPreciseTime(current.timestampSec) : '—'}</span>
          <span className="vs-timeline-note">
            {current?.reviewRequired
              ? current.reviewReason || 'Review-band observation'
              : current && current.detections.length === 0
                ? 'No detections reported. This does not establish that the scene is empty.'
                : `${current?.detections.length ?? 0} observations in this frame`}
          </span>
        </div>
        <div className="vs-timeline-track">
          <span
            className="vs-timeline-progress"
            style={{ width: `${((current?.timestampSec ?? 0) / span) * 100}%` }}
          />
          {markers.map(({ index, frame, count }) => (
            <button
              key={frame.key}
              type="button"
              tabIndex={-1}
              className={`vs-timeline-marker is-revealed${index === frameIndex ? ' is-current' : ''}${frame.reviewRequired ? ' is-review' : ''}`}
              style={{ left: `${(frame.timestampSec / span) * 100}%` }}
              aria-label={`Frame at ${formatPreciseTime(frame.timestampSec)}, ${count} detections`}
              onClick={() => onSelectFrame(index)}
            >
              <span>{count || ''}</span>
            </button>
          ))}
          <input
            className="vs-timeline-scrubber"
            type="range"
            min={0}
            max={frameCount - 1}
            step={1}
            value={frameIndex}
            aria-label="Scrub sampled frames"
            aria-valuetext={current ? `Frame ${frameIndex + 1} at ${formatPreciseTime(current.timestampSec)}` : undefined}
            onChange={(event) => onSelectFrame(Number(event.currentTarget.value))}
          />
        </div>
        <div className="vs-timeline-scale" aria-hidden="true">
          <span>00:00:00</span>
          <span>{formatTimecode(span)}</span>
        </div>
      </div>

      <button
        className="vs-icon-button"
        type="button"
        aria-label="Next frame"
        disabled={frameIndex >= frameCount - 1}
        onClick={() => onSelectFrame(frameIndex + 1)}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
