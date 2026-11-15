import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { api, CONDITIONS, MODELS, type Condition, type ModelName, type VideoStatusResponse } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { conditionLabels, type Footage } from '../../lib/footage'
import { useWorkspace } from '../../lib/workspace'

interface ReinvestigatePanelProps {
  footage: Footage
  onCancel: () => void
  /** Called once the new run is queued. */
  onQueued: (message: string) => void
}

const FPS = [1, 2, 5, 10]

/** Starts a fresh analysis attempt. Earlier attempts and their reviews stay stored. */
export function ReinvestigatePanel({ footage, onCancel, onQueued }: ReinvestigatePanelProps) {
  const { token } = useAuth()
  const { refreshVideos } = useWorkspace()
  const [fps, setFps] = useState(5)
  const [threshold, setThreshold] = useState(0.75)
  const [floor, setFloor] = useState(0.4)
  const [conditions, setConditions] = useState<Condition[]>([...CONDITIONS])
  const [sensorAssist, setSensorAssist] = useState(true)
  const [model, setModel] = useState<ModelName>('yolo11m')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isUpload = footage.kind === 'upload'

  // Start from the settings of the most recent run.
  useEffect(() => {
    if (!isUpload) return
    let active = true
    api<VideoStatusResponse>(`/videos/${footage.id}/status`, token)
      .then(({ job }) => {
        if (!active || !job?.config) return
        setFps(job.config.sampling_fps ?? 5)
        setThreshold(job.config.threshold ?? 0.75)
        setFloor(job.config.review_floor ?? 0.4)
        if (job.config.conditions?.length) setConditions(CONDITIONS.filter((c) => job.config.conditions.includes(c)))
        setSensorAssist(job.config.sensor_assist ?? true)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [footage.id, isUpload, token])

  async function submit() {
    setBusy(true)
    setError('')
    try {
      if (isUpload) {
        await api(`/videos/${footage.id}/process`, token, {
          sampling_fps: fps,
          threshold,
          review_floor: Math.min(floor, threshold - 0.01),
          conditions: conditions.length ? conditions : ['clear'],
          sensor_assist: sensorAssist,
          model,
          reprocess: true,
        })
        await refreshVideos()
        onQueued(`Reinvestigation of ${footage.title} queued as a new attempt. Results refresh automatically.`)
      } else {
        const result = await api<{ note: string }>(`/recordings/${footage.id}/reinvestigate`, token, {})
        onQueued(`Reinvestigation of ${footage.title} requested. ${result.note}`)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not queue the reinvestigation')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nw-reinvestigate" role="group" aria-labelledby="nw-reinvestigate-title">
      <strong id="nw-reinvestigate-title">Reinvestigate “{footage.title}”</strong>
      {isUpload ? (
        <>
          <p>Runs detection and tracking again as a new attempt. Earlier results and reviews stay stored.</p>
          <div className="nw-reinvestigate-grid">
            <label>
              <span>Model</span>
              <select value={model} disabled={busy} onChange={(e) => setModel(e.currentTarget.value as ModelName)}>
                {(Object.keys(MODELS) as ModelName[]).map((name) => (
                  <option key={name} value={name}>{MODELS[name].label}: {MODELS[name].note}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Sampling</span>
              <select value={fps} disabled={busy} onChange={(e) => setFps(Number(e.currentTarget.value))}>
                {FPS.map((value) => <option key={value} value={value}>{value} fps</option>)}
              </select>
            </label>
            <label>
              <span>Accepted threshold · {Math.round(threshold * 100)}%</span>
              <input type="range" min={40} max={100} value={Math.round(threshold * 100)} disabled={busy}
                onChange={(e) => {
                  const next = Number(e.currentTarget.value) / 100
                  setThreshold(next)
                  setFloor((current) => Math.min(current, Math.min(0.75, next - 0.01)))
                }} />
            </label>
            <label>
              <span>Review floor · {Math.round(floor * 100)}%</span>
              <input type="range" min={10} max={Math.min(75, Math.round(threshold * 100) - 1)} value={Math.round(floor * 100)}
                disabled={busy} onChange={(e) => setFloor(Number(e.currentTarget.value) / 100)} />
            </label>
          </div>
          <fieldset className="nw-reinvestigate-conditions" disabled={busy}>
            <legend>Visibility conditions</legend>
            {CONDITIONS.map((condition) => (
              <label key={condition}>
                <input
                  type="checkbox"
                  checked={condition === 'clear' || conditions.includes(condition)}
                  disabled={condition === 'clear'}
                  onChange={(e) =>
                    setConditions((current) =>
                      e.currentTarget.checked ? [...new Set([...current, condition])] : current.filter((c) => c !== condition),
                    )
                  }
                />
                {conditionLabels[condition]}
              </label>
            ))}
            <label>
              <input type="checkbox" checked={sensorAssist} onChange={(e) => setSensorAssist(e.currentTarget.checked)} />
              Sensor-assisted tracking
            </label>
          </fieldset>
        </>
      ) : (
        <p>
          The recordings watcher reruns detection, tracking and sensor fusion from scratch on its next poll. The current
          result stays visible until the new one is published.
        </p>
      )}
      {error && <p className="nw-inline-error" role="alert">{error}</p>}
      <div className="nw-reinvestigate-actions">
        <button className="cc-button cc-button--quiet" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="cc-button cc-button--primary" type="button" disabled={busy} onClick={submit}>
          <RotateCcw size={14} aria-hidden="true" /> {busy ? 'Queueing…' : 'Start reinvestigation'}
        </button>
      </div>
    </div>
  )
}
