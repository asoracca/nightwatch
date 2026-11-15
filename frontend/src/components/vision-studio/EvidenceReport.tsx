import { useState } from 'react'
import { FileSearch, Quote, Settings2 } from 'lucide-react'
import { SectionHeader } from '../common/SectionHeader'
import { StatusBadge } from '../common/StatusBadge'
import { api, CONDITIONS, type AssistantCitation, type AssistantReport, type Investigation } from '../../lib/api'
import { capitalize, conditionLabels, percent } from '../../lib/footage'
import { formatPreciseTime } from './analysis'

const topics: { id: AssistantReport['topic']; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'flags', label: 'Flags' },
  { id: 'comparison', label: 'Comparison' },
]

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' })
const when = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date)
}

/** Clear-versus-degraded counts. Descriptive only: not measured recall. */
export function ConditionComparison({ investigation }: { investigation: Investigation }) {
  const byCondition = investigation.metrics_json?.by_condition ?? {}
  const inference = investigation.metrics_json?.mean_inference_ms_by_condition ?? {}
  const clear = byCondition.clear?.detections ?? 0
  const rows = CONDITIONS.filter((condition) => byCondition[condition])
  const max = Math.max(1, ...rows.map((condition) => byCondition[condition]?.detections ?? 0))
  const showInference = rows.some((condition) => inference[condition] !== undefined)
  return (
    <table className="vs-compare-table">
      <caption>Accepted observations by visibility condition · counts, not ground-truth recall</caption>
      <thead>
        <tr>
          <th scope="col">Condition</th>
          <th scope="col">Frames</th>
          <th scope="col">Observations</th>
          <th scope="col">vs clear</th>
          <th scope="col">Review</th>
          {showInference && <th scope="col">ms/frame</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((condition) => {
          const stats = byCondition[condition]!
          const delta = condition === 'clear' || clear === 0 ? null : (stats.detections - clear) / clear
          return (
            <tr key={condition}>
              <th scope="row">{conditionLabels[condition]}</th>
              <td>{stats.frames}</td>
              <td>
                <span className="vs-compare-bar" aria-hidden="true">
                  <span style={{ width: `${(stats.detections / max) * 100}%` }} />
                </span>
                {stats.detections}
              </td>
              <td className={delta !== null && delta < 0 ? 'is-loss' : undefined}>
                {delta === null ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%`}
              </td>
              <td>{stats.review_frames}</td>
              {showInference && <td>{inference[condition]?.toFixed(0) ?? '—'}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Every stored run parameter and semantic note for one investigation. */
export function RunDetails({ investigation }: { investigation: Investigation }) {
  const m = investigation.metrics_json ?? { by_condition: {} }
  const fps = (value: number | undefined) => (value === undefined ? '—' : `${Number(value.toFixed(2))} fps`)
  return (
    <details className="vs-run-details">
      <summary><Settings2 size={12} aria-hidden="true" /> Run settings & provenance</summary>
      <dl className="vs-kv">
        <div><dt>Job</dt><dd className="vs-mono">{investigation.job_id}</dd></div>
        <div><dt>Investigation</dt><dd className="vs-mono">{investigation.id}</dd></div>
        <div><dt>Completed</dt><dd>{when(investigation.completed_at ?? investigation.created_at)}</dd></div>
        <div><dt>Status</dt><dd>{investigation.processing_status}</dd></div>
        <div><dt>Use case</dt><dd>{capitalize(investigation.affected_use_case)} <small>(chosen by uploader)</small></dd></div>
        <div><dt>Sampling</dt><dd>{fps(m.requested_sampling_fps)} requested · {fps(m.effective_sampling_fps)} effective</dd></div>
        <div><dt>Accepted threshold</dt><dd>{percent(m.threshold ?? null)}</dd></div>
        <div><dt>Review floor</dt><dd>{percent(m.review_floor ?? null)}</dd></div>
        <div>
          <dt>Sensor-assisted tracking</dt>
          <dd>
            {m.sensor_assist
              ? `${m.sensor_assist.enabled ? 'On' : 'Off'} (${m.sensor_assist.version}) · ${m.sensor_assist.seconds_with_readings} s with readings · ${m.sensor_assisted_detections ?? 0} assisted detections`
              : 'Not recorded (run before sensor assist)'}
          </dd>
        </div>
        <div><dt>Ground truth</dt><dd>{m.ground_truth_available ? 'Available' : 'Not available: miss rate is unmeasured'}</dd></div>
        {m.timestamp_semantics && <div className="vs-kv-wide"><dt>Timestamps</dt><dd>{m.timestamp_semantics}</dd></div>}
        {m.tracking_scope && <div className="vs-kv-wide"><dt>Track IDs</dt><dd>{m.tracking_scope}</dd></div>}
      </dl>
    </details>
  )
}

interface EvidenceReportProps {
  videoId: string
  token: string
  investigation: Investigation | null | undefined
  onCite?: (citation: AssistantCitation) => void
}

export function EvidenceReport({ videoId, token, investigation, onCite }: EvidenceReportProps) {
  const [report, setReport] = useState<AssistantReport | null>(null)
  const [topic, setTopic] = useState<AssistantReport['topic']>('summary')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function explain(next: AssistantReport['topic']) {
    setTopic(next)
    setBusy(true)
    setError('')
    try {
      setReport(await api<AssistantReport>(`/videos/${videoId}/assistant`, token, { topic: next }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Report unavailable')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cc-panel vs-panel vs-report-panel" aria-labelledby="vs-report-heading">
      <SectionHeader
        eyebrow="Stored investigation"
        title="Evidence report"
        titleId="vs-report-heading"
        action={
          investigation ? (
            <StatusBadge tone="purple">Job {investigation.job_id.slice(0, 8)}</StatusBadge>
          ) : (
            <StatusBadge tone="muted">Not available</StatusBadge>
          )
        }
      />

      {!investigation ? (
        <p className="cc-panel-footnote">
          {investigation === null
            ? 'The job completed without a stored investigation.'
            : 'An investigation is stored when an analysis job completes.'}
        </p>
      ) : (
        <>
          <p className="vs-report-summary">{investigation.summary}</p>
          <dl className="vs-report-stats vs-report-stats--3">
            <div><dt>Condition-frames</dt><dd>{investigation.total_frames}</dd></div>
            <div><dt>Frames with detections</dt><dd>{investigation.frames_with_detections}</dd></div>
            <div><dt>Accepted observations</dt><dd>{investigation.total_detections}</dd></div>
            <div><dt>Mean confidence</dt><dd>{percent(investigation.average_confidence, 1)}</dd></div>
            <div><dt>Review candidates</dt><dd>{investigation.review_candidate_count}</dd></div>
            <div>
              <dt>Miss rate</dt>
              <dd title="Unmeasured without annotated ground truth; never zero">
                {investigation.miss_rate === null ? 'Unmeasured' : percent(investigation.miss_rate, 1)}
              </dd>
            </div>
          </dl>
          <ConditionComparison investigation={investigation} />
          <RunDetails investigation={investigation} />

          <div className="vs-report-actions" role="group" aria-label="Explain verified results">
            {topics.map((item) => (
              <button
                key={item.id}
                type="button"
                className="cc-button cc-button--quiet"
                aria-pressed={report?.topic === item.id}
                disabled={busy}
                onClick={() => explain(item.id)}
              >
                <FileSearch size={13} aria-hidden="true" />
                {busy && topic === item.id ? 'Preparing…' : item.label}
              </button>
            ))}
          </div>
          {error && <p className="nw-inline-error" role="alert">{error}</p>}
          {report && (
            <div className="vs-report-body">
              <p>{report.text}</p>
              <dl className="vs-kv">
                <div><dt>Model</dt><dd>{report.evidence.model_name ?? '—'}</dd></div>
                <div><dt>Version</dt><dd className="vs-mono">{report.evidence.model_version ?? '—'}</dd></div>
                <div><dt>Frames · observations</dt><dd>{report.evidence.total_frames} · {report.evidence.total_detections}</dd></div>
                <div><dt>Mean confidence · miss rate</dt><dd>{percent(report.evidence.average_confidence, 1)} · {report.evidence.miss_rate === null ? 'unmeasured' : percent(report.evidence.miss_rate, 1)}</dd></div>
              </dl>
              {report.flagged_frame_citations.length > 0 && (
                <>
                  <span className="vs-field-label"><Quote size={12} aria-hidden="true" /> Flagged frame citations</span>
                  <ul className="vs-citations">
                    {report.flagged_frame_citations.map((citation) => (
                      <li key={citation.frame_id}>
                        <button type="button" disabled={!onCite} onClick={() => onCite?.(citation)}>
                          <span className="vs-small-mono">{formatPreciseTime(citation.timestamp_seconds)}</span>
                          <span>{conditionLabels[citation.condition]} · sample {citation.frame_number}</span>
                          <small>{citation.stored_review_reason ?? 'Review-band observation'}</small>
                          {citation.stored_detections.length > 0 && (
                            <small className="vs-citation-dets">
                              {citation.stored_detections
                                .map((d) => `${d.label} ${Math.round(d.confidence * 100)}%${d.fused_confidence != null && d.fused_confidence !== d.confidence ? `→${Math.round(d.fused_confidence * 100)}%⚡` : ''}${d.track_id === null ? '' : ` #${d.track_id}`}`)
                                .join(' · ')}
                            </small>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="cc-panel-footnote">{report.citation_scope} {report.limitations}</p>
            </div>
          )}
          <p className="cc-panel-footnote">
            Deterministic and evidence-only: no language model, no free-form answers, no emergency advice.
          </p>
        </>
      )}
    </section>
  )
}
