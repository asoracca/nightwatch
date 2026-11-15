import { useState, type ReactNode } from 'react'
import { Activity, Link2, ScanFace, Thermometer, Waves, type LucideIcon } from 'lucide-react'
import { SectionHeader } from '../common/SectionHeader'
import { api, type Device, type DeviceEvent } from '../../lib/api'
import { percent } from '../../lib/footage'
import type { SensorSecond } from '../../lib/recordings'
import { formatPreciseTime } from './analysis'

interface SensorRow {
  key: string
  label: string
  Icon: LucideIcon
  tone: 'cyan' | 'purple' | 'amber' | 'pink'
  value: string
  unit: string
  /** 0–1, for the meter. */
  level: number
  caption: string
}

const fmt = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined ? '—' : value.toFixed(digits)

function recordingRows(second: SensorSecond | null): SensorRow[] {
  const d = second?.distance_mm ?? null
  const accel = second?.accel_mean_mm_s2 ?? null
  const vibration = second?.vibration_mm_s2 ?? null
  return [
    {
      key: 'distance',
      label: 'Distance',
      Icon: Waves,
      tone: 'cyan',
      value: fmt(d),
      unit: 'mm',
      level: d === null ? 0 : Math.max(0.05, 1 - Math.min(d, 1300) / 1300),
      caption:
        second?.obstructed === true
          ? 'Under 150 mm: beam or lens likely blocked'
          : second?.object_in_range === true
            ? 'Object in range of the centre beam'
            : d === null
              ? 'No reading this second'
              : 'Nothing in reliable range (≤ 1300 mm)',
    },
    {
      key: 'movement',
      label: 'Movement',
      Icon: Activity,
      tone: 'purple',
      value: fmt(accel),
      unit: 'mm/s²',
      level: accel === null ? 0 : Math.min(1, Math.max(accel, vibration ?? 0) / 1000),
      caption:
        second?.camera_moving === true
          ? `Camera moving (vibration ${fmt(vibration)} mm/s²): detections less reliable`
          : second?.camera_moving === false
            ? 'Camera steady'
            : 'No reading this second',
    },
    {
      key: 'thermal',
      label: 'Temperature',
      Icon: Thermometer,
      tone: 'amber',
      value: fmt(second?.temp_c, 1),
      unit: '°C',
      level: second?.temp_c == null ? 0 : Math.min(1, Math.max(0, second.temp_c) / 50),
      caption: second?.humidity_pct == null ? 'No humidity reading' : `Humidity ${fmt(second.humidity_pct)}%`,
    },
    {
      key: 'person',
      label: 'Fused person score',
      Icon: ScanFace,
      tone: 'pink',
      value: second?.person_score == null ? '—' : percent(second.person_score),
      unit: '',
      level: second?.person_score ?? 0,
      caption:
        second?.person_score == null
          ? 'No person detected in this second'
          : second.corroborated
            ? `Model ${percent(second.yolo_person)} + distance corroboration`
            : `Model only (${percent(second.yolo_person)})`,
    },
  ]
}

function eventRows(event: DeviceEvent | null): SensorRow[] {
  const data = event?.sensor_data_json ?? {}
  return [
    {
      key: 'distance',
      label: 'Distance',
      Icon: Waves,
      tone: 'cyan',
      value: fmt(data.distance_cm),
      unit: 'cm',
      level: data.distance_cm == null ? 0 : Math.max(0.05, 1 - Math.min(data.distance_cm, 400) / 400),
      caption: 'Reported by the linked device',
    },
    {
      key: 'movement',
      label: 'Motion',
      Icon: Activity,
      tone: 'purple',
      value: data.motion == null ? '—' : data.motion ? 'Yes' : 'No',
      unit: '',
      level: data.motion ? 1 : 0,
      caption: event ? event.event_type.replaceAll('_', ' ') : 'No event near this frame',
    },
    {
      key: 'thermal',
      label: 'Temperature',
      Icon: Thermometer,
      tone: 'amber',
      value: fmt(data.temperature_c, 1),
      unit: '°C',
      level: data.temperature_c == null ? 0 : Math.min(1, Math.max(0, data.temperature_c) / 50),
      caption: event ? `Event at ${new Date(event.event_time).toLocaleTimeString()}` : '—',
    },
  ]
}

interface SensorReadingsProps {
  timestampSec: number | null
  /** Arduino recording: one fused reading per second. */
  second?: SensorSecond | null
  /** Upload: nearest linked device event. */
  event?: DeviceEvent | null
  mode: 'upload' | 'recording' | 'none'
  footer?: ReactNode
}

export function SensorReadings({ timestampSec, second = null, event = null, mode, footer }: SensorReadingsProps) {
  const rows = mode === 'recording' ? recordingRows(second) : eventRows(event)
  const hasData = mode === 'recording' ? second !== null : event !== null

  return (
    <section className="cc-panel vs-panel vs-sensor-panel" aria-labelledby="vs-sensor-heading">
      <SectionHeader
        eyebrow={mode === 'recording' ? 'Sensor fusion · Modulino' : 'Linked device events'}
        title="Sensor readings"
        titleId="vs-sensor-heading"
        action={timestampSec !== null ? <span className="vs-small-mono">@ {formatPreciseTime(timestampSec)}</span> : undefined}
      />
      {mode === 'none' ? (
        <p className="cc-panel-footnote">Select footage to see aligned sensor readings.</p>
      ) : (
        <>
          <ul className="vs-sensor-list">
            {rows.map(({ key, label, Icon, tone, value, unit, level, caption }) => (
              <li key={key} className={`vs-sensor vs-sensor--${tone}`}>
                <span className="vs-sensor-icon" aria-hidden="true"><Icon size={14} /></span>
                <div className="vs-sensor-main">
                  <div className="vs-sensor-top">
                    <span>{label}</span>
                    <strong>{value}<small>{value === '—' || !unit ? '' : ` ${unit}`}</small></strong>
                  </div>
                  <div className="vs-sensor-meter" aria-hidden="true"><span style={{ width: `${level * 100}%` }} /></div>
                  <span className="vs-sensor-caption">{caption}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="cc-panel-footnote">
            {mode === 'recording'
              ? 'With sensor-assisted tracking, these readings raise person scores before ByteTrack (⚡ in results); raw model scores are kept. Sensors cannot identify objects; the weights are heuristics, not measured accuracy.'
              : hasData
                ? 'Linked readings adjust person scores before tracking when sensor-assisted tracking is on (⚡ in results); the raw model score is kept. They do not by themselves establish a person’s presence.'
                : 'No linked device event within 2 seconds of this frame.'}
          </p>
        </>
      )}
      {footer}
    </section>
  )
}

/** Links an upload to a device's capture interval (immutable once set). */
export function DeviceLinkForm({
  videoId,
  token,
  devices,
  onLinked,
}: {
  videoId: string
  token: string
  devices: Device[]
  onLinked: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const enabled = devices.filter((device) => device.enabled)
  if (enabled.length === 0) {
    return <p className="cc-panel-footnote">Register an Arduino device in the Command Center to link sensor events.</p>
  }
  return (
    <form
      className="vs-link-form"
      onSubmit={async (submitEvent) => {
        submitEvent.preventDefault()
        const form = new FormData(submitEvent.currentTarget)
        setBusy(true)
        setMessage('')
        try {
          await api(`/videos/${videoId}/device-link`, token, {
            device_id: String(form.get('device_id')),
            recording_started_at: new Date(String(form.get('started'))).toISOString(),
          })
          setMessage('Linked. Only a unique overlapping capture interval is matched.')
          onLinked()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Link failed')
        } finally {
          setBusy(false)
        }
      }}
    >
      <span className="vs-field-label"><Link2 size={12} aria-hidden="true" /> Link to a device</span>
      <div className="vs-link-fields">
        <label>
          <span className="sr-only">Device</span>
          <select name="device_id" required disabled={busy}>
            {enabled.map((device) => (
              <option key={device.device_id} value={device.device_id}>{device.label} · {device.device_id}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Actual recording start (local time)</span>
          <input type="datetime-local" name="started" step="1" required disabled={busy} />
        </label>
      </div>
      <button className="cc-button cc-button--quiet" type="submit" disabled={busy}>
        {busy ? 'Linking…' : 'Link capture interval'}
      </button>
      <p className="vs-field-hint">Use the real recording start time, not the upload time. The link cannot be changed.</p>
      {message && <p className="vs-field-hint" role="status">{message}</p>}
    </form>
  )
}
