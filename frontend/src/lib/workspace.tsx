// Shared, polled view of the signed-in user's evidence: uploads, Arduino recordings, devices and events.
// One provider so every page sees the same data and a single set of timers runs.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  api,
  apiConfigured,
  apiHealth,
  sha256Hex,
  supabase,
  uploadContentType,
  uploadFilename,
  uploadToSignedUrl,
  validateUpload,
  type Condition,
  type Device,
  type DeviceEvent,
  type Investigation,
  type UseCase,
  type Video,
} from './api'
import { useAuth } from './auth'
import { fromRecording, fromVideo, type Footage } from './footage'
import { listRecordings, type Recording } from './recordings'

export type UploadStage = 'hashing' | 'reserving' | 'uploading' | 'verifying' | 'queueing' | 'done'

export interface UploadProgress {
  stage: UploadStage
  /** Byte progress, only during `uploading`. */
  percent?: number
}

export interface UploadResult {
  video: Video
  duplicate: boolean
  queued: boolean
}

interface SourceState<T> {
  data: T
  error: string
  loaded: boolean
}

interface WorkspaceState {
  videos: SourceState<Video[]>
  recordings: SourceState<Recording[]>
  devices: SourceState<Device[]>
  events: SourceState<DeviceEvent[]>
  /** Keyed by video ID; null = completed job without a stored investigation. */
  investigations: Record<string, Investigation | null>
  apiOnline: boolean | null
  footage: Footage[]
  refreshVideos: () => Promise<void>
  refreshDevices: () => Promise<void>
  uploadVideo: (
    file: File,
    useCase: UseCase,
    conditions: Condition[],
    onProgress: (progress: UploadProgress) => void,
  ) => Promise<UploadResult>
}

const WorkspaceContext = createContext<WorkspaceState | null>(null)

const empty = <T,>(data: T): SourceState<T> => ({ data, error: '', loaded: false })

/** Runs `task` now and every `ms` while the tab is visible; stops when `enabled` turns false. */
function usePolling(task: () => Promise<void>, ms: number, enabled: boolean) {
  const taskRef = useRef(task)
  taskRef.current = task
  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined
    let stopped = false
    const run = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') await taskRef.current().catch(() => undefined)
      if (!stopped) timer = window.setTimeout(run, ms)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer)
        run()
      }
    }
    run()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, ms])
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Request failed'
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { token, userId } = useAuth()
  const [videos, setVideos] = useState(() => empty<Video[]>([]))
  const [recordings, setRecordings] = useState(() => empty<Recording[]>([]))
  const [devices, setDevices] = useState(() => empty<Device[]>([]))
  const [events, setEvents] = useState(() => empty<DeviceEvent[]>([]))
  const [investigations, setInvestigations] = useState<Record<string, Investigation | null>>({})
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const investigationKeys = useRef(new Map<string, string>())
  // Results that arrive after a sign-out or account switch are discarded.
  const owner = useRef(userId)
  const tokenRef = useRef(token)
  tokenRef.current = token

  useEffect(() => {
    owner.current = userId
    setVideos(empty([]))
    setRecordings(empty([]))
    setDevices(empty([]))
    setEvents(empty([]))
    setInvestigations({})
    investigationKeys.current.clear()
  }, [userId])

  const signedIn = Boolean(token)
  const guard = useCallback(<T,>(set: (value: T) => void) => {
    const startedFor = owner.current
    return (value: T) => {
      if (owner.current === startedFor) set(value)
    }
  }, [])

  const refreshVideos = useCallback(async () => {
    if (!apiConfigured || !tokenRef.current) return
    const startedFor = owner.current
    try {
      const data = await api<Video[]>('/videos', tokenRef.current)
      if (owner.current === startedFor) setVideos({ data, error: '', loaded: true })
    } catch (error) {
      // Keep the last good list on a transient failure; just surface the error.
      if (owner.current === startedFor) setVideos((current) => ({ ...current, error: message(error), loaded: true }))
    }
  }, [])

  const refreshRecordings = useCallback(async () => {
    const apply = guard(setRecordings)
    try {
      apply({ data: await listRecordings(), error: '', loaded: true })
    } catch (error) {
      apply({ data: [], error: message(error), loaded: true })
    }
  }, [guard])

  const refreshDevices = useCallback(async () => {
    if (!apiConfigured || !tokenRef.current) return
    const apply = guard(setDevices)
    try {
      apply({ data: await api<Device[]>('/api/devices', tokenRef.current), error: '', loaded: true })
    } catch (error) {
      apply({ data: [], error: message(error), loaded: true })
    }
  }, [guard])

  const refreshEvents = useCallback(async () => {
    const apply = guard(setEvents)
    const { data, error } = await supabase()
      .from('device_events')
      .select('id,device_id,event_type,event_time,sensor_data_json,linked_video_id')
      .order('event_time', { ascending: false })
      .limit(50)
    apply(error ? { data: [], error: error.message, loaded: true } : { data: (data ?? []) as DeviceEvent[], error: '', loaded: true })
  }, [guard])

  const refreshHealth = useCallback(async () => setApiOnline(await apiHealth()), [])

  usePolling(refreshVideos, 5_000, signedIn && apiConfigured)
  usePolling(refreshRecordings, 15_000, signedIn)
  usePolling(refreshDevices, 20_000, signedIn && apiConfigured)
  usePolling(refreshEvents, 10_000, signedIn)
  usePolling(refreshHealth, 30_000, signedIn && apiConfigured)

  // Investigations are immutable per job: fetch once per completed run, a few at a time.
  useEffect(() => {
    if (!token) return
    const pending = videos.data.filter((video) => {
      if (video.status !== 'completed') return false
      const key = video.processing_finished_at ?? 'done'
      return investigationKeys.current.get(video.id) !== key
    })
    if (pending.length === 0) return
    pending.forEach((video) => investigationKeys.current.set(video.id, video.processing_finished_at ?? 'done'))
    const apply = guard((entries: [string, Investigation | null][]) =>
      setInvestigations((current) => ({ ...current, ...Object.fromEntries(entries) })),
    )
    let cancelled = false
    ;(async () => {
      for (let index = 0; index < pending.length && !cancelled; index += 4) {
        const batch = pending.slice(index, index + 4)
        const results = await Promise.all(
          batch.map(async (video): Promise<[string, Investigation | null] | null> => {
            try {
              return [video.id, await api<Investigation | null>(`/videos/${video.id}/investigation`, token)]
            } catch {
              investigationKeys.current.delete(video.id) // retry on the next poll
              return null
            }
          }),
        )
        apply(results.filter((entry): entry is [string, Investigation | null] => entry !== null))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [guard, token, videos.data])

  const uploadVideo = useCallback<WorkspaceState['uploadVideo']>(
    async (file, useCase, conditions, onProgress) => {
      const startedFor = owner.current
      const ensureCurrent = () => {
        if (owner.current !== startedFor) throw new Error('Your session changed during the upload. Sign in and retry.')
      }
      const problem = validateUpload(file)
      if (problem) throw new Error(problem)
      const contentType = uploadContentType(file.name) as string

      onProgress({ stage: 'hashing' })
      const sha256 = await sha256Hex(file)
      ensureCurrent()

      onProgress({ stage: 'reserving' })
      const init = await api<{ video: Video; duplicate: boolean; upload_url: string | null }>(
        '/videos/upload-init',
        tokenRef.current,
        { filename: uploadFilename(file.name), content_type: contentType, size_bytes: file.size, sha256, use_case: useCase },
      )
      ensureCurrent()

      // A duplicate that is already verified returns no upload URL: never upload twice.
      if (init.upload_url) {
        onProgress({ stage: 'uploading', percent: 0 })
        await uploadToSignedUrl(init.upload_url, file, contentType, (percent) => onProgress({ stage: 'uploading', percent }))
        ensureCurrent()
      }

      onProgress({ stage: 'verifying' })
      const video = await api<Video>(`/videos/${init.video.id}/upload-complete`, tokenRef.current, {})
      ensureCurrent()

      // Duplicates are not reprocessed automatically; only explicit reprocessing does that.
      let queued = false
      if (!init.duplicate || video.status === 'uploaded') {
        onProgress({ stage: 'queueing' })
        await api(`/videos/${video.id}/process`, tokenRef.current, { conditions })
        queued = true
      }
      onProgress({ stage: 'done' })
      await refreshVideos()
      return { video, duplicate: init.duplicate, queued }
    },
    [refreshVideos],
  )

  const footage = useMemo(
    () =>
      [...videos.data.map(fromVideo), ...recordings.data.map(fromRecording)].sort(
        (a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt),
      ),
    [recordings.data, videos.data],
  )

  const value = useMemo<WorkspaceState>(
    () => ({
      videos,
      recordings,
      devices,
      events,
      investigations,
      apiOnline,
      footage,
      refreshVideos,
      refreshDevices,
      uploadVideo,
    }),
    [apiOnline, devices, events, footage, investigations, recordings, refreshDevices, refreshVideos, uploadVideo, videos],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return value
}
