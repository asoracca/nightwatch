import { useState } from 'react'
import { Film, Settings2, ShieldAlert, Table2 } from 'lucide-react'
import { SectionHeader } from '../common/SectionHeader'
import { StatusBadge, type StatusTone } from '../common/StatusBadge'
import { CONDITIONS, type Condition } from '../../lib/api'
import { conditionLabels, percent } from '../../lib/footage'
import {
  signResultMedia,
  verdictLabels,
  type RecordingResultDetail,
  type RecordingResultSummary,
  type ReviewPriority,
} from '../../lib/recordings'

export const priorityTone: Record<ReviewPriority, StatusTone> = { high: 'pink', medium: 'amber', low: 'muted' }

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' })
const num = (value: number | null | undefined, digits = 0, unit = '') =>
  value === null || value === undefined ? '—' : `${value.toFixed(digits)}${unit}`
const flag = (value: boolean | null | undefined) => (value === true ? 'yes' : value === false ? 'no' : '—')

function isDetail(result: RecordingResultSummary | RecordingResultDetail): result is RecordingResultDetail {
  return 'sensor_timeline' in result
}

function AnnotatedClips({ clips }: { clips: Partial<Record<Condition, string>> }) {
  const [urls, setUrls] = useState<Map<string, string> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const entries = CONDITIONS.filter((c) => clips[c]).map((c) => [c, clips[c]!] as const)
  if (entries.length === 0) return null
  return (
    <details
      className="vs-run-details"
      onToggle={(event) => {
        if (!(event.currentTarget as HTMLDetailsElement).open || urls || busy) return
        setBusy(true)
        signResultMedia(entries.map(([, path]) => path))
          .then(setUrls)
          .catch((caught: Error) => setError(caught.message))
          .finally(() => setBusy(false))
      }}
    >
      <summary><Film size={12} aria-hidden="true" /> Annotated clips ({entries.length})</summary>
      {error && <p className="nw-inline-error">{error}</p>}
      {busy && <p className="cc-panel-footnote">Signing links…</p>}
      {urls && (
        <div className="vs-clip-grid">
          {entries.map(([condition, path]) => (
            <figure key={condition}>
              <figcaption>{conditionLabels[condition]}</figcaption>
              {urls.get(path) ? (
                <video src={urls.get(path)} controls preload="metadata" playsInline />
              ) : (
                <span className="cc-panel-footnote">Unavailable</span>
              )}
            </figure>
          ))}
        </div>
      )}
    </details>
  )
}

function SensorTimeline({ detail }: { detail: RecordingResultDetail }) {
  const rows = detail.sensor_timeline ?? []
  if (rows.length === 0) return null
  return (
    <details className="vs-run-details">
      <summary><Table2 size={12} aria-hidden="true" /> Sensor timeline ({rows.length} s)</summary>
      <div className="vs-table-scroll">
        <table className="vs-compare-table vs-timeline-table">
          <thead>
            <tr>
              <th scope="col">s</th><th scope="col">Dist mm</th><th scope="col">Temp °C</th><th scope="col">RH %</th>
              <th scope="col">Accel</th><th scope="col">Vib</th><th scope="col">In range</th><th scope="col">Blocked</th>
              <th scope="col">Moving</th><th scope="col">Detection</th><th scope="col">Person (model→fused)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.second} className={r.object_in_range && !r.any_detection ? 'is-miss' : undefined}>
                <th scope="row">{r.second}</th>
                <td>{num(r.distance_mm)}</td>
                <td>{num(r.temp_c, 1)}</td>
                <td>{num(r.humidity_pct)}</td>
                <td>{num(r.accel_mean_mm_s2)}</td>
                <td>{num(r.vibration_mm_s2)}</td>
                <td>{flag(r.object_in_range)}</td>
                <td>{flag(r.obstructed)}</td>
                <td>{flag(r.camera_moving)}</td>
                <td>{flag(r.any_detection)}</td>
                <td>
                  {r.person_score == null ? '—' : `${percent(r.yolo_person ?? null)} → ${percent(r.person_score)}${r.corroborated ? ' ⚡' : ''}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cc-panel-footnote">Highlighted rows: the distance sensor saw an object in range but the camera recognised nothing.</p>
    </details>
  )
}

export function RecordingVerdict({ result }: { result: RecordingResultSummary | RecordingResultDetail | null }) {
  const env = result?.environment ?? {}
  const labels = Object.entries(result?.label_counts ?? {}).sort((a, b) => b[1] - a[1])
  const detail = result && isDetail(result) ? result : null
  const byCondition = detail?.summary?.metrics_json?.by_condition ?? {}
  const conditionRows = CONDITIONS.filter((c) => byCondition[c])
  const clearDetections = byCondition.clear?.detections ?? 0

  return (
    <section className="cc-panel vs-panel vs-report-panel" aria-labelledby="vs-verdict-heading">
      <SectionHeader
        eyebrow={`Sensor fusion · ${detail?.fusion_version ?? 'rules'}`}
        title="Fusion verdict"
        titleId="vs-verdict-heading"
        action={
          result?.review_priority ? (
            <StatusBadge tone={priorityTone[result.review_priority]}>{result.review_priority} priority</StatusBadge>
          ) : undefined
        }
      />
      {!result ? (
        <p className="cc-panel-footnote">
          Not processed yet. Run <code>python -m nightwatch.recordings --watch</code> on the processing machine.
        </p>
      ) : result.status === 'failed' ? (
        <p className="nw-inline-error" role="alert">{result.error_message ?? 'Processing failed'}</p>
      ) : (
        <>
          <div className="vs-verdict">
            <ShieldAlert size={18} aria-hidden="true" />
            <div>
              <strong>{result.verdict ? verdictLabels[result.verdict] : 'No verdict'}</strong>
              <span>
                Fused person score {percent(result.person_score)} · model-only max {percent(result.max_person_confidence)}
              </span>
            </div>
          </div>
          {result.reasons.length > 0 && (
            <ul className="vs-reasons">
              {result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          )}
          <dl className="vs-report-stats vs-report-stats--3">
            <div><dt>Condition-frames</dt><dd>{result.total_frames ?? 0}</dd></div>
            <div><dt>Frames with detections</dt><dd>{result.frames_with_detections ?? 0}</dd></div>
            <div><dt>Accepted detections</dt><dd>{result.total_detections ?? 0}</dd></div>
            <div><dt>Mean confidence</dt><dd>{percent(result.average_confidence, 1)}</dd></div>
            <div><dt>Review frames</dt><dd>{result.review_candidate_count ?? 0}</dd></div>
            <div><dt>Labels</dt><dd>{labels.length ? labels.map(([l, c]) => `${l} ${c}`).join(' · ') : '—'}</dd></div>
          </dl>

          {conditionRows.length > 0 && (
            <table className="vs-compare-table">
              <caption>Accepted detections by visibility condition · counts, not ground-truth recall</caption>
              <thead>
                <tr><th scope="col">Condition</th><th scope="col">Frames</th><th scope="col">Detections</th><th scope="col">vs clear</th><th scope="col">Review</th></tr>
              </thead>
              <tbody>
                {conditionRows.map((c) => {
                  const s = byCondition[c]!
                  const delta = c === 'clear' || clearDetections === 0 ? null : (s.detections - clearDetections) / clearDetections
                  return (
                    <tr key={c}>
                      <th scope="row">{conditionLabels[c]}</th>
                      <td>{s.frames}</td>
                      <td>{s.detections}</td>
                      <td className={delta !== null && delta < 0 ? 'is-loss' : undefined}>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%`}</td>
                      <td>{s.review_frames}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          <dl className="vs-kv">
            <div><dt>Temperature</dt><dd>{num(env.temp_c_min, 1)}–{num(env.temp_c_max, 1, ' °C')} · rise {num(env.temp_rise_c, 1, ' °C')}</dd></div>
            <div><dt>Max humidity</dt><dd>{num(env.humidity_pct_max, 0, '%')}</dd></div>
            <div>
              <dt>Hazard flags</dt>
              <dd>
                {[env.high_humidity && 'high humidity', env.heat_rising && 'heat rising', env.high_temperature && 'high temperature']
                  .filter(Boolean)
                  .join(' · ') || 'none'}
              </dd>
            </div>
            {env.sensor_coverage && (
              <div className="vs-kv-wide">
                <dt>Sensor coverage</dt>
                <dd>{Object.entries(env.sensor_coverage).map(([name, coverage]) => `${name} ${coverage}`).join(' · ')}</dd>
              </div>
            )}
          </dl>

          {detail && (
            <>
              <details className="vs-run-details">
                <summary><Settings2 size={12} aria-hidden="true" /> Run settings & provenance</summary>
                <dl className="vs-kv">
                  <div><dt>Model</dt><dd>{detail.model_name ?? '—'}</dd></div>
                  <div><dt>Version</dt><dd className="vs-mono">{detail.model_version ?? '—'}</dd></div>
                  <div><dt>Fusion rules</dt><dd>{detail.fusion_version ?? '—'}</dd></div>
                  <div><dt>Processed</dt><dd>{dateTime.format(new Date(detail.processed_at))}</dd></div>
                  <div><dt>Sampling</dt><dd>{num(detail.config?.sampling_fps, 1, ' fps')}</dd></div>
                  <div><dt>Threshold · floor</dt><dd>{percent(detail.config?.threshold ?? null)} · {percent(detail.config?.review_floor ?? null)}</dd></div>
                  <div><dt>Conditions</dt><dd>{(detail.config?.conditions ?? []).map((c) => conditionLabels[c]).join(', ') || '—'}</dd></div>
                  <div><dt>Sensor-assisted tracking</dt><dd>{detail.config?.sensor_assist === false ? 'Off' : detail.config?.sensor_assist ? 'On' : 'Not recorded'}</dd></div>
                  <div>
                    <dt>Source video</dt>
                    <dd>
                      {detail.video_meta
                        ? `${num(detail.video_meta.duration_seconds, 1, ' s')} · ${detail.video_meta.width ?? '—'}×${detail.video_meta.height ?? '—'} · ${num(detail.video_meta.fps, 1, ' fps')}`
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </details>
              <AnnotatedClips clips={detail.annotated_clips ?? {}} />
              <SensorTimeline detail={detail} />
            </>
          )}
          <p className="cc-panel-footnote">Fusion rules are heuristics; no ground truth shows they improve recall or precision.</p>
        </>
      )}
    </section>
  )
}
