// Arduino recordings (public.video_recordings) and their published results (public.recording_results),
// written by backend/nightwatch/recordings.py. Read directly from Supabase under RLS with the user's session.
import { supabase, type Condition, type Detection, type Findings } from './api'

export type FusionVerdict = 'person_confirmed' | 'person_possible' | 'object_unidentified' | 'nothing_detected'
export type ReviewPriority = 'high' | 'medium' | 'low'

/** One second of sensor data aligned to the video (backend/nightwatch/fusion.py). null = no reading. */
export interface SensorSecond {
  second: number
  temp_c: number | null
  humidity_pct: number | null
  distance_mm: number | null
  accel_mean_mm_s2: number | null
  vibration_mm_s2: number | null
  obstructed: boolean | null
  object_in_range: boolean | null
  camera_moving: boolean | null
  any_detection?: boolean
  yolo_person?: number | null
  person_score?: number | null
  corroborated?: boolean
}

export interface RecordingFrame {
  frame_number: number
  timestamp_seconds: number
  visibility_condition: Condition
  /** Path in the recording-results bucket. Already annotated by the processor. */
  image: string
  inference_time_ms: number
  review_required: boolean
  detections_json: Detection[]
}

export interface RecordingResultSummary {
  id: string
  status: 'completed' | 'failed'
  error_message: string | null
  model_name: string | null
  model_version: string | null
  total_frames: number | null
  frames_with_detections: number | null
  total_detections: number | null
  review_candidate_count: number | null
  average_confidence: number | null
  max_person_confidence: number | null
  label_counts: Record<string, number>
  verdict: FusionVerdict | null
  person_score: number | null
  review_priority: ReviewPriority | null
  reasons: string[]
  environment: {
    temp_c_min?: number | null
    temp_c_max?: number | null
    temp_rise_c?: number | null
    humidity_pct_max?: number | null
    high_humidity?: boolean
    heat_rising?: boolean
    high_temperature?: boolean
    sensor_coverage?: Record<string, string>
  }
  processed_at: string
}

export interface RecordingResultDetail extends RecordingResultSummary {
  fusion_version: string | null
  video_meta: { duration_seconds?: number; fps?: number; width?: number; height?: number } | null
  summary: {
    findings?: Findings
    total_frames?: number
    frames_with_detections?: number
    metrics_json?: { by_condition?: Partial<Record<Condition, { frames: number; detections: number; review_frames: number }>> }
  } | null
  config: { sampling_fps?: number; threshold?: number; review_floor?: number; conditions?: Condition[]; sensor_assist?: boolean; model?: string; model_version?: string }
  frames: RecordingFrame[]
  annotated_clips: Partial<Record<Condition, string>>
  sensor_timeline: SensorSecond[]
}

export interface Recording {
  id: string
  device_id: string
  recorded_at: string
  uploaded_at: string
  duration_seconds: number | null
  width: number | null
  height: number | null
  fps: number | null
  file_size_bytes: number | null
  result: RecordingResultSummary | null
}

const RESULTS_BUCKET = 'recording-results'
const RECORDING_COLUMNS = 'id,device_id,recorded_at,uploaded_at,duration_seconds,width,height,fps,file_size_bytes'
const SUMMARY_COLUMNS =
  'id,status,error_message,model_name,model_version,total_frames,frames_with_detections,total_detections,' +
  'review_candidate_count,average_confidence,max_person_confidence,label_counts,verdict,person_score,' +
  'review_priority,reasons,environment,processed_at'

type RecordingRow = Omit<Recording, 'result'> & {
  recording_results: RecordingResultSummary[] | RecordingResultSummary | null
}

function firstResult(value: RecordingRow['recording_results']) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function listRecordings(limit = 100): Promise<Recording[]> {
  const { data, error } = await supabase()
    .from('video_recordings')
    .select(`${RECORDING_COLUMNS},recording_results(${SUMMARY_COLUMNS})`)
    .order('recorded_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as RecordingRow[]).map(({ recording_results, ...rest }) => ({
    ...rest,
    result: firstResult(recording_results),
  }))
}

export async function getRecordingResult(recordingId: string): Promise<RecordingResultDetail | null> {
  const { data, error } = await supabase()
    .from('recording_results')
    .select(`${SUMMARY_COLUMNS},fusion_version,video_meta,summary,config,frames,annotated_clips,sensor_timeline`)
    .eq('recording_id', recordingId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as RecordingResultDetail | null) ?? null
}

/** Signs result media for 15 minutes. Returns path → URL; unsigned paths are omitted. */
export async function signResultMedia(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  const urls = new Map<string, string>()
  if (unique.length === 0) return urls
  const { data, error } = await supabase().storage.from(RESULTS_BUCKET).createSignedUrls(unique, 900)
  if (error) throw new Error(error.message)
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
  }
  return urls
}

export const verdictLabels: Record<FusionVerdict, string> = {
  person_confirmed: 'Person confirmed',
  person_possible: 'Person possible',
  object_unidentified: 'Object unidentified',
  nothing_detected: 'Nothing detected',
}
