import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionHeader } from '../common/SectionHeader'
import { api, apiConfigured, CONDITIONS, type ExperimentRun, type Investigation } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { conditionLabels, percent } from '../../lib/footage'
import { formatReportDate } from './reportModel'

interface ExperimentRunsProps {
  /** Investigations by video ID, to link a run (by job) back to its video. */
  investigations: Record<string, Investigation | null>
  titles: Record<string, string>
}

/** Every evaluation run recorded by the worker (GET /experiments). */
export function ExperimentRuns({ investigations, titles }: ExperimentRunsProps) {
  const { token } = useAuth()
  const [runs, setRuns] = useState<ExperimentRun[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!apiConfigured || !token) return
    let active = true
    api<ExperimentRun[]>('/experiments', token)
      .then((rows) => active && setRuns(rows))
      .catch((caught: Error) => active && setError(caught.message))
    return () => {
      active = false
    }
  }, [token, Object.keys(investigations).length])

  const videoByJob = new Map(
    Object.entries(investigations)
      .filter((entry): entry is [string, Investigation] => entry[1] !== null)
      .map(([videoId, inv]) => [inv.job_id, videoId]),
  )

  return (
    <section className="cc-panel rp-history-panel" aria-labelledby="rp-experiments-heading">
      <SectionHeader
        eyebrow="Model evaluation · every run"
        title="Experiment runs"
        titleId="rp-experiments-heading"
        action={<span className="dv-result-count">{runs?.length ?? 0} <span>runs</span></span>}
      />
      {error && <p className="nw-inline-error" role="alert">{error}</p>}
      {!runs ? (
        <p className="cc-panel-footnote">{error ? '' : 'Loading runs…'}</p>
      ) : runs.length === 0 ? (
        <p className="cc-panel-footnote">No runs yet. A run is recorded each time an analysis job completes.</p>
      ) : (
        <div className="vs-table-scroll">
          <table className="vs-compare-table rp-experiments">
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col">Video</th>
                <th scope="col">Model</th>
                <th scope="col">Threshold</th>
                <th scope="col">Sampling</th>
                <th scope="col">Frames</th>
                <th scope="col">Observations by condition</th>
                <th scope="col">ms/frame</th>
                <th scope="col">Sensor ⚡</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const m = run.metrics_json ?? { by_condition: {} }
                const videoId = videoByJob.get(run.job_id)
                const conditions = CONDITIONS.filter((c) => m.by_condition?.[c])
                const inference = Object.values(m.mean_inference_ms_by_condition ?? {})
                return (
                  <tr key={run.id}>
                    <th scope="row">
                      <FlaskConical size={11} aria-hidden="true" /> {run.experiment_name}
                      <small className="rp-run-meta">{formatReportDate(run.created_at)} · job {run.job_id.slice(0, 8)}</small>
                    </th>
                    <td>
                      {videoId ? (
                        <Link to="/vision-studio" state={{ footageId: videoId, origin: 'Reports' }}>
                          {titles[videoId] ?? videoId.slice(0, 8)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td title={run.model_version}>{run.model_name}</td>
                    <td>{percent(run.detector_threshold)}{m.review_floor !== undefined ? ` / ${percent(m.review_floor)}` : ''}</td>
                    <td>{Number(run.frame_sampling_rate.toFixed(2))} fps</td>
                    <td>{run.frame_count}</td>
                    <td>
                      {conditions.map((c) => `${conditionLabels[c]} ${m.by_condition[c]!.detections}`).join(' · ') || '—'}
                    </td>
                    <td>{inference.length ? (inference.reduce((a, b) => a + b, 0) / inference.length).toFixed(0) : '—'}</td>
                    <td>
                      {m.sensor_assist
                        ? `${m.sensor_assisted_detections ?? 0} (${m.sensor_assist.seconds_with_readings} s)`
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
