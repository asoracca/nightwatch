// Display model for evidence frames from either pipeline, plus small formatting helpers.
import type { Condition, Detection, Frame } from '../../lib/api'
import type { RecordingFrame } from '../../lib/recordings'

export type RunStatus = 'idle' | 'queued' | 'running' | 'complete' | 'failed'

export type DetectionState = 'Accepted' | 'Review' | 'Hidden'

export interface EvidenceFrame {
  /** Stable key: DB id for uploads, `${condition}:${frame_number}` for recordings. */
  key: string
  /** video_frames.id; only uploads can be reviewed. */
  id: string | null
  frameNumber: number
  timestampSec: number
  condition: Condition
  imageUrl: string | null
  /** True when boxes are already drawn into the image (Arduino results). */
  annotated: boolean
  detections: Detection[]
  reviewRequired: boolean
  reviewReason: string | null
  reviewStatus: 'pending' | 'confirmed' | 'dismissed' | null
  modelVersion: string | null
  inferenceMs: number | null
}

export interface DetectionRow {
  key: string
  frameIndex: number
  timestampSec: number
  detection: Detection
}

export function fromApiFrame(frame: Frame): EvidenceFrame {
  return {
    key: frame.id,
    id: frame.id,
    frameNumber: frame.frame_number,
    timestampSec: frame.timestamp_seconds,
    condition: frame.visibility_condition,
    imageUrl: frame.image_url,
    annotated: false,
    detections: frame.detections_json ?? [],
    reviewRequired: frame.review_required,
    reviewReason: frame.review_reason,
    reviewStatus: frame.review_status,
    modelVersion: frame.model_version,
    inferenceMs: frame.inference_time_ms,
  }
}

export function fromRecordingFrame(frame: RecordingFrame, imageUrl: string | null, modelVersion: string | null): EvidenceFrame {
  return {
    key: `${frame.visibility_condition}:${frame.frame_number}`,
    id: null,
    frameNumber: frame.frame_number,
    timestampSec: frame.timestamp_seconds,
    condition: frame.visibility_condition,
    imageUrl,
    annotated: true,
    detections: frame.detections_json ?? [],
    reviewRequired: frame.review_required,
    reviewReason: null,
    reviewStatus: null,
    modelVersion,
    inferenceMs: frame.inference_time_ms,
  }
}

/** Score that decided tracking and acceptance: sensor-fused when sensors contributed, else the model's. */
export function decisionScore(detection: Detection) {
  return detection.fused_confidence ?? detection.confidence
}

export function isSensorAssisted(detection: Detection) {
  return (detection.sensor_reasons?.length ?? 0) > 0
}

/** Accepted = at/above the run's threshold; Review = review band; Hidden = below the display filter. */
export function detectionState(detection: Detection, minConfidence: number): DetectionState {
  if (decisionScore(detection) < minConfidence) return 'Hidden'
  return detection.accepted ? 'Accepted' : 'Review'
}

export function flattenDetections(frames: EvidenceFrame[]): DetectionRow[] {
  return frames.flatMap((frame, frameIndex) =>
    frame.detections.map((detection, index) => ({
      key: `${frame.key}#${index}`,
      frameIndex,
      timestampSec: frame.timestampSec,
      detection,
    })),
  )
}

export function formatTimecode(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds)
  const h = Math.floor(safe / 3_600)
  const m = Math.floor((safe % 3_600) / 60)
  const s = Math.floor(safe % 60)
  return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':')
}

/** Timecode with tenths, for sampled frames that are 0.2 s apart at 5 FPS. */
export function formatPreciseTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds)
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

export function trackLabel(trackId: number | null) {
  return trackId === null ? 'untracked' : `#${trackId}`
}
