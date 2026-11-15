// Client for the NightWatch Python API and Supabase. Contract: docs/FRONTEND_HANDOFF.md, docs/API.md.
// Only public values live here; the service-role key never belongs in browser code.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '')

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
export const apiConfigured = Boolean(API_URL)

let client: SupabaseClient | undefined
export function supabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY in the repository-root .env to sign in.')
  }
  return (client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
}

/** An API failure with its HTTP status, so callers can route 401/404/409/422/429/503 differently. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function detailMessage(status: number, data: unknown) {
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    // FastAPI validation errors: [{ loc, msg }]
    if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === 'string') {
      return detail.map((item: { msg: string }) => item.msg.replace(/^Value error, /, '')).join('; ')
    }
  }
  if (status === 401) return 'Your session expired. Sign in again.'
  if (status === 429) return 'Too many requests. Wait a minute and retry.'
  if (status === 503) return 'The service is temporarily unavailable. Retry shortly.'
  return `Request failed (${status})`
}

/** Calls the Python API with the caller's Supabase access token. Sends JSON when `body` is given. */
export async function api<T>(path: string, token: string, body?: unknown, method?: 'GET' | 'POST' | 'DELETE'): Promise<T> {
  if (!API_URL) throw new Error('Set API_URL in the repository-root .env to reach the NightWatch API.')
  let response: Response
  try {
    response = await fetch(API_URL + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the NightWatch API. Check API_URL, CORS (FRONTEND_ORIGIN) and that the API is running.')
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, detailMessage(response.status, data))
  return data as T
}

export async function apiHealth(): Promise<boolean> {
  if (!API_URL) return false
  try {
    const response = await fetch(API_URL + '/health', { cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

/** PUTs the file to a signed Storage upload URL with real progress (0–100). */
export function uploadToSignedUrl(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.timeout = 180_000
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((100 * event.loaded) / event.total))
    }
    xhr.onerror = () => reject(new Error('Upload connection failed. Retry the same file.'))
    xhr.ontimeout = () => reject(new Error('Upload timed out. Retry the same file.'))
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}). If the file already uploaded, use “Verify upload”.`))
    xhr.send(file)
  })
}

export async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------------------------
// Contract types (backend/nightwatch/domain.py, supabase/migrations/*.sql)

export const USE_CASES = [
  'search and rescue',
  'fire and smoke response',
  'floods and natural disasters',
  'collapsed buildings',
  'cave and underground rescue',
  'maritime rescue and fog',
  'dangerous industrial inspection',
  'remote drone inspection',
  'war-zone or inaccessible environments',
] as const
export type UseCase = (typeof USE_CASES)[number]

export const CONDITIONS = ['clear', 'low_light', 'fog', 'blurry'] as const
export type Condition = (typeof CONDITIONS)[number]

export const UPLOAD_LIMITS = {
  maxBytes: 52_428_800,
  maxSeconds: 120,
  types: { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' } as Record<string, string>,
}

/** The MIME type the backend expects for this filename, or null when the extension is unsupported. */
export function uploadContentType(filename: string) {
  const dot = filename.lastIndexOf('.')
  return dot < 0 ? null : (UPLOAD_LIMITS.types[filename.slice(dot).toLowerCase()] ?? null)
}

/** The backend's filename pattern needs a lowercase extension (CLIP.MP4 → CLIP.mp4). */
export function uploadFilename(filename: string) {
  const dot = filename.lastIndexOf('.')
  return dot < 0 ? filename : filename.slice(0, dot) + filename.slice(dot).toLowerCase()
}

/** Client-side pre-checks mirroring backend/nightwatch/domain.py Upload. Returns an error or ''. */
export function validateUpload(file: File) {
  if (!uploadContentType(file.name)) return `${file.name}: use MP4, MOV or WebM.`
  if (/[/\\]/.test(file.name) || file.name.length > 200) return `${file.name}: rename the file (max 200 characters).`
  if (file.size === 0) return `${file.name} is empty.`
  if (file.size > UPLOAD_LIMITS.maxBytes) return `${file.name} is over 50 MiB.`
  return ''
}

export type VideoStatus = 'uploaded' | 'processing' | 'completed' | 'failed'
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface Video {
  id: string
  original_filename: string
  status: VideoStatus
  use_case: UseCase
  upload_verified: boolean
  expected_bytes: number
  content_sha256: string
  uploaded_at: string
  duration_seconds: number | null
  fps: number | null
  width: number | null
  height: number | null
  processing_started_at: string | null
  processing_finished_at: string | null
  error_message: string | null
  model_name: string | null
  model_version: string | null
  device_id: string | null
  recording_started_at: string | null
  /** Only on GET /videos/{id}; signed for 15 minutes. Never log it. */
  playback_url?: string | null
}

export interface ProcessConfig {
  sampling_fps: number
  threshold: number
  review_floor: number
  conditions: Condition[]
  sensor_assist?: boolean
  model?: ModelName
  reprocess?: boolean
}

export interface Job {
  id: string
  video_id: string
  attempt: number
  status: JobStatus
  config: ProcessConfig & { model_version?: string; pipeline_version?: string }
  created_at: string
  started_at: string | null
  finished_at: string | null
  heartbeat_at: string | null
  error_message: string | null
}

export interface VideoStatusResponse {
  status: VideoStatus
  error_message: string | null
  job: Job | null
}

export interface Detection {
  class_id?: number
  label: string
  confidence: number
  /** Normalized [x1, y1, x2, y2]. */
  bbox: [number, number, number, number]
  track_id: number | null
  accepted: boolean
  /** Sensor-adjusted score that drove tracking and acceptance; `confidence` is the raw model output. */
  fused_confidence?: number | null
  sensor_reasons?: string[]
}

export interface Frame {
  id: string
  video_id: string
  job_id: string
  frame_number: number
  timestamp_seconds: number
  visibility_condition: Condition
  detections_json: Detection[]
  inference_time_ms: number
  review_required: boolean
  review_reason: string | null
  review_status: 'pending' | 'confirmed' | 'dismissed'
  model_name: string
  model_version: string
  /** Signed for 15 minutes. */
  image_url: string
}

export interface ConditionStats {
  frames: number
  detections: number
  review_frames: number
}

export type HumanHeadline = 'humans_found' | 'possible_humans' | 'no_humans_found'

export interface ClassFindings {
  accepted: number
  review: number
  frames: number
  conditions: Condition[]
  max_tracks: number
  max_confidence: number
  max_model_confidence: number
  sensor_assisted: number
  first_seen_s: number
  last_seen_s: number
  segments: [number, number][]
  best: {
    condition: Condition
    frame_number: number
    timestamp_seconds: number
    confidence: number
    model_confidence: number
    track_id: number | null
    bbox: [number, number, number, number] | null
  }
  by_condition: Partial<
    Record<Condition, { accepted: number; review: number; frames: number; tracks: number; max_confidence: number; first_seen_s: number; last_seen_s: number }>
  >
}

/** backend/nightwatch/findings.py */
export interface Findings {
  version: string
  headline: HumanHeadline
  headline_text: string
  detail: string
  humans_found: boolean
  people: ClassFindings | null
  objects: (ClassFindings & { label: string })[]
  thresholds: { accepted: number; review_floor: number }
}

export const MODELS = {
  yolo11m: { label: 'YOLO11m', note: 'Most accurate · best in low light · slower' },
  yolo11s: { label: 'YOLO11s', note: 'Balanced speed and accuracy' },
  yolo11n: { label: 'YOLO11n', note: 'Fastest · weakest in the dark' },
} as const
export type ModelName = keyof typeof MODELS

export interface InvestigationMetrics {
  by_condition: Partial<Record<Condition, ConditionStats>>
  ground_truth_available?: boolean
  requested_sampling_fps?: number
  effective_sampling_fps?: number
  threshold?: number
  review_floor?: number
  timestamp_semantics?: string
  tracking_scope?: string
  mean_inference_ms_by_condition?: Partial<Record<Condition, number>>
  sensor_assisted_detections?: number
  sensor_assist?: { version: string; enabled: boolean; seconds_with_readings: number; note?: string }
  findings?: Findings
  model?: ModelName
}

/** One evaluation run (GET /experiments). */
export interface ExperimentRun {
  id: string
  job_id: string
  experiment_name: string
  model_name: string
  model_version: string
  detector_threshold: number
  frame_sampling_rate: number
  video_count: number
  frame_count: number
  metrics_json: InvestigationMetrics
  created_at: string
}

export interface Investigation {
  id: string
  video_id: string
  job_id: string
  total_frames: number
  frames_with_detections: number
  total_detections: number
  average_confidence: number | null
  /** null = unmeasured (no ground truth), never zero. */
  miss_rate: number | null
  review_candidate_count: number
  affected_use_case: string
  summary: string
  metrics_json: InvestigationMetrics
  processing_status: string
  created_at: string
  completed_at: string | null
}

export interface AssistantCitation {
  frame_id: string
  frame_number: number
  timestamp_seconds: number
  condition: Condition
  model_name: string
  model_version: string
  stored_review_reason: string | null
  stored_detections: Detection[]
}

/** Deterministic, evidence-only report (backend/nightwatch/assistant.py); no LLM is involved. */
export interface AssistantReport {
  topic: 'summary' | 'flags' | 'comparison'
  text: string
  evidence: {
    job_id: string
    investigation_id: string
    model_name: string | null
    model_version: string | null
    total_frames: number
    total_detections: number
    average_confidence: number | null
    miss_rate: number | null
  }
  flagged_frame_citations: AssistantCitation[]
  citation_scope: string
  limitations: string
}

export interface Device {
  device_id: string
  label: string
  enabled: boolean
  token_expires_at: string
  created_at: string
}

export interface DeviceEvent {
  id: string
  device_id: string
  event_type: 'motion_detected' | 'distance_changed' | 'temperature_reading' | 'heartbeat'
  event_time: string
  sensor_data_json: { distance_cm?: number; temperature_c?: number; motion?: boolean }
  linked_video_id: string | null
  /** Only on GET /videos/{id}/device-events. */
  video_timestamp_seconds?: number | null
}
