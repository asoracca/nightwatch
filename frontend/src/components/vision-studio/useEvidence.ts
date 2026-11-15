import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Condition, type DeviceEvent, type Frame, type VideoStatusResponse } from '../../lib/api'
import { getRecordingResult, signResultMedia, type RecordingResultDetail } from '../../lib/recordings'
import { fromApiFrame, fromRecordingFrame, type EvidenceFrame } from './analysis'

const PAGE_SIZE = 50
const MAX_PAGES = 30 // 1,500 frames per condition: far above 120 s × 10 FPS
const STATUS_POLL_MS = 4_000
/** Signed media URLs last 15 minutes; refresh a little before that. */
const MEDIA_REFRESH_MS = 12 * 60_000

export interface UploadEvidence {
  status: VideoStatusResponse | null
  statusError: string
  frames: EvidenceFrame[]
  framesLoading: boolean
  framesError: string
  events: DeviceEvent[]
  refreshStatus: () => Promise<VideoStatusResponse | null>
  reloadFrames: () => void
  updateFrame: (key: string, patch: Partial<EvidenceFrame>) => void
}

/** Job status, frames for one condition and linked device events for an uploaded video. */
export function useUploadEvidence(
  videoId: string | null,
  token: string,
  condition: Condition,
  reviewOnly: boolean,
  onJobFinished: () => void,
): UploadEvidence {
  const [status, setStatus] = useState<VideoStatusResponse | null>(null)
  const [statusError, setStatusError] = useState('')
  const [frames, setFrames] = useState<EvidenceFrame[]>([])
  const [framesLoading, setFramesLoading] = useState(false)
  const [framesError, setFramesError] = useState('')
  const [events, setEvents] = useState<DeviceEvent[]>([])
  const [reloadToken, setReloadToken] = useState(0)
  const finishedRef = useRef(onJobFinished)
  finishedRef.current = onJobFinished
  const lastJobState = useRef<string | null>(null)

  const refreshStatus = useCallback(async () => {
    if (!videoId) return null
    try {
      const next = await api<VideoStatusResponse>(`/videos/${videoId}/status`, token)
      setStatus(next)
      setStatusError('')
      const jobState = next.job ? `${next.job.id}:${next.job.status}` : null
      const previous = lastJobState.current
      lastJobState.current = jobState
      // A job just reached a terminal state: reload frames and let the workspace fetch the investigation.
      if (previous && previous !== jobState && next.job && ['completed', 'failed'].includes(next.job.status)) {
        setReloadToken((value) => value + 1)
        finishedRef.current()
      }
      return next
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Status unavailable')
      return null
    }
  }, [token, videoId])

  // Reset when the video changes.
  useEffect(() => {
    setStatus(null)
    setStatusError('')
    setFrames([])
    setEvents([])
    lastJobState.current = null
  }, [videoId])

  // Poll status only while a job is queued or processing.
  const active = status?.job ? ['queued', 'processing'].includes(status.job.status) : false
  useEffect(() => {
    if (!videoId) return
    refreshStatus()
    if (!active) return
    const timer = window.setInterval(refreshStatus, STATUS_POLL_MS)
    return () => window.clearInterval(timer)
  }, [active, refreshStatus, videoId])

  // Load every page for the selected condition; refresh before signed URLs expire.
  const jobId = status?.job?.id ?? null
  const jobDone = status?.job?.status === 'completed' || status?.job?.status === 'failed'
  useEffect(() => {
    if (!videoId || !jobId || !jobDone) {
      setFrames([])
      return
    }
    let cancelled = false
    const load = async () => {
      setFramesLoading(true)
      setFramesError('')
      const collected: EvidenceFrame[] = []
      try {
        for (let page = 0; page < MAX_PAGES && !cancelled; page += 1) {
          const rows = await api<Frame[]>(
            `/videos/${videoId}/frames?condition=${condition}&review_only=${reviewOnly}&offset=${page * PAGE_SIZE}`,
            token,
          )
          collected.push(...rows.map(fromApiFrame))
          if (!cancelled) setFrames([...collected])
          if (rows.length < PAGE_SIZE) break
        }
      } catch (error) {
        if (!cancelled) setFramesError(error instanceof Error ? error.message : 'Frames unavailable')
      } finally {
        if (!cancelled) setFramesLoading(false)
      }
    }
    load()
    const timer = window.setInterval(load, MEDIA_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [condition, jobDone, jobId, reloadToken, reviewOnly, token, videoId])

  // Device events linked to this video's capture interval.
  useEffect(() => {
    if (!videoId) return
    let cancelled = false
    api<DeviceEvent[]>(`/videos/${videoId}/device-events`, token)
      .then((rows) => !cancelled && setEvents(rows))
      .catch(() => !cancelled && setEvents([]))
    return () => {
      cancelled = true
    }
  }, [reloadToken, token, videoId])

  const updateFrame = useCallback((key: string, patch: Partial<EvidenceFrame>) => {
    setFrames((current) => current.map((frame) => (frame.key === key ? { ...frame, ...patch } : frame)))
  }, [])

  return {
    status,
    statusError,
    frames,
    framesLoading,
    framesError,
    events,
    refreshStatus,
    reloadFrames: () => setReloadToken((value) => value + 1),
    updateFrame,
  }
}

export interface RecordingEvidence {
  detail: RecordingResultDetail | null
  frames: EvidenceFrame[]
  loading: boolean
  error: string
}

/** Published result for one Arduino recording; frame images are signed per condition. */
export function useRecordingEvidence(recordingId: string | null, condition: Condition): RecordingEvidence {
  const [detail, setDetail] = useState<RecordingResultDetail | null>(null)
  const [frames, setFrames] = useState<EvidenceFrame[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDetail(null)
    setFrames([])
    if (!recordingId) return
    let cancelled = false
    setLoading(true)
    setError('')
    getRecordingResult(recordingId)
      .then((result) => !cancelled && setDetail(result))
      .catch((caught: Error) => !cancelled && setError(caught.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [recordingId])

  useEffect(() => {
    if (!detail) return
    let cancelled = false
    const sign = async () => {
      const selected = detail.frames
        .filter((frame) => frame.visibility_condition === condition)
        .sort((a, b) => a.frame_number - b.frame_number)
      // Show frames immediately, then fill in signed images in batches.
      if (!cancelled) setFrames(selected.map((frame) => fromRecordingFrame(frame, null, detail.model_version)))
      const urls = new Map<string, string>()
      try {
        for (let index = 0; index < selected.length && !cancelled; index += 100) {
          const batch = await signResultMedia(selected.slice(index, index + 100).map((frame) => frame.image))
          batch.forEach((url, path) => urls.set(path, url))
          if (!cancelled) {
            setFrames(selected.map((frame) => fromRecordingFrame(frame, urls.get(frame.image) ?? null, detail.model_version)))
          }
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Frame images unavailable')
      }
    }
    sign()
    const timer = window.setInterval(sign, MEDIA_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [condition, detail])

  return { detail, frames, loading, error }
}
