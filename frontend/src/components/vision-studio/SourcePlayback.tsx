import { useEffect, useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { api, type Condition, type Video } from '../../lib/api'
import { conditionLabels } from '../../lib/footage'
import { signResultMedia } from '../../lib/recordings'
import { formatPreciseTime } from './analysis'

const REFRESH_MS = 12 * 60_000 // signed links expire after 15 minutes

interface SourcePlaybackProps {
  token: string
  /** Upload: plays the original video. */
  videoId?: string | null
  /** Recording: plays the processor's annotated clip for this condition. */
  clipPath?: string | null
  condition: Condition
  timestampSec: number | null
}

export function SourcePlayback({ token, videoId, clipPath, condition, timestampSec }: SourcePlaybackProps) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [sync, setSync] = useState(true)
  const player = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    setUrl(null)
    setError('')
    if (!open || (!videoId && !clipPath)) return
    let active = true
    const load = async () => {
      try {
        if (videoId) {
          const video = await api<Video>(`/videos/${videoId}`, token)
          if (active) setUrl(video.playback_url ?? null)
        } else if (clipPath) {
          const urls = await signResultMedia([clipPath])
          if (active) setUrl(urls.get(clipPath) ?? null)
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Playback unavailable')
      }
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [clipPath, open, token, videoId])

  // Follow the inspected frame. Sampled timestamps are on the original timeline.
  useEffect(() => {
    const element = player.current
    if (!sync || !element || timestampSec === null || !element.paused) return
    if (Math.abs(element.currentTime - timestampSec) > 0.05) element.currentTime = timestampSec
  }, [sync, timestampSec, url])

  if (!videoId && !clipPath) return null

  return (
    <details className="vs-run-details vs-playback" onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <Clapperboard size={12} aria-hidden="true" />
        {videoId ? 'Original video' : `Annotated clip · ${conditionLabels[condition]}`}
      </summary>
      {error && <p className="nw-inline-error" role="alert">{error}</p>}
      {open && !url && !error && <p className="cc-panel-footnote">Loading private playback…</p>}
      {url && (
        <>
          <video ref={player} src={url} controls playsInline preload="metadata" />
          <label className="dv-check">
            <input type="checkbox" checked={sync} onChange={(event) => setSync(event.currentTarget.checked)} />
            <span>
              Seek to the inspected frame{timestampSec !== null ? ` (${formatPreciseTime(timestampSec)})` : ''}
              <small>
                {videoId
                  ? 'Unprocessed original; degradations are applied only to sampled frames.'
                  : 'Boxes and the sensor overlay were drawn by the recordings processor.'}
              </small>
            </span>
          </label>
        </>
      )}
    </details>
  )
}
