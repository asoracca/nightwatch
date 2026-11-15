// One display model for both evidence sources: user uploads (FastAPI /videos) and Arduino recordings.
import type { UseCase, Video } from './api'
import type { Recording } from './recordings'

export type FootageKind = 'upload' | 'recording'

export const footageStatuses = ['Unverified', 'Uploaded', 'Processing', 'Analyzed', 'Failed', 'Pending'] as const
export type FootageStatus = (typeof footageStatuses)[number]

/** Visual theme for the SVG thumbnail; purely cosmetic. */
export type ThumbnailTheme = 'maritime' | 'facility-security' | 'traffic' | 'rescue'

export interface Footage {
  /** Video ID or recording ID (UUID). */
  id: string
  kind: FootageKind
  title: string
  fileName: string
  durationSeconds: number | null
  fileSizeBytes: number
  uploadedAt: string
  /** Uploader-selected use case; null for Arduino recordings. */
  useCase: UseCase | null
  categoryLabel: string
  status: FootageStatus
  source: string
  deviceId: string | null
  errorMessage: string | null
  theme: ThumbnailTheme
  video?: Video
  recording?: Recording
}

const ARDUINO_LABEL = 'Arduino capture'

const themes: Record<UseCase, ThumbnailTheme> = {
  'search and rescue': 'rescue',
  'fire and smoke response': 'rescue',
  'floods and natural disasters': 'maritime',
  'collapsed buildings': 'facility-security',
  'cave and underground rescue': 'traffic',
  'maritime rescue and fog': 'maritime',
  'dangerous industrial inspection': 'facility-security',
  'remote drone inspection': 'traffic',
  'war-zone or inaccessible environments': 'rescue',
}

export function titleFromFilename(name: string) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

export function videoStatus(video: Video): FootageStatus {
  if (video.status === 'failed') return 'Failed'
  if (!video.upload_verified) return 'Unverified'
  if (video.status === 'processing') return 'Processing'
  if (video.status === 'completed') return 'Analyzed'
  return 'Uploaded'
}

export function fromVideo(video: Video): Footage {
  return {
    id: video.id,
    kind: 'upload',
    title: titleFromFilename(video.original_filename),
    fileName: video.original_filename,
    durationSeconds: video.duration_seconds,
    fileSizeBytes: video.expected_bytes,
    uploadedAt: video.uploaded_at,
    useCase: video.use_case,
    categoryLabel: capitalize(video.use_case),
    status: videoStatus(video),
    source: video.device_id ? `Linked to ${video.device_id}` : 'Uploaded footage',
    deviceId: video.device_id,
    errorMessage: video.error_message,
    theme: themes[video.use_case] ?? 'maritime',
    video,
  }
}

const recordingTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function fromRecording(recording: Recording): Footage {
  const when = new Date(recording.recorded_at)
  const label = Number.isNaN(when.getTime()) ? recording.id.slice(0, 8) : recordingTimeFormat.format(when)
  const result = recording.result
  return {
    id: recording.id,
    kind: 'recording',
    title: `${recording.device_id} · ${label}`,
    fileName: `${recording.device_id}_${recording.recorded_at}`,
    durationSeconds: recording.duration_seconds,
    fileSizeBytes: recording.file_size_bytes ?? 0,
    uploadedAt: recording.uploaded_at || recording.recorded_at,
    useCase: null,
    categoryLabel: ARDUINO_LABEL,
    status: !result ? 'Pending' : result.status === 'completed' ? 'Analyzed' : 'Failed',
    source: `Arduino ${recording.device_id}`,
    deviceId: recording.device_id,
    errorMessage: result?.status === 'failed' ? result.error_message : null,
    theme: 'facility-security',
    recording,
  }
}

export const footageStatusTone = {
  Unverified: 'amber',
  Uploaded: 'cyan',
  Processing: 'purple',
  Analyzed: 'positive',
  Failed: 'pink',
  Pending: 'muted',
} as const satisfies Record<FootageStatus, string>

export const conditionLabels = {
  clear: 'Clear',
  low_light: 'Low light',
  fog: 'Fog',
  blurry: 'Blur',
} as const

export function percent(value: number | null | undefined, digits = 0) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`
}

// ── Human headline ──────────────────────────────────────────────────────────────────────────────

export type HumanStatus = 'humans_found' | 'possible_humans' | 'no_humans_found'

export const humanLabels: Record<HumanStatus, string> = {
  humans_found: 'Humans found',
  possible_humans: 'Possible human',
  no_humans_found: 'No humans found',
}

export const humanTone = {
  humans_found: 'pink',
  possible_humans: 'amber',
  no_humans_found: 'muted',
} as const satisfies Record<HumanStatus, string>

/** Headline for analysed footage: stored findings for uploads, the fusion verdict for Arduino recordings. */
export function humanStatus(
  footage: Footage,
  investigations: Record<string, { metrics_json?: { findings?: { headline: HumanStatus } } } | null>,
): HumanStatus | null {
  if (footage.status !== 'Analyzed') return null
  if (footage.kind === 'upload') return investigations[footage.id]?.metrics_json?.findings?.headline ?? null
  const verdict = footage.recording?.result?.verdict
  if (verdict === 'person_confirmed') return 'humans_found'
  if (verdict === 'person_possible') return 'possible_humans'
  return verdict ? 'no_humans_found' : null
}
